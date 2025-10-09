import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('ABS SEIFA service invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postcode, state } = await req.json();
    console.log('Fetching SEIFA data for postcode:', postcode, 'state:', state);

    if (!postcode) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Postcode is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch SEIFA data from ABS Data API
    const seifaData = await fetchSEIFAData(postcode, state);

    return new Response(JSON.stringify({ 
      success: true, 
      data: seifaData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in ABS SEIFA service:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchSEIFAData(postcode: string, state?: string) {
  try {
    // ABS Data API endpoint for SEIFA (2021 Census)
    // Using the ABS.Stat API for SEIFA Index
    const datasetId = '2033.0.55.001';
    
    console.log('Fetching SEIFA from ABS Data API...');
    
    // Try to fetch from ABS Data API
    // Note: The ABS API uses JSON-stat format
    const apiUrl = `https://api.data.abs.gov.au/data/SEIFA/${postcode}`;
    
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.sdmx.data+json;version=1.0.0'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const parsedData = parseSEIFAResponse(data, postcode);
        
        return {
          postcode,
          state: state || 'Unknown',
          irsad: {
            score: parsedData.irsad || null,
            decile: parsedData.irsadDecile || null,
            description: getSEIFADescription(parsedData.irsadDecile)
          },
          irsd: {
            score: parsedData.irsd || null,
            decile: parsedData.irsdDecile || null,
            description: 'Index of Relative Socio-economic Disadvantage'
          },
          ier: {
            score: parsedData.ier || null,
            decile: parsedData.ierDecile || null,
            description: 'Index of Education and Occupation'
          },
          ieo: {
            score: parsedData.ieo || null,
            decile: parsedData.ieoDecile || null,
            description: 'Index of Economic Resources'
          },
          summary: getSEIFASummary(parsedData.irsadDecile),
          dataSource: 'Australian Bureau of Statistics (ABS)',
          lastUpdated: '2021 Census',
          note: 'SEIFA indexes rank areas based on socio-economic advantage and disadvantage. Decile 10 = most advantaged, Decile 1 = most disadvantaged.'
        };
      }
    } catch (apiError) {
      console.log('ABS API not available, using estimate:', apiError);
    }

    // Fallback: Generate reasonable estimates based on postcode patterns
    return generateSEIFAEstimate(postcode, state);

  } catch (error: any) {
    console.error('Error fetching SEIFA data:', error);
    return generateSEIFAEstimate(postcode, state);
  }
}

function parseSEIFAResponse(data: any, postcode: string): any {
  // Parse JSON-stat format from ABS API
  try {
    if (data.dataSets && data.dataSets[0] && data.dataSets[0].observations) {
      const observations = data.dataSets[0].observations;
      const dimensions = data.structure.dimensions.observation;
      
      // Extract SEIFA indexes from observations
      // This is a simplified parser - actual ABS API structure may vary
      return {
        irsad: observations[0]?.[0] || null,
        irsadDecile: Math.ceil((observations[0]?.[0] || 1000) / 100),
        irsd: observations[1]?.[0] || null,
        irsdDecile: Math.ceil((observations[1]?.[0] || 1000) / 100),
        ier: observations[2]?.[0] || null,
        ierDecile: Math.ceil((observations[2]?.[0] || 1000) / 100),
        ieo: observations[3]?.[0] || null,
        ieoDecile: Math.ceil((observations[3]?.[0] || 1000) / 100)
      };
    }
  } catch (error) {
    console.log('Error parsing SEIFA response:', error);
  }
  
  return {};
}

function generateSEIFAEstimate(postcode: string, state?: string): any {
  // Generate reasonable estimates based on postcode patterns
  // This is used when real data is unavailable
  
  const postcodeNum = parseInt(postcode);
  let decile = 5; // Default to middle
  
  // Sydney (2000-2999)
  if (postcodeNum >= 2000 && postcodeNum < 3000) {
    // Eastern suburbs and North Shore are higher
    if ([2026, 2027, 2028, 2030, 2061, 2065, 2088, 2089, 2090].includes(postcodeNum)) {
      decile = 10;
    } else if (postcodeNum >= 2000 && postcodeNum <= 2100) {
      decile = 8;
    } else if (postcodeNum >= 2200 && postcodeNum <= 2300) {
      decile = 4; // Western Sydney
    } else {
      decile = 6;
    }
  }
  // Melbourne (3000-3999)
  else if (postcodeNum >= 3000 && postcodeNum < 4000) {
    if ([3142, 3144, 3181, 3101, 3141].includes(postcodeNum)) {
      decile = 10;
    } else if (postcodeNum <= 3100) {
      decile = 8;
    } else if (postcodeNum >= 3800) {
      decile = 5;
    } else {
      decile = 6;
    }
  }
  // Brisbane (4000-4999)
  else if (postcodeNum >= 4000 && postcodeNum < 5000) {
    if ([4000, 4006, 4007, 4066, 4101].includes(postcodeNum)) {
      decile = 9;
    } else {
      decile = 6;
    }
  }
  // Adelaide (5000-5999)
  else if (postcodeNum >= 5000 && postcodeNum < 6000) {
    decile = 6;
  }
  // Perth (6000-6999)
  else if (postcodeNum >= 6000 && postcodeNum < 7000) {
    if ([6000, 6009, 6010, 6011].includes(postcodeNum)) {
      decile = 8;
    } else {
      decile = 6;
    }
  }
  
  const score = 900 + (decile * 10);
  
  return {
    postcode,
    state: state || 'Unknown',
    irsad: {
      score: score,
      decile: decile,
      description: getSEIFADescription(decile)
    },
    irsd: {
      score: score - 20,
      decile: decile,
      description: 'Index of Relative Socio-economic Disadvantage'
    },
    ier: {
      score: score + 10,
      decile: decile,
      description: 'Index of Education and Occupation'
    },
    ieo: {
      score: score + 20,
      decile: decile,
      description: 'Index of Economic Resources'
    },
    summary: getSEIFASummary(decile),
    dataSource: 'Estimated based on ABS SEIFA patterns',
    lastUpdated: '2021 Census (estimated)',
    note: 'SEIFA indexes rank areas based on socio-economic advantage and disadvantage. Decile 10 = most advantaged, Decile 1 = most disadvantaged. This is an estimate - actual ABS data requires postcode-level access.'
  };
}

function getSEIFADescription(decile: number | null): string {
  if (!decile) return 'Unknown';
  
  if (decile >= 9) return 'Very High Advantage';
  if (decile >= 7) return 'High Advantage';
  if (decile >= 5) return 'Moderate Advantage';
  if (decile >= 3) return 'Low Advantage';
  return 'Disadvantaged';
}

function getSEIFASummary(decile: number | null): string {
  if (!decile) return 'Socioeconomic data unavailable';
  
  if (decile >= 9) {
    return 'This area ranks in the top 20% of Australian postcodes for socioeconomic advantage. Residents typically have higher incomes, education levels, and skilled occupations.';
  } else if (decile >= 7) {
    return 'This area ranks above average for socioeconomic advantage. The area has good income levels, education, and employment opportunities.';
  } else if (decile >= 5) {
    return 'This area has moderate socioeconomic characteristics, sitting around the Australian median for income, education, and occupation.';
  } else if (decile >= 3) {
    return 'This area ranks below average for socioeconomic advantage. May have lower median incomes and higher unemployment rates.';
  } else {
    return 'This area ranks in the bottom 20% for socioeconomic advantage. May face challenges with lower incomes, education levels, and employment rates.';
  }
}
