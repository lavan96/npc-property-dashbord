import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedPropertyData {
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  price?: number;
  weeklyRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  carSpaces?: number;
  landSize?: number;
  buildSize?: number;
  propertyType?: string;
  landPrice?: number;
  buildPrice?: number;
  isNewBuild?: boolean;
  // Extended fields for pre-generation overrides
  councilRates?: number;
  waterRates?: number;
  strataFees?: number;
  insuranceEstimate?: number;
  propertyManagementPercent?: number;
  yearBuilt?: number;
  stampDuty?: number;
  agentFee?: number;
}

interface StructuredPropertyPayload {
  propertyAddress: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  purchasePrice?: number;
  weeklyRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  carSpaces?: number;
  landSize?: number;
  buildSize?: number;
  propertyType?: string;
  landPrice?: number;
  buildPrice?: number;
  isNewBuild: boolean;
  // Extended fields
  councilRates?: number;
  waterRates?: number;
  strataFees?: number;
  insuranceEstimate?: number;
  propertyManagementPercent?: number;
  yearBuilt?: number;
  stampDuty?: number;
  agentFee?: number;
}

interface PageImage {
  pageNumber: number;
  base64: string;
  width: number;
  height: number;
}

// ============= GPT-4o VISION EXTRACTION =============

async function extractWithVision(
  images: PageImage[], 
  openaiKey: string, 
  fileName: string
): Promise<ExtractedPropertyData> {
  console.log(`🔍 Analyzing ${images.length} page images with GPT-4o Vision...`);
  
  const systemPrompt = `You are an expert at extracting property details from Australian real estate documents and brochures.
Analyze the provided images carefully. These are pages from a property brochure or listing document.

Extract ALL property information you can find, including:
- Full street address (including lot numbers like "Lot 123")
- Suburb name
- State (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)  
- Postcode (4-digit Australian format)
- Property/package price or total price
- Weekly rent estimate if mentioned
- Number of bedrooms, bathrooms, car spaces
- Land size in sqm (look for dimensions or "m²")
- Building/floor size in sqm
- Property type (house, apartment, townhouse, land, house & land package)
- For house & land packages: separate land and build prices
- Whether it's a new build (look for "house and land", "new home", "off the plan", "build contract", builder logos, etc.)

ALSO EXTRACT these financial details if mentioned:
- Council rates (annual amount)
- Water rates (annual amount)
- Strata/body corporate fees (annual amount)
- Building/landlord insurance estimate (annual amount)
- Property management fee (as percentage, usually 6-10%)
- Year built or construction year
- Stamp duty amount if calculated
- Agent/buyer's agent fee if mentioned

Pay special attention to:
- Header/hero sections with address and key features
- Floorplans that show dimensions
- Price breakdowns showing land + build costs
- Feature lists and specifications
- Financial summaries or cost breakdowns
- Agent contact information that might include suburb/area

Return ONLY valid JSON with these exact fields (use null for values not found).`;

  const userContent: any[] = [
    {
      type: "text",
      text: `Extract all property details from these ${images.length} page(s) of the document "${fileName}".

Return JSON format:
{
  "address": "full street address including lot number",
  "suburb": "suburb name only",
  "state": "state abbreviation (NSW/VIC/QLD/WA/SA/TAS/ACT/NT)",
  "postcode": "4-digit postcode",
  "price": numeric total price (no $ or commas),
  "weeklyRent": numeric weekly rent,
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": numeric land size in sqm,
  "buildSize": numeric building size in sqm,
  "propertyType": "house" or "apartment" or "townhouse" or "land" or "house_and_land",
  "landPrice": numeric land component price,
  "buildPrice": numeric build component price,
  "isNewBuild": true if new build or house and land package,
  "councilRates": numeric annual council rates,
  "waterRates": numeric annual water rates,
  "strataFees": numeric annual strata/body corp fees,
  "insuranceEstimate": numeric annual insurance,
  "propertyManagementPercent": numeric percentage (e.g., 8 for 8%),
  "yearBuilt": numeric year of construction,
  "stampDuty": numeric stamp duty amount,
  "agentFee": numeric agent/buyer's agent fee
}`
    }
  ];

  // Add all page images
  for (const image of images) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${image.base64}`,
        detail: "high" // Use high detail for better text extraction
      }
    });
    console.log(`📷 Added page ${image.pageNumber} image (${image.width}x${image.height})`);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI Vision API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('📝 GPT-4o Vision response:', content);
    
    // Parse JSON from response
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    console.log('✅ Parsed Vision result:', JSON.stringify(parsed, null, 2));
    
    return {
      address: parsed.address || undefined,
      suburb: parsed.suburb || undefined,
      state: parsed.state || undefined,
      postcode: parsed.postcode?.toString() || undefined,
      price: parsed.price || undefined,
      weeklyRent: parsed.weeklyRent || undefined,
      bedrooms: parsed.bedrooms || undefined,
      bathrooms: parsed.bathrooms || undefined,
      carSpaces: parsed.carSpaces || undefined,
      landSize: parsed.landSize || undefined,
      buildSize: parsed.buildSize || undefined,
      propertyType: parsed.propertyType || undefined,
      landPrice: parsed.landPrice || undefined,
      buildPrice: parsed.buildPrice || undefined,
      isNewBuild: parsed.isNewBuild || false,
      // Extended fields
      councilRates: parsed.councilRates || undefined,
      waterRates: parsed.waterRates || undefined,
      strataFees: parsed.strataFees || undefined,
      insuranceEstimate: parsed.insuranceEstimate || undefined,
      propertyManagementPercent: parsed.propertyManagementPercent || undefined,
      yearBuilt: parsed.yearBuilt || undefined,
      stampDuty: parsed.stampDuty || undefined,
      agentFee: parsed.agentFee || undefined,
    };
    
  } catch (error) {
    console.error('❌ Vision extraction error:', error);
    throw error;
  }
}

// ============= SINGLE IMAGE EXTRACTION =============

async function extractFromSingleImage(
  base64: string,
  mimeType: string,
  openaiKey: string,
  fileName: string
): Promise<ExtractedPropertyData> {
  console.log(`🔍 Analyzing single image with GPT-4o Vision...`);
  
  const systemPrompt = `You are an expert at extracting property details from Australian real estate documents.
Extract ALL property information from this image including financial details like rates, fees, and insurance.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            {
              type: "text",
              text: `Extract property details from this image "${fileName}". Return JSON:
{
  "address": "full street address",
  "suburb": "suburb name",
  "state": "state abbreviation",
  "postcode": "4-digit postcode",
  "price": numeric price,
  "weeklyRent": numeric weekly rent,
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": numeric sqm,
  "buildSize": numeric sqm,
  "propertyType": "house/apartment/townhouse/land",
  "landPrice": numeric,
  "buildPrice": numeric,
  "isNewBuild": boolean,
  "councilRates": numeric annual,
  "waterRates": numeric annual,
  "strataFees": numeric annual,
  "insuranceEstimate": numeric annual,
  "propertyManagementPercent": numeric percentage,
  "yearBuilt": numeric year,
  "stampDuty": numeric,
  "agentFee": numeric
}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OpenAI Vision API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  console.log('📝 Single image Vision response:', content);
  
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }
  
  const parsed = JSON.parse(jsonStr);
  
  return {
    address: parsed.address || undefined,
    suburb: parsed.suburb || undefined,
    state: parsed.state || undefined,
    postcode: parsed.postcode?.toString() || undefined,
    price: parsed.price || undefined,
    weeklyRent: parsed.weeklyRent || undefined,
    bedrooms: parsed.bedrooms || undefined,
    bathrooms: parsed.bathrooms || undefined,
    carSpaces: parsed.carSpaces || undefined,
    landSize: parsed.landSize || undefined,
    buildSize: parsed.buildSize || undefined,
    propertyType: parsed.propertyType || undefined,
    landPrice: parsed.landPrice || undefined,
    buildPrice: parsed.buildPrice || undefined,
    isNewBuild: parsed.isNewBuild || false,
    // Extended fields
    councilRates: parsed.councilRates || undefined,
    waterRates: parsed.waterRates || undefined,
    strataFees: parsed.strataFees || undefined,
    insuranceEstimate: parsed.insuranceEstimate || undefined,
    propertyManagementPercent: parsed.propertyManagementPercent || undefined,
    yearBuilt: parsed.yearBuilt || undefined,
    stampDuty: parsed.stampDuty || undefined,
    agentFee: parsed.agentFee || undefined,
  };
}

// ============= STRUCTURED PAYLOAD =============

function processToStructuredPayload(extractedData: ExtractedPropertyData): StructuredPropertyPayload {
  let propertyAddress = '';
  
  if (extractedData.address) {
    propertyAddress = extractedData.address;
  }
  
  // Build full address if we have components
  const addressParts: string[] = [];
  
  if (extractedData.suburb && !propertyAddress.toLowerCase().includes(extractedData.suburb.toLowerCase())) {
    addressParts.push(extractedData.suburb);
  }
  
  if (extractedData.state && !propertyAddress.toUpperCase().includes(extractedData.state)) {
    addressParts.push(extractedData.state);
  }
  
  if (extractedData.postcode && !propertyAddress.includes(extractedData.postcode)) {
    addressParts.push(extractedData.postcode);
  }
  
  if (addressParts.length > 0) {
    propertyAddress = propertyAddress 
      ? `${propertyAddress}, ${addressParts.join(' ')}` 
      : addressParts.join(', ');
  }
  
  return {
    propertyAddress: propertyAddress || 'Address Not Found',
    suburb: extractedData.suburb,
    state: extractedData.state,
    postcode: extractedData.postcode,
    purchasePrice: extractedData.price,
    weeklyRent: extractedData.weeklyRent,
    bedrooms: extractedData.bedrooms,
    bathrooms: extractedData.bathrooms,
    carSpaces: extractedData.carSpaces,
    landSize: extractedData.landSize,
    buildSize: extractedData.buildSize,
    propertyType: extractedData.propertyType,
    landPrice: extractedData.landPrice,
    buildPrice: extractedData.buildPrice,
    isNewBuild: extractedData.isNewBuild || false,
    // Extended fields
    councilRates: extractedData.councilRates,
    waterRates: extractedData.waterRates,
    strataFees: extractedData.strataFees,
    insuranceEstimate: extractedData.insuranceEstimate,
    propertyManagementPercent: extractedData.propertyManagementPercent,
    yearBuilt: extractedData.yearBuilt,
    stampDuty: extractedData.stampDuty,
    agentFee: extractedData.agentFee,
  };
}

// ============= GOOGLE MAPS GEOCODING =============

async function completeAddressWithGoogleMaps(
  payload: StructuredPropertyPayload,
  googleMapsApiKey: string,
  originalExtractedAddress: string | undefined
): Promise<StructuredPropertyPayload> {
  // CRITICAL: Preserve the original extracted street address
  // Geocoding should ONLY fill in missing suburb/state/postcode, NOT replace the street address
  const originalStreetAddress = originalExtractedAddress || payload.propertyAddress;
  
  // Don't geocode if we have all the key components
  if (payload.suburb && payload.state && payload.postcode) {
    console.log('✅ All address components present, skipping geocoding');
    // Still build a proper full address using all components
    payload.propertyAddress = buildFullAddress(originalStreetAddress, payload.suburb, payload.state, payload.postcode);
    return payload;
  }
  
  // Don't geocode if address is too generic
  if (!payload.propertyAddress || payload.propertyAddress === 'Address Not Found') {
    return payload;
  }
  
  // Check if address is just a lot number (too generic for geocoding alone)
  if (/^Lot\s+\d+$/i.test(payload.propertyAddress.trim())) {
    console.log('⚠️ Address is just a lot number, skipping geocoding');
    return payload;
  }
  
  const parts: string[] = [payload.propertyAddress];
  
  if (!payload.propertyAddress.toLowerCase().includes('australia')) {
    parts.push('Australia');
  }
  
  const searchQuery = parts.join(', ');
  console.log('🗺️ Geocoding search query:', searchQuery);
  
  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${googleMapsApiKey}&region=au&components=country:AU`;
    
    const response = await fetch(geocodeUrl);
    
    if (!response.ok) {
      console.error('Google Maps API error:', response.status);
      return payload;
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No geocoding results. Status:', data.status);
      return payload;
    }
    
    const result = data.results[0];
    const types = result.types || [];
    
    // Reject results that are too generic (country or state level)
    if (types.includes('country') || 
        (types.includes('administrative_area_level_1') && !types.includes('locality'))) {
      console.log('⚠️ Geocoding result too generic (country/state level), keeping original');
      return payload;
    }
    
    console.log('✅ Geocoding result (for components only):', result.formatted_address);
    
    // Extract address components from geocoding - but DON'T overwrite the street address
    let geocodedSuburb = payload.suburb;
    let geocodedState = payload.state;
    let geocodedPostcode = payload.postcode;
    
    for (const component of result.address_components) {
      const componentTypes = component.types;
      
      if ((componentTypes.includes('locality') || componentTypes.includes('sublocality')) && !geocodedSuburb) {
        geocodedSuburb = component.long_name;
      } else if (componentTypes.includes('administrative_area_level_1') && !geocodedState) {
        geocodedState = component.short_name;
      } else if (componentTypes.includes('postal_code') && !geocodedPostcode) {
        geocodedPostcode = component.long_name;
      }
    }
    
    // Update payload with geocoded components
    payload.suburb = geocodedSuburb || payload.suburb;
    payload.state = geocodedState || payload.state;
    payload.postcode = geocodedPostcode || payload.postcode;
    
    // CRITICAL: Build the full address preserving the original street address
    payload.propertyAddress = buildFullAddress(
      originalStreetAddress, 
      payload.suburb, 
      payload.state, 
      payload.postcode
    );
    
    console.log('✅ Final composed address:', payload.propertyAddress);
    
  } catch (error) {
    console.error('Google Maps geocoding error:', error);
  }
  
  return payload;
}

// Helper to build full address while preserving street address
function buildFullAddress(
  streetAddress: string | undefined,
  suburb: string | undefined,
  state: string | undefined,
  postcode: string | undefined
): string {
  const parts: string[] = [];
  
  // Start with street address
  if (streetAddress && streetAddress !== 'Address Not Found') {
    // Clean up the street address - remove any suburb/state/postcode already in it
    let cleanStreet = streetAddress;
    if (suburb) {
      cleanStreet = cleanStreet.replace(new RegExp(`,?\\s*${suburb}`, 'gi'), '');
    }
    if (state) {
      cleanStreet = cleanStreet.replace(new RegExp(`,?\\s*${state}\\b`, 'gi'), '');
    }
    if (postcode) {
      cleanStreet = cleanStreet.replace(new RegExp(`,?\\s*${postcode}`, 'g'), '');
    }
    cleanStreet = cleanStreet.replace(/,\s*Australia$/i, '').replace(/,\s*,/g, ',').replace(/,\s*$/,'').trim();
    
    if (cleanStreet) {
      parts.push(cleanStreet);
    }
  }
  
  // Add suburb
  if (suburb) {
    parts.push(suburb);
  }
  
  // Add state and postcode together
  if (state && postcode) {
    parts.push(`${state} ${postcode}`);
  } else if (state) {
    parts.push(state);
  } else if (postcode) {
    parts.push(postcode);
  }
  
  return parts.join(', ') || 'Address Not Found';
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  console.log('🏠 Parse property PDF function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json();
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[parse-property-pdf] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[parse-property-pdf] Authenticated user: ${userId}`);
    const { 
      pageImages,        // Array of page images from client-side PDF rendering
      singleImage,       // Single image file (for direct image uploads)
      imageMimeType,     // MIME type for single image
      fileName,
      base64Content,     // Legacy: raw base64 PDF (fallback)
    } = body;
    
    const fileNameToUse = fileName || 'document.pdf';
    console.log('📄 Processing:', fileNameToUse);
    
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    
    let extractedData: ExtractedPropertyData;
    let extractionMethod = 'unknown';
    
    // Method 1: Page images from client-side PDF rendering (PREFERRED)
    if (pageImages && Array.isArray(pageImages) && pageImages.length > 0) {
      console.log(`📚 Received ${pageImages.length} page images from client`);
      extractedData = await extractWithVision(pageImages, openaiKey, fileNameToUse);
      extractionMethod = 'gpt-4o-vision-pages';
    }
    // Method 2: Single image file
    else if (singleImage && imageMimeType) {
      console.log('🖼️ Processing single image file');
      extractedData = await extractFromSingleImage(singleImage, imageMimeType, openaiKey, fileNameToUse);
      extractionMethod = 'gpt-4o-vision-image';
    }
    // Method 3: Legacy fallback - raw PDF base64 (will fail for vision, kept for compatibility)
    else if (base64Content) {
      console.error('❌ Raw PDF base64 received - client must render pages to images first');
      return new Response(JSON.stringify({
        success: false,
        error: 'PDF must be converted to images on the client before sending. Please ensure PDF.js rendering is working.',
        hint: 'The client should use convertPdfToImages() to render PDF pages as PNG images before calling this function.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No valid content provided. Send pageImages (array of rendered PDF pages) or singleImage (for image files).' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📊 Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // CRITICAL: Preserve the original street address from GPT-4o extraction
    const originalExtractedStreetAddress = extractedData.address;
    console.log('📍 Original extracted street address:', originalExtractedStreetAddress);
    
    // Process into structured payload
    let structuredPayload = processToStructuredPayload(extractedData);
    
    // Complete address with Google Maps if needed (fills in suburb/state/postcode)
    const needsGeocoding = !structuredPayload.postcode || 
                          !structuredPayload.state || 
                          !structuredPayload.suburb;
    
    if (googleMapsApiKey && needsGeocoding && 
        structuredPayload.propertyAddress !== 'Address Not Found') {
      console.log('🗺️ Attempting to complete address with Google Maps...');
      // Pass original street address so it doesn't get overwritten
      structuredPayload = await completeAddressWithGoogleMaps(
        structuredPayload, 
        googleMapsApiKey, 
        originalExtractedStreetAddress
      );
    } else if (structuredPayload.suburb && structuredPayload.state && structuredPayload.postcode) {
      // Even without geocoding, ensure we build a proper full address
      structuredPayload.propertyAddress = buildFullAddress(
        originalExtractedStreetAddress,
        structuredPayload.suburb,
        structuredPayload.state,
        structuredPayload.postcode
      );
      console.log('✅ Built full address without geocoding:', structuredPayload.propertyAddress);
    }

    console.log('✅ Final structured payload:', JSON.stringify(structuredPayload, null, 2));

    return new Response(JSON.stringify({
      success: true,
      extractedData: {
        extractedAddress: structuredPayload.propertyAddress,
        extractedSuburb: structuredPayload.suburb,
        extractedState: structuredPayload.state,
        extractedPostcode: structuredPayload.postcode,
        extractedPrice: structuredPayload.purchasePrice,
        extractedRent: structuredPayload.weeklyRent,
        extractedBedrooms: structuredPayload.bedrooms,
        extractedBathrooms: structuredPayload.bathrooms,
        extractedCarSpaces: structuredPayload.carSpaces,
        extractedLandSize: structuredPayload.landSize,
        extractedBuildSize: structuredPayload.buildSize,
        extractedPropertyType: structuredPayload.propertyType,
        extractedLandPrice: structuredPayload.landPrice,
        extractedBuildPrice: structuredPayload.buildPrice,
        isNewBuild: structuredPayload.isNewBuild,
      },
      structuredPayload,
      extractionMethod,
      metadata: {
        fileName: fileNameToUse,
        processedAt: new Date().toISOString(),
        pagesAnalyzed: pageImages?.length || (singleImage ? 1 : 0),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in parse-property-pdf:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to parse document',
      details: 'If this error persists, try uploading a clearer image or a different PDF.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
