import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DomainDataRequest {
  suburb: string;
  state: string;
  postcode?: string;
  propertyCategory?: 'house' | 'unit';
}

interface SuburbPerformance {
  medianSoldPrice?: number;
  numberSold?: number;
  medianRentListingPrice?: number;
  numberRented?: number;
  daysOnMarket?: number;
  auctionClearanceRate?: number;
  annualGrowth?: number;
  rentalYield?: number;
  dataSource: string;
  lastUpdated: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const domainApiKey = Deno.env.get('DOMAIN_API_KEY');
    if (!domainApiKey) {
      console.error('DOMAIN_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Domain API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { suburb, state, postcode, propertyCategory = 'house' }: DomainDataRequest = await req.json();

    console.log(`Fetching Domain data for: ${suburb}, ${state}, ${postcode}`);

    // Fetch suburb performance statistics from Domain API
    const domainUrl = `https://api.domain.com.au/v1/suburbPerformanceStatistics/${state}/${suburb}?propertyCategory=${propertyCategory}&chronologicalSpan=12&tPlusFrom=1&tPlusTo=12`;

    console.log(`Domain API request URL: ${domainUrl}`);

    const response = await fetch(domainUrl, {
      method: 'GET',
      headers: {
        'X-Api-Key': domainApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Domain API error (${response.status}):`, errorText);
      
      // Return graceful fallback data
      return new Response(
        JSON.stringify({
          success: false,
          error: `Domain API returned ${response.status}`,
          fallbackData: {
            dataSource: 'unavailable',
            lastUpdated: new Date().toISOString(),
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Domain API response received:', JSON.stringify(data).substring(0, 500));

    // Extract relevant metrics from the response
    const series = data?.series;
    const latestData = series && series.seriesInfo && series.seriesInfo.length > 0 
      ? series.seriesInfo[series.seriesInfo.length - 1] 
      : null;

    const performanceData: SuburbPerformance = {
      medianSoldPrice: latestData?.values?.medianSoldPrice,
      numberSold: latestData?.values?.numberSold,
      medianRentListingPrice: latestData?.values?.medianRentListingPrice,
      numberRented: latestData?.values?.numberListedForRent,
      daysOnMarket: latestData?.values?.daysOnMarket,
      auctionClearanceRate: latestData?.values?.auctionClearanceRate,
      annualGrowth: latestData?.values?.medianSoldPricePercentChange,
      rentalYield: latestData?.values?.medianRentListingPrice && latestData?.values?.medianSoldPrice
        ? (latestData.values.medianRentListingPrice * 52 / latestData.values.medianSoldPrice * 100)
        : undefined,
      dataSource: 'Domain API',
      lastUpdated: new Date().toISOString(),
    };

    console.log('Processed performance data:', performanceData);

    return new Response(
      JSON.stringify({
        success: true,
        data: performanceData,
        suburb,
        state,
        propertyCategory,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in domain-data-service:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackData: {
          dataSource: 'unavailable',
          lastUpdated: new Date().toISOString(),
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
