import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

/**
 * Create CORS headers with credentials support for cookies
 * Uses dynamic origin for security when credentials are included
 */
function createCorsHeaders(origin: string | null): Record<string, string> {
  // Allowed origins for the application
  const allowedOrigins = [
    'https://npc-property-dashbord.lovable.app',
    'https://id-preview--7976d60b-c277-4851-889b-c170285f4be2.lovable.app',
    'http://localhost:5173',
    'http://localhost:8080',
  ];
  
  // Check if origin is allowed - support Lovable preview domains
  const allowedOrigin = origin && (
    allowedOrigins.includes(origin) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  ) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

Deno.serve(async (req) => {
  // Get origin for CORS headers
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Airtable proxy function called');

    // Get secrets from environment variables (managed by Supabase)
    const token = Deno.env.get('AIRTABLE_TOKEN');
    const baseId = Deno.env.get('AIRTABLE_BASE_ID');
    const tableName = Deno.env.get('AIRTABLE_TABLE_NAME');

    console.log('Environment check:', {
      hasToken: !!token,
      hasBaseId: !!baseId,
      hasTableName: !!tableName
    });

    if (!token || !baseId || !tableName) {
      console.error('Missing required credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Airtable credentials not configured',
          missing: {
            token: !token,
            baseId: !baseId,
            tableName: !tableName
          }
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request parameters from body (POST) or URL params (GET)
    let pageSize = '100';
    let offset = '';
    let sortField = null;
    let sortDirection = 'desc';

    if (req.method === 'POST') {
      const body = await req.json();
      pageSize = body.pageSize?.toString() || '100';
      offset = body.offset || '';
      sortField = body.sortField || null;
      sortDirection = body.sortDirection || 'desc';
    } else {
      const url = new URL(req.url);
      pageSize = url.searchParams.get('pageSize') || '100';
      offset = url.searchParams.get('offset') || '';
      sortField = url.searchParams.get('sortField') || null;
      sortDirection = url.searchParams.get('sortDirection') || 'desc';
    }

    // Build Airtable API URL
    const airtableUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    airtableUrl.searchParams.set('pageSize', pageSize);
    if (offset) {
      airtableUrl.searchParams.set('offset', offset);
    }
    // Only add sorting if sortField is specified
    if (sortField) {
      airtableUrl.searchParams.set('sort[0][field]', sortField);
      airtableUrl.searchParams.set('sort[0][direction]', sortDirection);
    }

    console.log('Making request to Airtable:', airtableUrl.toString());

    // Make request to Airtable
    const airtableResponse = await fetch(airtableUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.error('Airtable API error:', airtableResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Airtable API error: ${airtableResponse.status}`,
          details: errorText
        }),
        { 
          status: airtableResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data: AirtableResponse = await airtableResponse.json();
    console.log(`Successfully fetched ${data.records.length} records from Airtable`);

    // Transform the data to match the expected format
    console.log('Transforming record example:', data.records[0]?.fields);
    console.log('Zipcode field value:', data.records[0]?.fields?.Zipcode);
    const transformedRecords = data.records.map(record => {
      const fields = record.fields;
      
      // Enhanced data cleaning and normalization
      const cleanPrice = (price: any): number | null => {
        if (!price) return null;
        const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : price;
        return numPrice > 0 && numPrice < 50000000 ? numPrice : null; // Filter unrealistic prices
      };

      const normalizeConfidence = (confidence: any): number | null => {
        if (!confidence) return null;
        const numConf = typeof confidence === 'string' ? parseFloat(confidence) : confidence;
        if (numConf >= 0 && numConf <= 1) return numConf; // Already normalized
        if (numConf >= 0 && numConf <= 100) return numConf / 100; // Convert percentage
        return null;
      };

      const standardizePropertyType = (type: string | undefined): string => {
        if (!type) return 'Unknown';
        const normalized = type.toLowerCase().trim();
        if (normalized.includes('apartment') || normalized.includes('unit')) return 'Apartment';
        if (normalized.includes('house') || normalized.includes('home')) return 'House';
        if (normalized.includes('townhouse') || normalized.includes('town house')) return 'Townhouse';
        if (normalized.includes('villa')) return 'Villa';
        if (normalized.includes('duplex')) return 'Duplex';
        if (normalized.includes('land')) return 'Land';
        return type; // Return original if no match
      };

      const standardizeSuburb = (suburb: string | undefined): string => {
        if (!suburb) return 'Unknown Suburb';
        return suburb.split(',')[0].trim(); // Remove state/postcode if present
      };

      // Enhanced date handling with multiple fallback options
      const getValidDate = (): string => {
        const candidates = [
          fields['Created'], // Primary field name in Airtable
          fields['Created At'],
          fields['Listed_Date'],
          fields['Date_Listed'],
          record.createdTime
        ];
        
        for (const candidate of candidates) {
          if (candidate) {
            try {
              const date = new Date(candidate);
              if (!isNaN(date.getTime())) return date.toISOString();
            } catch (e) {
              continue;
            }
          }
        }
        return new Date().toISOString(); // Fallback to now
      };

      return {
        id: record.id,
        fields: fields,
        createdTime: getValidDate(),
        
        // Core property information with enhanced mapping
        title: fields.Address || fields.Property_Title || fields.Title || 'Untitled Property',
        price: cleanPrice(fields.Price || fields.Asking_Price),
        location: `${fields.Address || ''}, ${standardizeSuburb(fields.Suburb)}`.replace(/^, |, $/, '') || 'Location not specified',
        address: fields.Address || 'Unknown Address',
        suburb: standardizeSuburb(fields.Suburb),
        
        // Property details with data validation
        beds: Math.max(0, parseInt(String(fields.Beds || fields.Bedrooms || fields.Bedroom_Count || 0))) || null,
        baths: Math.max(0, parseInt(String(fields.Baths || fields.Bathrooms || fields.Bathroom_Count || 0))) || null,
        bedrooms: Math.max(0, parseInt(String(fields.Beds || fields.Bedrooms || fields.Bedroom_Count || 0))) || null,
        bathrooms: Math.max(0, parseInt(String(fields.Baths || fields.Bathrooms || fields.Bathroom_Count || 0))) || null,
        carSpaces: Math.max(0, parseInt(String(fields['Car Spaces'] || fields.Car_Spaces || 0))) || null,
        
        propertyType: standardizePropertyType(fields['Property Type'] || fields.Property_Type),
        listingDate: getValidDate(),
        status: fields.Status || 'Available',
        
        // Quality and confidence metrics
        confidence: normalizeConfidence(fields['Confidence Score'] || fields.Confidence_Score || fields.Confidence),
        source: fields.Source || fields.Data_Source || 'Airtable',
        
        // Agent and agency information - FIXED MAPPING
        agent: fields['Agent Name'] || fields.Agent || fields.Listing_Agent || 'Unknown Agent',
        agentName: fields['Agent Name'] || fields.Agent || fields.Listing_Agent || 'Unknown Agent',
        agencyName: fields['Agency Name'] || fields.Agency || fields['Agent Agency'] || 'Unknown Agency',
        agentPhone: fields['Agent Phone'] || null,
        
        // Additional details
        createdAt: getValidDate(),
        receivedAt: getValidDate(),
        description: fields['Property Description'] || fields.Description || fields.Summary || '',
        images: fields.Images || fields.Property_Images || [],
        features: fields.Features || fields.Property_Features || [],
        
        // Location details
        landSize: fields['Square Feet'] || fields['Land Size'] || fields.Land_Size || fields.LandSize || null,
        lotNumber: fields['Lot Number'] || null,
        webLinks: fields['Web Link'] || null,
        state: fields['State'] || null,
        zipCode: fields['Zipcode'] || fields['Zip Code'] || fields['Post Code'] || fields['Postcode'] || null,
        
        // Additional metadata
        summary: fields.Summary || null,
        keyEntities: fields['Key Entities'] || null,
        rawExtract: fields['Raw Extract'] || null,
        category: fields.Category || null,
        inspectionStart: fields['Inspection Start'] ? new Date(fields['Inspection Start']) : null,
        inspectionEnd: fields['Inspection End'] ? new Date(fields['Inspection End']) : null,
        inspectionNotes: fields['Inspection Notes'] || null,
        floorplans: fields.Floorplans || [],
      };
    });

    // Enhanced scoring system with weighted fields and quality penalties
    const calculateEnrichmentScore = (record: any): number => {
      let score = 0;
      
      // Critical property info (weighted higher) - 35 points max
      if (record.price && record.price > 0) score += 10; // Most important
      if (record.address && record.address !== 'Unknown Address') score += 8;
      if (record.suburb && record.suburb !== 'Unknown Suburb') score += 7; 
      if (record.beds && record.beds > 0) score += 5;
      if (record.baths && record.baths > 0) score += 5;
      
      // Property details - 20 points max
      if (record.propertyType && record.propertyType !== 'Unknown') score += 4;
      if (record.carSpaces && record.carSpaces > 0) score += 3;
      if (record.landSize) score += 3;
      if (record.state) score += 3;
      if (record.zipCode) score += 3;
      if (record.lotNumber) score += 2;
      if (record.status && record.status !== 'Available') score += 2;
      
      // Agent and agency info - 15 points max
      if (record.agentName && record.agentName !== 'Unknown Agent') score += 6;
      if (record.agencyName && record.agencyName !== 'Unknown Agency') score += 5;
      if (record.agentPhone) score += 4;
      
      // Rich content and media - 20 points max
      if (record.description && record.description.length > 100) score += 6;
      else if (record.description && record.description.length > 50) score += 3;
      if (record.summary && record.summary.length > 50) score += 4;
      if (record.images && record.images.length > 0) score += 4;
      if (record.floorplans && record.floorplans.length > 0) score += 3;
      if (record.keyEntities) score += 3;
      
      // Inspection and timing details - 10 points max
      if (record.inspectionStart) score += 4;
      if (record.inspectionEnd) score += 3;
      if (record.inspectionNotes) score += 3;
      
      // Quality and confidence metrics - 10 points max
      if (record.confidence && record.confidence > 0.8) score += 5;
      else if (record.confidence && record.confidence > 0.6) score += 3;
      else if (record.confidence && record.confidence > 0.4) score += 1;
      if (record.webLinks) score += 2;
      if (record.rawExtract && record.rawExtract.length > 200) score += 3;
      
      // Quality penalties (subtract points for poor data)
      if (record.address === 'Unknown Address') score -= 5;
      if (record.suburb === 'Unknown Suburb') score -= 3;
      if (record.agentName === 'Unknown Agent') score -= 2;
      if (record.agencyName === 'Unknown Agency') score -= 2;
      if (!record.price || record.price <= 0) score -= 8;
      
      return Math.max(0, score); // Ensure non-negative score
    };

    // Multi-strategy deduplication with fuzzy matching
    const normalizeForDuplication = (str: string | undefined | null): string => {
      if (!str) return 'unknown';
      return str.toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|pl|place)\b/g, '') // Remove street suffixes
        .trim();
    };

    // Calculate Levenshtein distance for fuzzy matching
    const levenshteinDistance = (str1: string, str2: string): number => {
      const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
      for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
      for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
      for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
          const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1, // deletion
            matrix[j - 1][i] + 1, // insertion
            matrix[j - 1][i - 1] + indicator // substitution
          );
        }
      }
      return matrix[str2.length][str1.length];
    };

    // Check if two addresses are similar (fuzzy match)
    const areAddressesSimilar = (addr1: string, addr2: string): boolean => {
      const norm1 = normalizeForDuplication(addr1);
      const norm2 = normalizeForDuplication(addr2);
      
      if (norm1 === norm2) return true;
      if (norm1 === 'unknown' || norm2 === 'unknown') return false;
      
      const distance = levenshteinDistance(norm1, norm2);
      const maxLength = Math.max(norm1.length, norm2.length);
      const similarity = 1 - (distance / maxLength);
      
      return similarity >= 0.85; // 85% similarity threshold
    };

    // Group listings using multiple strategies
    const listingGroups = new Map();
    const processedRecords = new Set();
    
    // First pass: Calculate enrichment scores
    for (const record of transformedRecords) {
      (record as any).enrichmentScore = calculateEnrichmentScore(record);
    }
    
    // Second pass: Group similar listings
    for (let i = 0; i < transformedRecords.length; i++) {
      if (processedRecords.has(i)) continue;
      
      const currentRecord = transformedRecords[i];
      const group = [currentRecord];
      processedRecords.add(i);
      
      // Look for similar listings
      for (let j = i + 1; j < transformedRecords.length; j++) {
        if (processedRecords.has(j)) continue;
        
        const compareRecord = transformedRecords[j];
        let isDuplicate = false;
        
        // Strategy 1: Exact match on normalized address + suburb
        const addr1 = normalizeForDuplication(currentRecord.address);
        const addr2 = normalizeForDuplication(compareRecord.address);
        const suburb1 = normalizeForDuplication(currentRecord.suburb);
        const suburb2 = normalizeForDuplication(compareRecord.suburb);
        
        if (addr1 !== 'unknown' && addr2 !== 'unknown' && addr1 === addr2 && suburb1 === suburb2) {
          isDuplicate = true;
        }
        
        // Strategy 2: Fuzzy address match + same suburb
        if (!isDuplicate && areAddressesSimilar(currentRecord.address, compareRecord.address) && suburb1 === suburb2) {
          isDuplicate = true;
        }
        
        // Strategy 3: Same zipcode + similar beds/baths + similar property type (for cases with poor address data)
        if (!isDuplicate && 
            currentRecord.zipCode && compareRecord.zipCode && 
            currentRecord.zipCode === compareRecord.zipCode &&
            currentRecord.beds === compareRecord.beds &&
            currentRecord.baths === compareRecord.baths &&
            normalizeForDuplication(currentRecord.propertyType) === normalizeForDuplication(compareRecord.propertyType) &&
            currentRecord.propertyType !== 'Unknown') {
          isDuplicate = true;
        }
        
        if (isDuplicate) {
          group.push(compareRecord);
          processedRecords.add(j);
        }
      }
      
      // Create a key for this group (for logging purposes)
      const groupKey = `${normalizeForDuplication(currentRecord.address)}|${normalizeForDuplication(currentRecord.suburb)}|${currentRecord.beds || 'unknown'}|${currentRecord.baths || 'unknown'}`;
      listingGroups.set(groupKey, group);
    }
    
    // Select the best record from each group with enhanced selection logic
    const deduplicatedRecords = [];
    let duplicatesFound = 0;
    let totalGroups = 0;
    
    for (const [key, records] of listingGroups.entries()) {
      totalGroups++;
      
      if (records.length > 1) {
        duplicatesFound += records.length - 1;
        
        // Sort by enrichment score (highest first), then by creation date (newest first)
        records.sort((a: any, b: any) => {
          const scoreDiff = b.enrichmentScore - a.enrichmentScore;
          if (scoreDiff !== 0) return scoreDiff;
          
          // If scores are tied, prefer listings with more recent data
          const dateA = new Date(a.createdTime).getTime();
          const dateB = new Date(b.createdTime).getTime();
          return dateB - dateA;
        });
        
        const selected = records[0];
        const scores = records.map((r: any) => r.enrichmentScore).join(', ');
        console.log(`Duplicate group "${key.substring(0, 50)}...": ${records.length} records (scores: ${scores}), selected score ${selected.enrichmentScore}`);
      }
      
      deduplicatedRecords.push(records[0]);
    }
    
    console.log(`Deduplication summary: ${totalGroups} unique groups, ${duplicatesFound} duplicates removed from ${transformedRecords.length} total records`);
    
    if (duplicatesFound > 0) {
      console.log(`✅ Removed ${duplicatesFound} duplicate listings, prioritizing enriched data quality`);
    }

    return new Response(
      JSON.stringify({
        records: deduplicatedRecords,
        offset: data.offset,
        total: deduplicatedRecords.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error in airtable-proxy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});