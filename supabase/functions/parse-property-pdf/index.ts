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

interface AddressComponents {
  streetNumber?: string;
  streetName?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  fullAddress?: string;
}

// Check if an address appears to be incomplete
function isAddressIncomplete(extractedData: ExtractedPropertyData): boolean {
  // Missing postcode or state suggests incomplete address
  if (!extractedData.postcode || !extractedData.state) {
    return true;
  }
  
  // If address exists but is very short (likely partial)
  if (extractedData.address && extractedData.address.length < 15) {
    return true;
  }
  
  // If we have suburb but no street address
  if (extractedData.suburb && !extractedData.address) {
    return true;
  }
  
  return false;
}

// Build a search query from partial address data
function buildAddressSearchQuery(extractedData: ExtractedPropertyData): string {
  const parts: string[] = [];
  
  if (extractedData.address) {
    parts.push(extractedData.address);
  }
  
  if (extractedData.suburb && !extractedData.address?.toLowerCase().includes(extractedData.suburb.toLowerCase())) {
    parts.push(extractedData.suburb);
  }
  
  if (extractedData.state && !extractedData.address?.includes(extractedData.state)) {
    parts.push(extractedData.state);
  }
  
  if (extractedData.postcode && !extractedData.address?.includes(extractedData.postcode)) {
    parts.push(extractedData.postcode);
  }
  
  // Always append Australia for better geocoding accuracy
  parts.push('Australia');
  
  return parts.join(', ');
}

// Complete a partial address using Google Maps Geocoding API
async function completeAddressWithGoogleMaps(
  extractedData: ExtractedPropertyData,
  googleMapsApiKey: string
): Promise<AddressComponents | null> {
  const searchQuery = buildAddressSearchQuery(extractedData);
  console.log('Geocoding search query:', searchQuery);
  
  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${googleMapsApiKey}&region=au&components=country:AU`;
    
    const response = await fetch(geocodeUrl);
    
    if (!response.ok) {
      console.error('Google Maps Geocoding API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No geocoding results found. Status:', data.status);
      return null;
    }
    
    const result = data.results[0];
    console.log('Geocoding result:', result.formatted_address);
    
    // Extract address components
    const components: AddressComponents = {
      fullAddress: result.formatted_address
    };
    
    for (const component of result.address_components) {
      const types = component.types;
      
      if (types.includes('street_number')) {
        components.streetNumber = component.long_name;
      } else if (types.includes('route')) {
        components.streetName = component.long_name;
      } else if (types.includes('locality') || types.includes('sublocality')) {
        components.suburb = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        components.state = component.short_name;
      } else if (types.includes('postal_code')) {
        components.postcode = component.long_name;
      }
    }
    
    console.log('Extracted address components:', components);
    return components;
    
  } catch (error) {
    console.error('Error calling Google Maps Geocoding API:', error);
    return null;
  }
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

    // Use Perplexity API to extract property data from the PDF content
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!perplexityApiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Perplexity API key not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const extractionPrompt = `You are a property data extraction specialist. Analyze the following property document content and extract ALL available property information.

DOCUMENT CONTENT:
${pdfContent}

Extract the following information and return it as a valid JSON object. Only include fields that you can find or reasonably infer from the document. Use null for fields that cannot be determined.

Required JSON structure:
{
  "address": "full street address if available",
  "suburb": "suburb name",
  "state": "Australian state abbreviation (NSW, VIC, QLD, WA, SA, TAS, NT, ACT)",
  "postcode": "4-digit postcode",
  "price": number (purchase price in dollars, no commas),
  "weeklyRent": number (weekly rental income in dollars),
  "bedrooms": number,
  "bathrooms": number,
  "carSpaces": number,
  "landSize": number (in square meters),
  "buildSize": number (building/floor area in square meters),
  "propertyType": "house" | "apartment" | "townhouse" | "unit" | "land",
  "landPrice": number (for new builds/house and land packages),
  "buildPrice": number (construction cost for new builds),
  "isNewBuild": boolean (true if new construction, house and land package, or off-plan)
}

Important extraction rules:
1. For prices, remove $ signs and commas, convert to pure numbers
2. For land/build sizes, extract the numeric value in square meters
3. For bedrooms/bathrooms, extract just the number
4. Detect if this is a new build by looking for keywords like: "house and land", "new construction", "off plan", "build contract", "construction cost"
5. If separate land and build prices are mentioned, extract them separately
6. If only a total package price is given for a new build, put it in "price" and set landPrice/buildPrice to null

RESPOND ONLY WITH THE JSON OBJECT, NO OTHER TEXT.`;

    console.log('Calling Perplexity API for extraction...');
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a property data extraction specialist. You analyze property documents and extract structured data. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Perplexity API error: ${response.status}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || '';
    
    console.log('Extraction response:', extractedText.substring(0, 500));

    // Parse the JSON response
    let extractedData: ExtractedPropertyData = {};
    
    try {
      // Clean up the response - remove markdown code blocks if present
      let jsonStr = extractedText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      
      // Find the JSON object in the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      extractedData = JSON.parse(jsonStr);
      console.log('Successfully parsed extracted data:', extractedData);
    } catch (parseError) {
      console.error('Error parsing extraction response:', parseError);
      console.error('Raw response:', extractedText);
      
      // Try to extract basic info using regex as fallback
      const priceMatch = extractedText.match(/\$?([\d,]+(?:\.\d{2})?)/);
      if (priceMatch) {
        extractedData.price = parseFloat(priceMatch[1].replace(/,/g, ''));
      }
    }

    // Check if address is incomplete and try to complete it with Google Maps
    let addressCompleted = false;
    let originalAddress = extractedData.address;
    
    if (googleMapsApiKey && isAddressIncomplete(extractedData)) {
      console.log('Address appears incomplete, attempting to complete with Google Maps...');
      console.log('Original extracted data:', {
        address: extractedData.address,
        suburb: extractedData.suburb,
        state: extractedData.state,
        postcode: extractedData.postcode
      });
      
      const completedAddress = await completeAddressWithGoogleMaps(extractedData, googleMapsApiKey);
      
      if (completedAddress) {
        // Update extracted data with completed address components
        if (completedAddress.fullAddress) {
          extractedData.address = completedAddress.fullAddress;
          addressCompleted = true;
        }
        if (completedAddress.suburb && !extractedData.suburb) {
          extractedData.suburb = completedAddress.suburb;
        }
        if (completedAddress.state && !extractedData.state) {
          extractedData.state = completedAddress.state;
        }
        if (completedAddress.postcode && !extractedData.postcode) {
          extractedData.postcode = completedAddress.postcode;
        }
        
        console.log('Address completed successfully:', {
          address: extractedData.address,
          suburb: extractedData.suburb,
          state: extractedData.state,
          postcode: extractedData.postcode
        });
      } else {
        console.log('Could not complete address with Google Maps');
      }
    } else if (!googleMapsApiKey) {
      console.log('Google Maps API key not configured, skipping address completion');
    } else {
      console.log('Address appears complete, skipping Google Maps lookup');
    }

    // Build the property address from components if not directly available
    let propertyAddress = extractedData.address;
    if (!propertyAddress && extractedData.suburb) {
      propertyAddress = `${extractedData.suburb}${extractedData.state ? ', ' + extractedData.state : ''}${extractedData.postcode ? ' ' + extractedData.postcode : ''}`;
    }

    const result = {
      success: true,
      extractedData: {
        ...extractedData,
        extractedAddress: propertyAddress,
        extractedPrice: extractedData.price,
        extractedBedrooms: extractedData.bedrooms,
        extractedBathrooms: extractedData.bathrooms,
        extractedCarSpaces: extractedData.carSpaces,
        extractedLandSize: extractedData.landSize,
        extractedBuildSize: extractedData.buildSize,
        extractedPropertyType: extractedData.propertyType,
        extractedPostcode: extractedData.postcode,
        extractedState: extractedData.state,
        extractedSuburb: extractedData.suburb,
        extractedWeeklyRent: extractedData.weeklyRent,
        extractedLandPrice: extractedData.landPrice,
        extractedBuildPrice: extractedData.buildPrice,
        extractedIsNewBuild: extractedData.isNewBuild
      },
      addressCompleted,
      originalAddress,
      pdfContent: pdfContent.substring(0, 10000), // Limit content for context
      fileName
    };

    console.log('Extraction complete. Found data:', {
      address: result.extractedData.extractedAddress,
      addressCompleted: result.addressCompleted,
      price: result.extractedData.extractedPrice,
      beds: result.extractedData.extractedBedrooms,
      isNewBuild: result.extractedData.extractedIsNewBuild
    });

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
