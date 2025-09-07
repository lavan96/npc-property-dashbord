import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
          fields['ReceivedAt'],
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

    // Remove duplicates based on address, price, and property details
    const deduplicatedRecords = [];
    const seenListings = new Set();
    
    for (const record of transformedRecords) {
      // Create a unique key based on core property characteristics
      const duplicateKey = [
        record.address?.toLowerCase().trim(),
        record.price,
        record.beds,
        record.baths,
        record.propertyType?.toLowerCase()
      ].join('|');
      
      if (!seenListings.has(duplicateKey)) {
        seenListings.add(duplicateKey);
        deduplicatedRecords.push(record);
      }
    }
    
    const removedCount = transformedRecords.length - deduplicatedRecords.length;
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} duplicate listings`);
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
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});