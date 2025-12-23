import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Scrape property listing function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      console.error('URL is required');
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured. Please add it to Supabase secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping property listing URL:', formattedUrl);

    // Call Firecrawl API to scrape the URL
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for dynamic content to load
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error || `Firecrawl request failed with status ${response.status}` 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful, markdown length:', data.data?.markdown?.length || 0);

    // Extract property details from the scraped content
    const markdown = data.data?.markdown || '';
    const metadata = data.data?.metadata || {};

    // Try to extract common property details from the content
    const extractedDetails = extractPropertyDetails(markdown, metadata);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          markdown,
          metadata,
          extractedDetails,
          sourceUrl: formattedUrl
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping property listing:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape property listing';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to extract property details from scraped content
function extractPropertyDetails(markdown: string, metadata: any): any {
  const details: any = {};

  // Try to extract address from title or content with improved patterns
  if (metadata.title) {
    details.title = metadata.title;
    
    // Multiple address extraction patterns for different listing formats
    const addressPatterns = [
      // Full address with street number, name, suburb, state, postcode
      /(\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde|Close|Cl|Circuit|Cct|Grove|Gr|Highway|Hwy)[,\s]+[\w\s]+[,\s]+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT)(?:\s*\d{4})?)/i,
      // Address without state but with suburb
      /(\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde|Close|Cl|Circuit|Cct|Grove|Gr|Highway|Hwy)[,\s]+[\w\s]+)/i,
      // Unit/apartment style addresses
      /(?:Unit|Apt|Apartment|Level|Lot)\s*\d+[A-Za-z]?[,\/\s]+\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way)/i,
      // Just street number and name
      /(\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce))/i,
    ];

    for (const pattern of addressPatterns) {
      const match = metadata.title.match(pattern);
      if (match) {
        details.extractedAddress = match[1] ? match[1].trim() : match[0].trim();
        break;
      }
    }

    // If no address found in title, try to extract from markdown content
    if (!details.extractedAddress) {
      for (const pattern of addressPatterns) {
        const match = markdown.match(pattern);
        if (match) {
          details.extractedAddress = match[1] ? match[1].trim() : match[0].trim();
          break;
        }
      }
    }
    
    // Try to extract suburb from title if address not found
    if (!details.extractedAddress) {
      // Look for "Suburb, State" pattern
      const suburbStateMatch = metadata.title.match(/([\w\s]+),\s*(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)(?:\s*\d{4})?/i);
      if (suburbStateMatch) {
        details.extractedSuburb = suburbStateMatch[1].trim();
        details.extractedState = suburbStateMatch[2].toUpperCase();
      }
    }
  }

  // Also try to extract address from og:description or description metadata
  if (metadata.description && !details.extractedAddress) {
    const addressPatterns = [
      /(\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde)[,\s]+[\w\s]+[,\s]+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT)(?:\s*\d{4})?)/i,
    ];
    for (const pattern of addressPatterns) {
      const match = metadata.description.match(pattern);
      if (match) {
        details.extractedAddress = match[1].trim();
        break;
      }
    }
  }

  // Extract price with improved patterns
  const pricePatterns = [
    // Standard Australian price format
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:million|m)?/gi,
    // Price guide format
    /(?:price\s*(?:guide)?|guide|asking|sale|offers?\s*(?:over|above|from)?)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:million|m)?/gi,
    // Contact agent typically means no price, but try to find one anyway
    /(?:auction|for\s*sale)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/gi,
    // Price range
    /\$\s*([\d,]+)\s*-\s*\$?\s*([\d,]+)/gi,
  ];
  
  for (const pattern of pricePatterns) {
    const matches = [...markdown.matchAll(pattern)];
    for (const match of matches) {
      let priceStr = match[1].replace(/[^\d.]/g, '');
      let price = parseFloat(priceStr);
      
      // Handle millions format (e.g., "1.2m" or "1.2 million")
      if (match[0].toLowerCase().includes('million') || match[0].toLowerCase().includes('m')) {
        if (price < 100) {
          price = price * 1000000;
        }
      }
      
      // Valid Australian property prices are typically between $100k and $100M
      if (price >= 100000 && price <= 100000000) {
        details.extractedPrice = price;
        break;
      }
    }
    if (details.extractedPrice) break;
  }

  // Extract bedrooms with more patterns
  const bedroomPatterns = [
    /(\d+)\s*(?:bed(?:room)?s?|br|bd)/i,
    /(?:bed(?:room)?s?|br|bd)[:\s]*(\d+)/i,
    /(\d+)\s*🛏/i,
  ];
  for (const pattern of bedroomPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const beds = parseInt(match[1]);
      if (beds > 0 && beds <= 20) {
        details.extractedBedrooms = beds;
        break;
      }
    }
  }

  // Extract bathrooms
  const bathroomPatterns = [
    /(\d+)\s*(?:bath(?:room)?s?|ba)/i,
    /(?:bath(?:room)?s?|ba)[:\s]*(\d+)/i,
    /(\d+)\s*🚿/i,
  ];
  for (const pattern of bathroomPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const baths = parseInt(match[1]);
      if (baths > 0 && baths <= 15) {
        details.extractedBathrooms = baths;
        break;
      }
    }
  }

  // Extract car spaces
  const carPatterns = [
    /(\d+)\s*(?:car\s*(?:space)?s?|garage|parking|carport)/i,
    /(?:car\s*(?:space)?s?|garage|parking)[:\s]*(\d+)/i,
    /(\d+)\s*🚗/i,
  ];
  for (const pattern of carPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const cars = parseInt(match[1]);
      if (cars >= 0 && cars <= 20) {
        details.extractedCarSpaces = cars;
        break;
      }
    }
  }

  // Extract land size with improved patterns
  const landSizePatterns = [
    /(?:land|lot|block|site)[:\s]*(?:size)?[:\s]*(?:approx\.?\s*)?(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:m²|sqm|m2|square\s*met(?:re|er)s?)/i,
    /(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:m²|sqm|m2)\s*(?:land|lot|block)/i,
    /(?:land\s*area|total\s*area)[:\s]*(?:approx\.?\s*)?(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:m²|sqm|m2)?/i,
  ];
  for (const pattern of landSizePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const size = parseFloat(match[1].replace(',', ''));
      if (size > 0 && size < 100000) {
        details.extractedLandSize = size;
        break;
      }
    }
  }

  // Extract building/internal size
  const buildSizePatterns = [
    /(?:build(?:ing)?|internal|floor|living)[:\s]*(?:size|area)?[:\s]*(?:approx\.?\s*)?(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:m²|sqm|m2)/i,
  ];
  for (const pattern of buildSizePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const size = parseFloat(match[1].replace(',', ''));
      if (size > 0 && size < 10000) {
        details.extractedBuildSize = size;
        break;
      }
    }
  }

  // Extract property type
  const propertyTypePatterns = [
    /\b(house|home|residence|family\s*home)\b/i,
    /\b(apartment|unit|flat)\b/i,
    /\b(townhouse|town\s*house|terrace)\b/i,
    /\b(villa|duplex|semi-detached)\b/i,
    /\b(land|block|vacant\s*land)\b/i,
    /\b(acreage|rural|farm)\b/i,
  ];
  
  for (const pattern of propertyTypePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const type = match[1].toLowerCase().replace(/\s+/g, '');
      if (['house', 'home', 'residence', 'familyhome'].includes(type)) {
        details.extractedPropertyType = 'house';
      } else if (['apartment', 'unit', 'flat'].includes(type)) {
        details.extractedPropertyType = 'apartment';
      } else if (['townhouse', 'townhouse', 'terrace'].includes(type)) {
        details.extractedPropertyType = 'townhouse';
      } else if (['villa', 'duplex', 'semi-detached'].includes(type)) {
        details.extractedPropertyType = 'townhouse';
      } else {
        details.extractedPropertyType = type;
      }
      break;
    }
  }

  // Extract suburb/postcode from content
  const postcodeMatch = markdown.match(/\b(2\d{3}|3\d{3}|4\d{3}|5\d{3}|6\d{3}|7\d{3}|0\d{3})\b/);
  if (postcodeMatch) {
    details.extractedPostcode = postcodeMatch[1];
  }

  const stateMatch = markdown.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
  if (stateMatch) {
    details.extractedState = stateMatch[1].toUpperCase();
  }

  // Try to build a complete address if we have components
  if (!details.extractedAddress && details.extractedSuburb && details.extractedState) {
    details.extractedAddress = `${details.extractedSuburb}, ${details.extractedState}${details.extractedPostcode ? ' ' + details.extractedPostcode : ''}`;
  }

  console.log('Extracted details:', JSON.stringify(details, null, 2));
  return details;
}
