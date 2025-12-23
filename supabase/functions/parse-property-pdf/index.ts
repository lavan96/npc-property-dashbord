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

// Extract readable text from PDF binary content
function extractTextFromPdfBinary(pdfContent: string): string {
  console.log('Extracting text from PDF binary...');
  
  const extractedTexts: string[] = [];
  
  // Method 1: Extract text from PDF stream objects
  // PDF text is typically between BT (Begin Text) and ET (End Text) markers
  const btEtPattern = /BT\s*([\s\S]*?)\s*ET/g;
  let btMatch;
  while ((btMatch = btEtPattern.exec(pdfContent)) !== null) {
    const textBlock = btMatch[1];
    // Extract text from Tj, TJ, ', " operators
    const tjPattern = /\(([^)]+)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(textBlock)) !== null) {
      extractedTexts.push(decodeEscapedString(tjMatch[1]));
    }
    
    // TJ operator with array of strings
    const tjArrayPattern = /\[\s*((?:\([^)]*\)\s*[-\d.]*\s*)+)\]\s*TJ/g;
    let tjArrayMatch;
    while ((tjArrayMatch = tjArrayPattern.exec(textBlock)) !== null) {
      const arrayContent = tjArrayMatch[1];
      const stringPattern = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
        extractedTexts.push(decodeEscapedString(strMatch[1]));
      }
    }
  }
  
  // Method 2: Extract text from parentheses outside BT/ET (simpler PDFs)
  const simpleTextPattern = /\(([A-Za-z0-9\s,.$@\-:;!?'"\/%&*#+]+)\)/g;
  let simpleMatch;
  while ((simpleMatch = simpleTextPattern.exec(pdfContent)) !== null) {
    const text = simpleMatch[1].trim();
    // Filter out binary garbage - only include readable text
    if (text.length >= 2 && text.length <= 200 && /[A-Za-z]{2,}/.test(text)) {
      extractedTexts.push(text);
    }
  }
  
  // Method 3: Look for common property keywords directly in the raw content
  const propertyKeywords = [
    // Price patterns
    /\$\s*[\d,]+(?:\.\d{2})?/g,
    // Bedroom patterns
    /\d+\s*(?:bed(?:room)?s?|Bed(?:room)?s?|BED(?:ROOM)?S?)/g,
    // Bathroom patterns
    /\d+\s*(?:bath(?:room)?s?|Bath(?:room)?s?|BATH(?:ROOM)?S?)/g,
    // Car space patterns
    /\d+\s*(?:car\s*(?:space)?s?|Car\s*(?:Space)?s?|garage|Garage)/g,
    // Land size patterns
    /[\d,]+\s*(?:sqm|SQM|m²|m2|square\s*met)/g,
    // Address patterns
    /(?:Lot|LOT)\s*\d+/g,
    /\d+[a-zA-Z]?\s+[A-Z][a-zA-Z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln)/gi,
    // Suburb patterns with state
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*\d{4}/g,
    // Weekly rent patterns
    /\$\s*[\d,]+\s*(?:per\s*)?(?:week|pw|p\.w\.)/gi,
  ];
  
  for (const pattern of propertyKeywords) {
    let kwMatch;
    while ((kwMatch = pattern.exec(pdfContent)) !== null) {
      extractedTexts.push(kwMatch[0]);
    }
  }
  
  // Method 4: Extract text between stream/endstream that's not heavily encoded
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  let streamMatch;
  while ((streamMatch = streamPattern.exec(pdfContent)) !== null) {
    const streamContent = streamMatch[1];
    // Only process if it looks like it might contain text (not binary)
    if (streamContent.length < 50000) {
      // Look for readable text patterns within streams
      const readablePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,5})/g;
      let readMatch;
      while ((readMatch = readablePattern.exec(streamContent)) !== null) {
        if (readMatch[1].length >= 3) {
          extractedTexts.push(readMatch[1]);
        }
      }
    }
  }
  
  // Deduplicate and join
  const uniqueTexts = [...new Set(extractedTexts)];
  const result = uniqueTexts.join(' ');
  
  console.log('Extracted text length:', result.length);
  console.log('Extracted text preview (first 2000 chars):', result.substring(0, 2000));
  
  return result;
}

// Decode PDF escaped strings
function decodeEscapedString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

// Use OpenAI to extract structured data from PDF text
async function extractWithAI(text: string, openaiKey: string): Promise<ExtractedPropertyData> {
  console.log('Calling OpenAI for structured extraction...');
  
  const prompt = `Extract property details from this text. Return ONLY valid JSON with these fields (use null for missing values):
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
            content: 'You are a property data extraction expert. Extract structured data from property documents. Return ONLY valid JSON, no markdown or explanation.' 
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
    
    console.log('OpenAI response:', content);
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    console.log('Parsed extraction:', JSON.stringify(parsed, null, 2));
    
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
    console.error('Error calling OpenAI:', error);
    return {};
  }
}

// ============= REGEX EXTRACTION FALLBACK =============

function extractPrice(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const priceStr = match[1] || match[2] || match[0];
      const cleanPrice = priceStr.replace(/[$,\s]/g, '');
      const price = parseFloat(cleanPrice);
      if (price > 10000 && price < 50000000) {
        return price;
      }
    }
  }
  return undefined;
}

function extractNumber(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = parseInt(match[1] || match[2] || match[0], 10);
      if (!isNaN(num) && num >= 0 && num < 100) {
        return num;
      }
    }
  }
  return undefined;
}

function extractArea(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const areaStr = match[1] || match[2] || match[0];
      const area = parseFloat(areaStr.replace(/,/g, ''));
      if (area > 10 && area < 100000) {
        return area;
      }
    }
  }
  return undefined;
}

function extractPostcode(text: string): string | undefined {
  const matches = text.match(/\b([2-7]\d{3})\b/g);
  if (matches) {
    for (const match of matches) {
      const num = parseInt(match, 10);
      if ((num >= 2000 && num <= 2999) || (num >= 3000 && num <= 3999) || 
          (num >= 4000 && num <= 4999) || (num >= 5000 && num <= 5999) || 
          (num >= 6000 && num <= 6999) || (num >= 7000 && num <= 7999)) {
        return match;
      }
    }
  }
  return undefined;
}

function extractState(text: string): string | undefined {
  const statePatterns: { [key: string]: RegExp } = {
    'NSW': /\b(NSW|New South Wales)\b/i,
    'VIC': /\b(VIC|Victoria)\b/i,
    'QLD': /\b(QLD|Queensland)\b/i,
    'WA': /\b(WA|Western Australia)\b/i,
    'SA': /\b(SA|South Australia)\b/i,
    'TAS': /\b(TAS|Tasmania)\b/i,
    'ACT': /\b(ACT|Australian Capital Territory)\b/i,
    'NT': /\b(NT|Northern Territory)\b/i,
  };
  
  for (const [state, pattern] of Object.entries(statePatterns)) {
    if (pattern.test(text)) {
      return state;
    }
  }
  return undefined;
}

function extractSuburb(text: string): string | undefined {
  const suburbPatterns = [
    /(?:suburb|location|area)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,?\s*(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*\d{4}/i,
  ];
  
  for (const pattern of suburbPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function extractAddress(text: string): string | undefined {
  const addressPatterns = [
    /(?:Lot|LOT)\s*(\d+)\s*[,\s]+([A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln))\s*[,\s]+([A-Z][a-zA-Z\s]+)/i,
    /(\d+[a-zA-Z]?)\s+([A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln))/i,
    /(?:Unit|Apartment|Apt|Suite)\s*(\d+)[,\/]\s*(\d+)\s+([A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl))/i,
  ];
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return undefined;
}

function detectNewBuild(text: string): boolean {
  const newBuildIndicators = [
    /house\s*(?:and|&)\s*land/i,
    /land\s*(?:and|&)\s*(?:house|home)/i,
    /new\s*(?:build|construction|home)/i,
    /off[\s-]*plan/i,
    /build\s*(?:contract|cost|price)/i,
    /construction\s*(?:cost|price|contract)/i,
    /turnkey/i,
    /fixed\s*price\s*(?:contract|build)/i,
  ];
  
  return newBuildIndicators.some(pattern => pattern.test(text));
}

function extractPropertyDataFromText(text: string): ExtractedPropertyData {
  console.log('Running regex extraction on text...');
  
  const data: ExtractedPropertyData = {};
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  data.state = extractState(normalizedText);
  data.postcode = extractPostcode(normalizedText);
  data.suburb = extractSuburb(normalizedText);
  data.address = extractAddress(normalizedText);
  data.isNewBuild = detectNewBuild(normalizedText);
  
  const pricePatterns = [
    /(?:price|total|package)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:inc|including|plus)?/i,
  ];
  data.price = extractPrice(normalizedText, pricePatterns);
  
  const rentPatterns = [
    /(?:rent|rental)[:\s]*\$?\s*([\d,]+)\s*(?:per\s*)?(?:week|pw|p\.w\.)/i,
    /\$\s*([\d,]+)\s*(?:per\s*)?(?:week|pw|p\.w\.)/i,
  ];
  data.weeklyRent = extractNumber(normalizedText, rentPatterns);
  
  const bedroomPatterns = [/(\d+)\s*(?:bed(?:room)?s?|br|bdr)/i];
  data.bedrooms = extractNumber(normalizedText, bedroomPatterns);
  
  const bathroomPatterns = [/(\d+)\s*(?:bath(?:room)?s?|ba)/i];
  data.bathrooms = extractNumber(normalizedText, bathroomPatterns);
  
  const carPatterns = [/(\d+)\s*(?:car\s*(?:space)?s?|garage|parking)/i];
  data.carSpaces = extractNumber(normalizedText, carPatterns);
  
  const landPatterns = [/(?:land\s*(?:size|area)?)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)/i];
  data.landSize = extractArea(normalizedText, landPatterns);
  
  const buildPatterns = [/(?:build(?:ing)?\s*(?:size|area)?)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)?/i];
  data.buildSize = extractArea(normalizedText, buildPatterns);
  
  if (/apartment|flat|unit/i.test(normalizedText)) {
    data.propertyType = 'apartment';
  } else if (/townhouse|town\s*home/i.test(normalizedText)) {
    data.propertyType = 'townhouse';
  } else if (/(?:vacant\s*)?land(?:\s*only)?/i.test(normalizedText) && !data.buildSize) {
    data.propertyType = 'land';
  } else if (/house|home|dwelling/i.test(normalizedText)) {
    data.propertyType = 'house';
  }
  
  console.log('Regex extraction result:', JSON.stringify(data, null, 2));
  
  return data;
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
    
    payload.propertyAddress = result.formatted_address;
    
    for (const component of result.address_components) {
      const types = component.types;
      
      if ((types.includes('locality') || types.includes('sublocality')) && !payload.suburb) {
        payload.suburb = component.long_name;
      } else if (types.includes('administrative_area_level_1') && !payload.state) {
        payload.state = component.short_name;
      } else if (types.includes('postal_code') && !payload.postcode) {
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
    const { pdfContent, fileName } = await req.json();
    
    if (!pdfContent) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'PDF content is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing PDF:', fileName || 'unnamed.pdf');
    console.log('Raw content length:', pdfContent.length);
    
    // Check if content is raw PDF binary (starts with %PDF)
    const isPdfBinary = pdfContent.startsWith('%PDF') || pdfContent.includes('%PDF-');
    console.log('Is PDF binary:', isPdfBinary);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    let extractedData: ExtractedPropertyData = {};
    let extractionMethod = 'none';
    
    if (isPdfBinary) {
      // Step 1: Extract text from PDF binary
      const extractedText = extractTextFromPdfBinary(pdfContent);
      console.log('Extracted text from PDF binary, length:', extractedText.length);
      
      if (extractedText.length > 50) {
        // Step 2: Try AI extraction first (more accurate)
        if (openaiKey) {
          extractedData = await extractWithAI(extractedText, openaiKey);
          extractionMethod = 'openai';
          console.log('AI extraction completed');
        }
        
        // Step 3: Fall back to regex if AI didn't find enough
        if (!extractedData.address && !extractedData.suburb && !extractedData.postcode) {
          console.log('AI extraction insufficient, trying regex...');
          extractedData = extractPropertyDataFromText(extractedText);
          extractionMethod = 'regex';
        }
      } else {
        console.log('Could not extract enough text from PDF binary');
      }
    } else {
      // Content is already text, process directly
      console.log('Content appears to be text, processing directly...');
      
      if (openaiKey) {
        extractedData = await extractWithAI(pdfContent, openaiKey);
        extractionMethod = 'openai';
      } else {
        extractedData = extractPropertyDataFromText(pdfContent);
        extractionMethod = 'regex';
      }
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

    const result = {
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
        fileName: fileName || 'unnamed.pdf',
        processedAt: new Date().toISOString(),
        contentLength: pdfContent.length,
        isPdfBinary,
      },
    };

    return new Response(JSON.stringify(result), {
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
