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

// ============= PDF TEXT EXTRACTION =============

// Decode base64 to binary
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Extract text from PDF binary using multiple methods
function extractTextFromPdfBinary(pdfBytes: Uint8Array): string {
  console.log('Extracting text from PDF binary, size:', pdfBytes.length, 'bytes');
  
  // Convert to string for pattern matching
  const decoder = new TextDecoder('latin1');
  const pdfContent = decoder.decode(pdfBytes);
  
  const extractedTexts: string[] = [];
  
  // Method 1: Extract text between parentheses (PDF string literals)
  // This catches most readable text in PDFs
  const stringLiteralPattern = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
  let match;
  while ((match = stringLiteralPattern.exec(pdfContent)) !== null) {
    const text = decodePdfString(match[1]);
    // Only keep text that looks like readable content
    if (text.length >= 2 && text.length <= 500 && /[a-zA-Z0-9]/.test(text)) {
      // Filter out common PDF artifacts
      if (!text.match(/^[A-Z]{1,3}$/) && !text.match(/^\d{1,2}$/)) {
        extractedTexts.push(text);
      }
    }
  }
  
  // Method 2: Look for specific property-related patterns in raw content
  const propertyPatterns = [
    // Prices
    /\$\s*[\d,]+(?:\.\d{2})?(?:\s*(?:K|M))?/g,
    // Lot numbers
    /(?:Lot|LOT)\s*\d+[A-Z]?/g,
    // Street addresses
    /\d+[A-Za-z]?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln|Circuit|Cct|Close|Cl|Parade|Pde)/gi,
    // Suburb + State + Postcode
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Victoria|New South Wales|Queensland)\s*\d{4}/gi,
    // Bedrooms/Bathrooms/Cars
    /\d+\s*(?:bed(?:room)?s?|bath(?:room)?s?|car\s*(?:space)?s?|garage)/gi,
    // Land/Build sizes
    /[\d,]+\s*(?:sqm|m²|m2|square\s*met)/gi,
    // Weekly rent
    /\$\s*[\d,]+\s*(?:per\s*)?(?:week|pw|p\.w\.)/gi,
    // Package/Total price
    /(?:Package|Total|Price|Land|Build)[:\s]+\$?\s*[\d,]+/gi,
  ];
  
  for (const pattern of propertyPatterns) {
    let patternMatch;
    while ((patternMatch = pattern.exec(pdfContent)) !== null) {
      extractedTexts.push(patternMatch[0]);
    }
  }
  
  // Method 3: Extract from stream objects (for compressed streams, we can't decode but might find some text)
  const streamPattern = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  while ((match = streamPattern.exec(pdfContent)) !== null) {
    const streamContent = match[1];
    // Try to find text patterns in uncompressed streams
    const textInStream = streamContent.match(/\(([^)]{3,100})\)/g);
    if (textInStream) {
      textInStream.forEach(t => {
        const decoded = decodePdfString(t.slice(1, -1));
        if (decoded.length >= 3 && /[a-zA-Z]/.test(decoded)) {
          extractedTexts.push(decoded);
        }
      });
    }
  }
  
  // Deduplicate and clean
  const uniqueTexts = [...new Set(extractedTexts)];
  const result = uniqueTexts.join(' ').replace(/\s+/g, ' ').trim();
  
  console.log('Extracted text length:', result.length);
  console.log('Extracted text preview (first 1500 chars):', result.substring(0, 1500));
  
  return result;
}

// Decode PDF escape sequences
function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

// ============= AI EXTRACTION =============

async function extractWithAI(text: string, openaiKey: string, fileName: string): Promise<ExtractedPropertyData> {
  console.log('Calling GPT-4o for property data extraction...');
  console.log('Text length for analysis:', text.length);
  
  const systemPrompt = `You are an expert at extracting property details from Australian real estate documents.
You will receive text extracted from a property brochure or listing document.
Your task is to identify and extract all property information.

Key things to look for:
- Street address (including lot numbers like "Lot 123")
- Suburb name
- State (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)
- Postcode (4 digits, Australian format)
- Property price or package price
- Weekly rent estimate if mentioned
- Number of bedrooms, bathrooms, car spaces
- Land size in sqm
- Building/floor size in sqm
- Property type (house, apartment, townhouse, land)
- For house & land packages: separate land and build prices
- Whether it's a new build (look for terms like "house and land", "new home", "off the plan", "build contract")

Return ONLY valid JSON with these exact fields (use null for values not found):`;

  const userPrompt = `Extract property details from this document (${fileName}):

"""
${text.substring(0, 12000)}
"""

Return JSON:
{
  "address": "full street address including lot number if present",
  "suburb": "suburb name only",
  "state": "state abbreviation (NSW/VIC/QLD/WA/SA/TAS/ACT/NT)",
  "postcode": "4-digit postcode",
  "price": numeric total price (no $ or commas),
  "weeklyRent": numeric weekly rent if mentioned,
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": numeric land size in sqm,
  "buildSize": numeric building size in sqm,
  "propertyType": "house" or "apartment" or "townhouse" or "land",
  "landPrice": numeric land component price for packages,
  "buildPrice": numeric build component price for packages,
  "isNewBuild": true if new build or house and land package
}`;

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
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('GPT-4o extraction response:', content);
    
    // Parse JSON from response
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    console.log('Parsed extraction result:', JSON.stringify(parsed, null, 2));
    
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
    console.error('Error in AI extraction:', error);
    throw error;
  }
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
  // Don't geocode if address is too generic
  if (!payload.propertyAddress || payload.propertyAddress === 'Address Not Found') {
    return payload;
  }
  
  const parts: string[] = [payload.propertyAddress];
  
  if (!payload.propertyAddress.toLowerCase().includes('australia')) {
    parts.push('Australia');
  }
  
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
    const types = result.types || [];
    
    // Reject results that are too generic (country or state level)
    if (types.includes('country') || 
        (types.includes('administrative_area_level_1') && !types.includes('locality'))) {
      console.log('Geocoding result too generic (country/state level), keeping original');
      return payload;
    }
    
    console.log('Geocoding result:', result.formatted_address);
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
  console.log('Parse property PDF function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfContent, fileName, base64Content } = await req.json();
    
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

    const fileNameToUse = fileName || 'document.pdf';
    console.log('Processing PDF:', fileNameToUse);
    console.log('Content length:', contentToProcess.length);
    
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    
    // Decode base64 to binary
    console.log('Decoding base64 content...');
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = base64ToUint8Array(contentToProcess);
      console.log('Decoded PDF size:', pdfBytes.length, 'bytes');
    } catch (decodeError) {
      console.error('Failed to decode base64:', decodeError);
      throw new Error('Invalid base64 content');
    }
    
    // Verify it's a PDF
    const header = new TextDecoder('latin1').decode(pdfBytes.slice(0, 8));
    const isPdf = header.includes('%PDF');
    console.log('PDF header check:', header.substring(0, 8), 'Is PDF:', isPdf);
    
    if (!isPdf) {
      throw new Error('Content does not appear to be a valid PDF file');
    }
    
    // Extract text from PDF
    const extractedText = extractTextFromPdfBinary(pdfBytes);
    
    if (extractedText.length < 50) {
      console.log('Warning: Very little text extracted from PDF');
    }
    
    // Use GPT-4o to analyze the extracted text
    console.log('Using GPT-4o for property data extraction...');
    const extractedData = await extractWithAI(extractedText, openaiKey, fileNameToUse);
    
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
    
    // Process into structured payload
    let structuredPayload = processToStructuredPayload(extractedData);
    
    // Complete address with Google Maps if needed
    const needsGeocoding = !structuredPayload.postcode || 
                          !structuredPayload.state || 
                          !structuredPayload.suburb;
    
    if (googleMapsApiKey && needsGeocoding && 
        structuredPayload.propertyAddress !== 'Address Not Found') {
      console.log('Attempting to complete address with Google Maps...');
      structuredPayload = await completeAddressWithGoogleMaps(structuredPayload, googleMapsApiKey);
    }

    console.log('Final structured payload:', JSON.stringify(structuredPayload, null, 2));

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
      extractionMethod: 'gpt-4o-text',
      metadata: {
        fileName: fileNameToUse,
        processedAt: new Date().toISOString(),
        contentLength: contentToProcess.length,
        extractedTextLength: extractedText.length,
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
