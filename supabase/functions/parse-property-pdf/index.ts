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

// ============= EXTRACTION SUB-FUNCTIONS =============

// Extract price values from text
function extractPrice(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const priceStr = match[1] || match[2] || match[0];
      const cleanPrice = priceStr.replace(/[$,\s]/g, '');
      const price = parseFloat(cleanPrice);
      if (price > 10000 && price < 50000000) { // Reasonable property price range
        return price;
      }
    }
  }
  return undefined;
}

// Extract numeric values (bedrooms, bathrooms, etc.)
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

// Extract area values (land size, build size)
function extractArea(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const areaStr = match[1] || match[2] || match[0];
      const area = parseFloat(areaStr.replace(/,/g, ''));
      if (area > 10 && area < 100000) { // Reasonable area range in sqm
        return area;
      }
    }
  }
  return undefined;
}

// Extract Australian postcode
function extractPostcode(text: string): string | undefined {
  // Australian postcodes are 4 digits, typically 2000-7999
  const matches = text.match(/\b([2-7]\d{3})\b/g);
  if (matches) {
    // Return the most likely postcode (not a year, not a price)
    for (const match of matches) {
      const num = parseInt(match, 10);
      // Valid Australian postcode ranges
      if ((num >= 2000 && num <= 2999) || // NSW
          (num >= 3000 && num <= 3999) || // VIC
          (num >= 4000 && num <= 4999) || // QLD
          (num >= 5000 && num <= 5999) || // SA
          (num >= 6000 && num <= 6999) || // WA
          (num >= 7000 && num <= 7999)) { // TAS
        return match;
      }
    }
  }
  return undefined;
}

// Extract Australian state
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

// Extract suburb from text
function extractSuburb(text: string, state?: string, postcode?: string): string | undefined {
  // Look for common suburb patterns
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

// Extract street address
function extractAddress(text: string): string | undefined {
  // Look for common address patterns
  const addressPatterns = [
    // Lot number patterns (common for new builds)
    /(?:Lot|LOT)\s*(\d+)\s*[,\s]+([A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln))\s*[,\s]+([A-Z][a-zA-Z\s]+)/i,
    // Standard street address
    /(\d+[a-zA-Z]?)\s+([A-Z][a-zA-Z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Crescent|Cres|Boulevard|Blvd|Way|Lane|Ln))/i,
    // Address with unit number
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

// Check if this is a new build/house and land package
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
    /display\s*home/i,
    /under\s*construction/i,
    /completion\s*date/i,
    /building\s*contract/i,
    /land\s*release/i,
    /estate\s*release/i,
  ];
  
  return newBuildIndicators.some(pattern => pattern.test(text));
}

// Main extraction function that processes raw PDF text
function extractPropertyDataFromText(text: string): ExtractedPropertyData {
  console.log('Starting text extraction from PDF content...');
  
  const data: ExtractedPropertyData = {};
  
  // Normalize text
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  // Extract state first (needed for other extractions)
  data.state = extractState(normalizedText);
  console.log('Extracted state:', data.state);
  
  // Extract postcode
  data.postcode = extractPostcode(normalizedText);
  console.log('Extracted postcode:', data.postcode);
  
  // Extract suburb
  data.suburb = extractSuburb(normalizedText, data.state, data.postcode);
  console.log('Extracted suburb:', data.suburb);
  
  // Extract street address
  data.address = extractAddress(normalizedText);
  console.log('Extracted address:', data.address);
  
  // Check if new build
  data.isNewBuild = detectNewBuild(normalizedText);
  console.log('Is new build:', data.isNewBuild);
  
  // Extract purchase price
  const pricePatterns = [
    /(?:price|total|package)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:inc|including|plus)?/i,
    /(?:purchase|sale)\s*price[:\s]*\$?\s*([\d,]+)/i,
    /(?:from|only)\s*\$?\s*([\d,]+)/i,
  ];
  data.price = extractPrice(normalizedText, pricePatterns);
  console.log('Extracted price:', data.price);
  
  // Extract weekly rent
  const rentPatterns = [
    /(?:rent|rental)[:\s]*\$?\s*([\d,]+)\s*(?:per\s*)?(?:week|pw|p\.w\.)/i,
    /\$\s*([\d,]+)\s*(?:per\s*)?(?:week|pw|p\.w\.)/i,
    /(?:weekly\s*rent)[:\s]*\$?\s*([\d,]+)/i,
    /(?:estimated\s*)?rent[:\s]*\$?\s*([\d,]+)/i,
  ];
  data.weeklyRent = extractNumber(normalizedText, rentPatterns);
  console.log('Extracted weekly rent:', data.weeklyRent);
  
  // Extract bedrooms
  const bedroomPatterns = [
    /(\d+)\s*(?:bed(?:room)?s?|br|bdr)/i,
    /(?:bed(?:room)?s?|br)[:\s]*(\d+)/i,
  ];
  data.bedrooms = extractNumber(normalizedText, bedroomPatterns);
  console.log('Extracted bedrooms:', data.bedrooms);
  
  // Extract bathrooms
  const bathroomPatterns = [
    /(\d+)\s*(?:bath(?:room)?s?|ba)/i,
    /(?:bath(?:room)?s?|ba)[:\s]*(\d+)/i,
  ];
  data.bathrooms = extractNumber(normalizedText, bathroomPatterns);
  console.log('Extracted bathrooms:', data.bathrooms);
  
  // Extract car spaces
  const carPatterns = [
    /(\d+)\s*(?:car\s*(?:space)?s?|garage|parking)/i,
    /(?:car\s*(?:space)?s?|garage|parking)[:\s]*(\d+)/i,
  ];
  data.carSpaces = extractNumber(normalizedText, carPatterns);
  console.log('Extracted car spaces:', data.carSpaces);
  
  // Extract land size
  const landPatterns = [
    /(?:land\s*(?:size|area)?)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2|square\s*met)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)\s*(?:land|block|lot)/i,
    /(?:block|lot)\s*(?:size)?[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)?/i,
  ];
  data.landSize = extractArea(normalizedText, landPatterns);
  console.log('Extracted land size:', data.landSize);
  
  // Extract build size
  const buildPatterns = [
    /(?:build(?:ing)?\s*(?:size|area)?|floor\s*(?:size|area)?|internal)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)\s*(?:build|home|house|internal)/i,
    /(?:home|house)\s*(?:size)?[:\s]*([\d,]+(?:\.\d+)?)\s*(?:sqm|m²|m2)/i,
  ];
  data.buildSize = extractArea(normalizedText, buildPatterns);
  console.log('Extracted build size:', data.buildSize);
  
  // Extract land price (for new builds)
  if (data.isNewBuild) {
    const landPricePatterns = [
      /(?:land\s*(?:price|cost|component))[:\s]*\$?\s*([\d,]+)/i,
      /\$\s*([\d,]+)\s*(?:for\s*)?land/i,
    ];
    data.landPrice = extractPrice(normalizedText, landPricePatterns);
    console.log('Extracted land price:', data.landPrice);
    
    // Extract build price
    const buildPricePatterns = [
      /(?:build(?:ing)?\s*(?:price|cost|contract))[:\s]*\$?\s*([\d,]+)/i,
      /(?:construction\s*(?:price|cost))[:\s]*\$?\s*([\d,]+)/i,
      /\$\s*([\d,]+)\s*(?:for\s*)?(?:build|construction)/i,
    ];
    data.buildPrice = extractPrice(normalizedText, buildPricePatterns);
    console.log('Extracted build price:', data.buildPrice);
  }
  
  // Detect property type
  if (/apartment|flat|unit/i.test(normalizedText)) {
    data.propertyType = 'apartment';
  } else if (/townhouse|town\s*home/i.test(normalizedText)) {
    data.propertyType = 'townhouse';
  } else if (/(?:vacant\s*)?land(?:\s*only)?/i.test(normalizedText) && !data.buildSize) {
    data.propertyType = 'land';
  } else if (/house|home|dwelling/i.test(normalizedText)) {
    data.propertyType = 'house';
  }
  console.log('Detected property type:', data.propertyType);
  
  return data;
}

// Process extracted data into structured payload for report generation
function processToStructuredPayload(extractedData: ExtractedPropertyData): StructuredPropertyPayload {
  console.log('Processing extracted data into structured payload...');
  
  // Build the full address string
  let propertyAddress = '';
  
  if (extractedData.address) {
    propertyAddress = extractedData.address;
  }
  
  // Append suburb, state, postcode if not already in address
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
  
  const payload: StructuredPropertyPayload = {
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
  
  console.log('Structured payload created:', JSON.stringify(payload, null, 2));
  
  return payload;
}

// Complete a partial address using Google Maps Geocoding API
async function completeAddressWithGoogleMaps(
  payload: StructuredPropertyPayload,
  googleMapsApiKey: string
): Promise<StructuredPropertyPayload> {
  // Build search query from available data
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
      console.error('Google Maps Geocoding API error:', response.status);
      return payload;
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No geocoding results found. Status:', data.status);
      return payload;
    }
    
    const result = data.results[0];
    console.log('Geocoding result:', result.formatted_address);
    
    // Update payload with completed address
    payload.propertyAddress = result.formatted_address;
    
    // Extract and update components
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
    
    console.log('Address completed:', payload.propertyAddress);
    
  } catch (error) {
    console.error('Error calling Google Maps Geocoding API:', error);
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
    console.log('Content length:', pdfContent.length);
    console.log('Content preview (first 1000 chars):', pdfContent.substring(0, 1000));

    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

    // Step 1: Extract property data from PDF text using regex patterns
    const extractedData = extractPropertyDataFromText(pdfContent);
    
    // Step 2: Process into structured payload
    let structuredPayload = processToStructuredPayload(extractedData);
    
    // Step 3: Complete address if incomplete using Google Maps
    const isAddressIncomplete = !structuredPayload.postcode || 
                                 !structuredPayload.state || 
                                 structuredPayload.propertyAddress === 'Address Not Found';
    
    if (googleMapsApiKey && isAddressIncomplete && (structuredPayload.suburb || structuredPayload.propertyAddress !== 'Address Not Found')) {
      console.log('Attempting to complete address with Google Maps...');
      structuredPayload = await completeAddressWithGoogleMaps(structuredPayload, googleMapsApiKey);
    }

    // Build response with extracted data for the frontend and report generation
    const result = {
      success: true,
      extractedData: {
        // Primary fields for report generation
        extractedAddress: structuredPayload.propertyAddress,
        extractedSuburb: structuredPayload.suburb,
        extractedState: structuredPayload.state,
        extractedPostcode: structuredPayload.postcode,
        extractedPrice: structuredPayload.purchasePrice,
        extractedWeeklyRent: structuredPayload.weeklyRent,
        extractedBedrooms: structuredPayload.bedrooms,
        extractedBathrooms: structuredPayload.bathrooms,
        extractedCarSpaces: structuredPayload.carSpaces,
        extractedLandSize: structuredPayload.landSize,
        extractedBuildSize: structuredPayload.buildSize,
        extractedPropertyType: structuredPayload.propertyType,
        extractedLandPrice: structuredPayload.landPrice,
        extractedBuildPrice: structuredPayload.buildPrice,
        extractedIsNewBuild: structuredPayload.isNewBuild,
        // Backward compatibility fields
        address: structuredPayload.propertyAddress,
        suburb: structuredPayload.suburb,
        state: structuredPayload.state,
        postcode: structuredPayload.postcode,
        price: structuredPayload.purchasePrice,
        weeklyRent: structuredPayload.weeklyRent,
        bedrooms: structuredPayload.bedrooms,
        bathrooms: structuredPayload.bathrooms,
        carSpaces: structuredPayload.carSpaces,
        landSize: structuredPayload.landSize,
        buildSize: structuredPayload.buildSize,
        propertyType: structuredPayload.propertyType,
        landPrice: structuredPayload.landPrice,
        buildPrice: structuredPayload.buildPrice,
        isNewBuild: structuredPayload.isNewBuild,
      },
      structuredPayload,
      fileName,
      extractionMethod: 'regex',
      addressCompleted: isAddressIncomplete && structuredPayload.postcode !== undefined,
    };

    console.log('=== EXTRACTION SUMMARY ===');
    console.log('Address:', result.extractedData.extractedAddress);
    console.log('Price:', result.extractedData.extractedPrice);
    console.log('Rent:', result.extractedData.extractedWeeklyRent);
    console.log('Beds:', result.extractedData.extractedBedrooms);
    console.log('Baths:', result.extractedData.extractedBathrooms);
    console.log('Cars:', result.extractedData.extractedCarSpaces);
    console.log('Land Size:', result.extractedData.extractedLandSize);
    console.log('Build Size:', result.extractedData.extractedBuildSize);
    console.log('Is New Build:', result.extractedData.extractedIsNewBuild);
    console.log('=========================');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in parse-property-pdf:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || 'Failed to parse PDF' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
