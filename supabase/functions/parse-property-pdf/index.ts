import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

// ============= GPT-4O VISION EXTRACTION =============

async function extractWithVision(base64Content: string, openaiKey: string, fileName: string): Promise<ExtractedPropertyData> {
  console.log('Calling GPT-4o Vision for PDF analysis...');
  
  const systemPrompt = `You are an expert at extracting property details from Australian real estate documents and brochures.
Analyze the PDF/image content and extract all property information you can find.
Look for:
- Full street address including lot numbers
- Suburb name
- State (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)
- Postcode (4 digits)
- Total price or package price
- Weekly rent if mentioned
- Number of bedrooms, bathrooms, car spaces
- Land size in sqm
- Building/floor size in sqm
- Property type (house, apartment, townhouse, land)
- For house & land packages: separate land price and build price
- Whether it's a new build or existing property

Return ONLY valid JSON with these exact fields (use null for values not found):
{
  "address": "full street address including lot number if applicable",
  "suburb": "suburb name",
  "state": "state abbreviation",
  "postcode": "4-digit postcode",
  "price": numeric total price without $ or commas,
  "weeklyRent": numeric weekly rent,
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": numeric land size in sqm,
  "buildSize": numeric building size in sqm,
  "propertyType": "house" | "apartment" | "townhouse" | "land",
  "landPrice": numeric land component price for new builds,
  "buildPrice": numeric build component price for new builds,
  "isNewBuild": true if new build or house and land package
}`;

  try {
    // Determine the MIME type based on content
    let mimeType = 'application/pdf';
    if (base64Content.startsWith('/9j/')) {
      mimeType = 'image/jpeg';
    } else if (base64Content.startsWith('iVBOR')) {
      mimeType = 'image/png';
    }
    
    console.log('Using MIME type:', mimeType);
    console.log('Base64 content length:', base64Content.length);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: systemPrompt
          },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: `Please analyze this Australian property document (${fileName}) and extract all property details. Return the data as JSON.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Content}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GPT-4o Vision API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('GPT-4o Vision response:', content);
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    console.log('Parsed vision extraction:', JSON.stringify(parsed, null, 2));
    
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
    console.error('Error calling GPT-4o Vision:', error);
    throw error;
  }
}

// ============= FALLBACK TEXT EXTRACTION =============

// Use OpenAI to extract structured data from text (fallback)
async function extractWithAI(text: string, openaiKey: string): Promise<ExtractedPropertyData> {
  console.log('Calling OpenAI for text-based extraction...');
  
  const prompt = `Extract property details from this Australian property document text. Return ONLY valid JSON with these fields (use null for missing values):
{
  "address": "street address or lot number with street",
  "suburb": "suburb name",
  "state": "Australian state abbreviation (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)",
  "postcode": "4-digit Australian postcode",
  "price": numeric price without $ or commas,
  "weeklyRent": numeric weekly rent,
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": numeric land size in sqm,
  "buildSize": numeric building size in sqm,
  "propertyType": "house", "apartment", "townhouse", or "land",
  "landPrice": numeric land component price (for new builds),
  "buildPrice": numeric build component price (for new builds),
  "isNewBuild": true if new build/house and land package
}

Text to analyze:
${text.substring(0, 8000)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a property data extraction expert. Extract structured data from Australian property documents. Return ONLY valid JSON, no markdown or explanation.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text());
      return {};
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('OpenAI text extraction response:', content);
    
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
  } catch (error) {
    console.error('Error calling OpenAI text extraction:', error);
    return {};
  }
}

// Process extracted data into structured payload
function processToStructuredPayload(extractedData: ExtractedPropertyData): StructuredPropertyPayload {
  let propertyAddress = '';
  
  if (extractedData.address) {
    propertyAddress = extractedData.address;
  }
  
  const addressParts: string[] = [];
  
  if (extractedData.suburb && !propertyAddress.toLowerCase().includes(extractedData.suburb.toLowerCase())) {
    addressParts.push(extractedData.suburb);
  }
  
  if (extractedData.state && !propertyAddress.includes(extractedData.state)) {
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

// Complete address with Google Maps
async function completeAddressWithGoogleMaps(
  payload: StructuredPropertyPayload,
  googleMapsApiKey: string
): Promise<StructuredPropertyPayload> {
  const parts: string[] = [];
  
  if (payload.propertyAddress && payload.propertyAddress !== 'Address Not Found') {
    parts.push(payload.propertyAddress);
  }
  
  if (payload.suburb && !parts.join(' ').toLowerCase().includes(payload.suburb.toLowerCase())) {
    parts.push(payload.suburb);
  }
  
  if (payload.state && !parts.join(' ').includes(payload.state)) {
    parts.push(payload.state);
  }
  
  if (payload.postcode && !parts.join(' ').includes(payload.postcode)) {
    parts.push(payload.postcode);
  }
  
  parts.push('Australia');
  
  const searchQuery = parts.join(', ');
  console.log('Geocoding search query:', searchQuery);
  
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
    console.log('Geocoding result:', result.formatted_address);
    
    // Only update if we got a more specific address (not just country/state level)
    const types = result.types || [];
    if (types.includes('country') || types.includes('administrative_area_level_1')) {
      console.log('Geocoding result too generic, keeping original address');
      return payload;
    }
    
    payload.propertyAddress = result.formatted_address;
    
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

serve(async (req) => {
  console.log('Parse property PDF function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfContent, fileName, base64Content } = await req.json();
    
    // Accept either raw pdfContent or pre-encoded base64Content
    const contentToProcess = base64Content || pdfContent;
    
    if (!contentToProcess) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'PDF content is required (pdfContent or base64Content)' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing PDF:', fileName || 'unnamed.pdf');
    console.log('Content length:', contentToProcess.length);
    
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    
    let extractedData: ExtractedPropertyData = {};
    let extractionMethod = 'none';
    
    // Determine if content is already base64 or needs encoding
    let base64Data: string;
    const isAlreadyBase64 = /^[A-Za-z0-9+/=]+$/.test(contentToProcess.substring(0, 100).replace(/\s/g, ''));
    const isPdfBinary = contentToProcess.startsWith('%PDF') || contentToProcess.includes('%PDF-');
    
    console.log('Is already base64:', isAlreadyBase64);
    console.log('Is PDF binary:', isPdfBinary);
    
    if (base64Content) {
      // Already provided as base64
      base64Data = base64Content;
      console.log('Using provided base64 content');
    } else if (isPdfBinary) {
      // Raw PDF binary - encode to base64
      const encoder = new TextEncoder();
      const bytes = encoder.encode(contentToProcess);
      base64Data = base64Encode(bytes);
      console.log('Encoded PDF binary to base64, length:', base64Data.length);
    } else if (isAlreadyBase64) {
      // Already base64 encoded
      base64Data = contentToProcess;
      console.log('Content appears to be base64 already');
    } else {
      // Plain text content - use text-based extraction
      console.log('Content is plain text, using text extraction...');
      extractedData = await extractWithAI(contentToProcess, openaiKey);
      extractionMethod = 'text-ai';
      
      let structuredPayload = processToStructuredPayload(extractedData);
      
      if (googleMapsApiKey && structuredPayload.propertyAddress !== 'Address Not Found') {
        structuredPayload = await completeAddressWithGoogleMaps(structuredPayload, googleMapsApiKey);
      }
      
      console.log('Final structured payload:', JSON.stringify(structuredPayload, null, 2));
      
      return new Response(JSON.stringify({
        success: true,
        extractedData: formatExtractedData(structuredPayload),
        structuredPayload,
        extractionMethod,
        metadata: {
          fileName: fileName || 'unnamed.pdf',
          processedAt: new Date().toISOString(),
          contentLength: contentToProcess.length,
          isPdfBinary: false,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Use GPT-4o Vision to analyze the PDF
    try {
      console.log('Using GPT-4o Vision for PDF analysis...');
      extractedData = await extractWithVision(base64Data, openaiKey, fileName || 'document.pdf');
      extractionMethod = 'gpt-4o-vision';
    } catch (visionError) {
      console.error('Vision extraction failed:', visionError);
      // The vision API doesn't support PDFs directly, we need to inform the user
      throw new Error('PDF vision analysis failed. Please ensure the file is a valid PDF or image.');
    }
    
    console.log('Extraction method used:', extractionMethod);
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // Process into structured payload
    let structuredPayload = processToStructuredPayload(extractedData);
    
    // Complete address if incomplete
    const isAddressIncomplete = !structuredPayload.postcode || 
                                 !structuredPayload.state || 
                                 structuredPayload.propertyAddress === 'Address Not Found';
    
    if (googleMapsApiKey && isAddressIncomplete && 
        (structuredPayload.suburb || structuredPayload.propertyAddress !== 'Address Not Found')) {
      console.log('Attempting to complete address with Google Maps...');
      structuredPayload = await completeAddressWithGoogleMaps(structuredPayload, googleMapsApiKey);
    }

    console.log('Final structured payload:', JSON.stringify(structuredPayload, null, 2));

    return new Response(JSON.stringify({
      success: true,
      extractedData: formatExtractedData(structuredPayload),
      structuredPayload,
      extractionMethod,
      metadata: {
        fileName: fileName || 'unnamed.pdf',
        processedAt: new Date().toISOString(),
        contentLength: contentToProcess.length,
        isPdfBinary,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in parse-property-pdf:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to parse PDF' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatExtractedData(payload: StructuredPropertyPayload) {
  return {
    extractedAddress: payload.propertyAddress,
    extractedSuburb: payload.suburb,
    extractedState: payload.state,
    extractedPostcode: payload.postcode,
    extractedPrice: payload.purchasePrice,
    extractedRent: payload.weeklyRent,
    extractedBedrooms: payload.bedrooms,
    extractedBathrooms: payload.bathrooms,
    extractedCarSpaces: payload.carSpaces,
    extractedLandSize: payload.landSize,
    extractedBuildSize: payload.buildSize,
    extractedPropertyType: payload.propertyType,
    extractedLandPrice: payload.landPrice,
    extractedBuildPrice: payload.buildPrice,
    isNewBuild: payload.isNewBuild,
  };
}
