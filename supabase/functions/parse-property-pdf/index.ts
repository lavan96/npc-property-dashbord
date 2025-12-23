import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

Pay special attention to:
- Header/hero sections with address and key features
- Floorplans that show dimensions
- Price breakdowns showing land + build costs
- Feature lists and specifications
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
  "isNewBuild": true if new build or house and land package
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
Extract ALL property information from this image.`;

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
  "isNewBuild": boolean
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
      max_tokens: 2000,
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
  };
}

// ============= GOOGLE MAPS GEOCODING =============

async function completeAddressWithGoogleMaps(
  payload: StructuredPropertyPayload,
  googleMapsApiKey: string
): Promise<StructuredPropertyPayload> {
  // Don't geocode if we have all the key components
  if (payload.suburb && payload.state && payload.postcode) {
    console.log('✅ All address components present, skipping geocoding');
    return payload;
  }
  
  // Don't geocode if address is too generic
  if (!payload.propertyAddress || payload.propertyAddress === 'Address Not Found') {
    return payload;
  }
  
  // Check if address is just a lot number (too generic)
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
    
    console.log('✅ Geocoding result:', result.formatted_address);
    payload.propertyAddress = result.formatted_address;
    
    // Extract address components
    for (const component of result.address_components) {
      const componentTypes = component.types;
      
      if ((componentTypes.includes('locality') || componentTypes.includes('sublocality')) && !payload.suburb) {
        payload.suburb = component.long_name;
      } else if (componentTypes.includes('administrative_area_level_1') && !payload.state) {
        payload.state = component.short_name;
      } else if (componentTypes.includes('postal_code') && !payload.postcode) {
        payload.postcode = component.long_name;
      }
    }
    
  } catch (error) {
    console.error('Google Maps geocoding error:', error);
  }
  
  return payload;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  console.log('🏠 Parse property PDF function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
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
    
    // Process into structured payload
    let structuredPayload = processToStructuredPayload(extractedData);
    
    // Complete address with Google Maps if needed
    const needsGeocoding = !structuredPayload.postcode || 
                          !structuredPayload.state || 
                          !structuredPayload.suburb;
    
    if (googleMapsApiKey && needsGeocoding && 
        structuredPayload.propertyAddress !== 'Address Not Found') {
      console.log('🗺️ Attempting to complete address with Google Maps...');
      structuredPayload = await completeAddressWithGoogleMaps(structuredPayload, googleMapsApiKey);
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
