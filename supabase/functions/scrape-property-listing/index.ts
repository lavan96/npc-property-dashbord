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

  // Try to extract address from title or content
  if (metadata.title) {
    details.title = metadata.title;
    // Many property sites have address in the title
    const addressMatch = metadata.title.match(/(\d+[A-Za-z]?\s+[\w\s]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Place|Pl|Lane|Ln|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce)[,\s]+[\w\s]+(?:,\s*)?(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT)?(?:\s*\d{4})?)/i);
    if (addressMatch) {
      details.extractedAddress = addressMatch[1].trim();
    }
  }

  // Extract price (look for common patterns)
  const pricePatterns = [
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:million|m)?/gi,
    /price[:\s]*\$\s*([\d,]+(?:\.\d{2})?)/gi,
    /(?:asking|guide|sale)[:\s]*\$\s*([\d,]+(?:\.\d{2})?)/gi,
  ];
  
  for (const pattern of pricePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const priceStr = match[0].replace(/[^\d.]/g, '');
      const price = parseFloat(priceStr);
      if (price > 1000) { // Likely a valid property price
        details.extractedPrice = price > 100 && price < 50 ? price * 1000000 : price; // Handle "1.2m" style
        break;
      }
    }
  }

  // Extract bedrooms
  const bedroomMatch = markdown.match(/(\d+)\s*(?:bed(?:room)?s?|br|bd)/i);
  if (bedroomMatch) {
    details.extractedBedrooms = parseInt(bedroomMatch[1]);
  }

  // Extract bathrooms
  const bathroomMatch = markdown.match(/(\d+)\s*(?:bath(?:room)?s?|ba)/i);
  if (bathroomMatch) {
    details.extractedBathrooms = parseInt(bathroomMatch[1]);
  }

  // Extract car spaces
  const carMatch = markdown.match(/(\d+)\s*(?:car\s*(?:space)?s?|garage|parking)/i);
  if (carMatch) {
    details.extractedCarSpaces = parseInt(carMatch[1]);
  }

  // Extract land size
  const landSizeMatch = markdown.match(/(?:land|lot|block)[:\s]*(?:approx\.?\s*)?(\d+(?:,\d+)?(?:\.\d+)?)\s*(?:m²|sqm|square\s*met(?:re|er)s?)/i);
  if (landSizeMatch) {
    details.extractedLandSize = parseFloat(landSizeMatch[1].replace(',', ''));
  }

  // Extract property type
  const propertyTypePatterns = [
    /\b(house|home|residence)\b/i,
    /\b(apartment|unit|flat)\b/i,
    /\b(townhouse|town\s*house|terrace)\b/i,
    /\b(villa|duplex)\b/i,
    /\b(land|block|lot)\b/i,
  ];
  
  for (const pattern of propertyTypePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      const type = match[1].toLowerCase();
      if (type === 'house' || type === 'home' || type === 'residence') {
        details.extractedPropertyType = 'house';
      } else if (type === 'apartment' || type === 'unit' || type === 'flat') {
        details.extractedPropertyType = 'apartment';
      } else if (type === 'townhouse' || type === 'town house' || type === 'terrace') {
        details.extractedPropertyType = 'townhouse';
      } else {
        details.extractedPropertyType = type;
      }
      break;
    }
  }

  // Extract suburb/postcode from content
  const postcodeMatch = markdown.match(/\b(\d{4})\b/);
  if (postcodeMatch) {
    details.extractedPostcode = postcodeMatch[1];
  }

  const stateMatch = markdown.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
  if (stateMatch) {
    details.extractedState = stateMatch[1].toUpperCase();
  }

  return details;
}
