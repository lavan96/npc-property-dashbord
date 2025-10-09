import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskAssessmentRequest {
  suburb: string;
  state: string;
  postcode: string;
  latitude?: number;
  longitude?: number;
}

interface RiskAssessment {
  floodRisk?: {
    level: 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown';
    description: string;
    dataSource: string;
    floodHeight?: number | null;
    averageRecurrenceInterval?: number | null;
    lastUpdated?: string;
    note?: string;
    activeWarnings?: number;
  };
  bushfireRisk?: {
    level: 'Low' | 'Medium' | 'High' | 'Extreme' | 'Unknown';
    description: string;
    dataSource: string;
    officialSource?: string;
    note?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { suburb, state, postcode, latitude, longitude }: RiskAssessmentRequest = await req.json();

    console.log(`Fetching risk assessment for: ${suburb}, ${state}, ${postcode}`);

    // Initialize risk assessment object
    const riskAssessment: RiskAssessment = {};

    // Fetch real flood risk data from AFRIP (Geoscience Australia)
    if (latitude && longitude) {
      console.log(`Fetching flood risk for coordinates: ${latitude}, ${longitude}`);
      riskAssessment.floodRisk = await fetchFloodRiskFromAFRIP(latitude, longitude, suburb, state);
    } else {
      console.log('No coordinates provided, using postcode-based estimate');
      riskAssessment.floodRisk = await fetchFloodRiskByPostcode(postcode, suburb, state);
    }

    // Bushfire risk - state-specific (to be implemented per state)
    riskAssessment.bushfireRisk = generateBushfireEstimate(state, suburb, postcode);

    console.log('Risk assessment compiled:', riskAssessment);

    return new Response(
      JSON.stringify({
        success: true,
        data: riskAssessment,
        suburb,
        state,
        postcode,
        note: 'Flood data from AFRIP (Geoscience Australia). Bushfire risk uses regional estimates.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in risk-assessment-service:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchFloodRiskFromAFRIP(latitude: number, longitude: number, suburb: string, state: string) {
  try {
    console.log('Fetching flood risk from AFRIP/Geoscience Australia...');
    
    // AFRIP (Australian Flood Risk Information Portal) - Geoscience Australia
    // WMS/WFS Service endpoint for flood hazard data
    const wfsUrl = 'https://services.ga.gov.au/gis/services/NFRAG_Floodplain_Risk_Information/MapServer/WFSServer';
    
    // Query flood hazard layers using WFS GetFeature request
    const queryUrl = `${wfsUrl}?service=WFS&version=2.0.0&request=GetFeature&typeName=NFRAG_Floodplain_Risk_Information&outputFormat=application/json&CQL_FILTER=INTERSECTS(geom,POINT(${longitude} ${latitude}))`;
    
    try {
      const response = await fetch(queryUrl, {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(8000) // 8 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        console.log('AFRIP flood data received');
        
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const properties = feature.properties;
          
          // Extract flood risk level from properties
          let level: 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown' = 'Unknown';
          let description = '';
          
          if (properties.FLOOD_RISK || properties.RISK_LEVEL) {
            const riskValue = properties.FLOOD_RISK || properties.RISK_LEVEL;
            level = mapFloodRiskLevel(riskValue);
            description = `This area is within a mapped flood risk zone. ${getFloodRiskDescription(level)}`;
          } else {
            level = 'Low';
            description = 'No significant flood risk identified in AFRIP database for this location.';
          }
          
          return {
            level,
            description,
            dataSource: 'Australian Flood Risk Information Portal (AFRIP) - Geoscience Australia',
            floodHeight: properties.FLOOD_HEIGHT_M || null,
            averageRecurrenceInterval: properties.ARI_YEARS || null,
            lastUpdated: properties.LAST_UPDATED || '2024'
          };
        } else {
          // No flood data in AFRIP for this location
          return {
            level: 'Low' as const,
            description: 'This location is not within a mapped flood risk area according to AFRIP data. However, flood risk can change due to weather patterns and development.',
            dataSource: 'Australian Flood Risk Information Portal (AFRIP) - Geoscience Australia',
            note: 'Always check with local council for the most current flood information.'
          };
        }
      }
      
      console.log('AFRIP API response not OK, status:', response.status);
    } catch (apiError: any) {
      console.log('AFRIP API fetch failed:', apiError.message);
    }

    // Try alternative: BoM Flood Warning Service
    try {
      console.log('Trying BoM Flood Warning Service...');
      const bomUrl = `http://www.bom.gov.au/fwo/IDZ00001.warnings_summary.json`;
      
      const response = await fetch(bomUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('BoM flood warnings received');
        
        // Check if there are active flood warnings for the state
        const stateWarnings = data.warnings?.filter((w: any) => 
          w.state === state && w.type === 'flood'
        ) || [];
        
        if (stateWarnings.length > 0) {
          return {
            level: 'Medium' as const,
            description: `Active flood warnings exist for ${state}. Check Bureau of Meteorology for current conditions.`,
            dataSource: 'Bureau of Meteorology Flood Warning Service',
            activeWarnings: stateWarnings.length
          };
        }
      }
    } catch (bomError: any) {
      console.log('BoM flood warning fetch failed:', bomError.message);
    }

    // Fallback: Generate estimate based on location patterns
    return generateFloodEstimate(suburb, state, latitude, longitude);

  } catch (error: any) {
    console.error('Error fetching flood risk:', error);
    return generateFloodEstimate(suburb, state, latitude, longitude);
  }
}

async function fetchFloodRiskByPostcode(postcode: string, suburb: string, state: string) {
  console.log('Fetching flood risk by postcode (no coordinates)');
  
  // Without coordinates, we can only provide general estimates
  // In production, you would geocode the postcode first
  return {
    level: 'Unknown' as const,
    description: 'Precise flood risk assessment requires property coordinates. General flood information can be found through your local council or AFRIP at https://afrip.ga.gov.au/',
    dataSource: 'Estimated (coordinates required for accurate assessment)',
    note: 'Contact your local council for detailed flood risk information for this postcode.'
  };
}

function mapFloodRiskLevel(value: any): 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown' {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('very high') || lower.includes('extreme')) return 'Very High';
    if (lower.includes('high')) return 'High';
    if (lower.includes('medium') || lower.includes('moderate')) return 'Medium';
    if (lower.includes('low')) return 'Low';
  }
  if (typeof value === 'number') {
    if (value >= 4) return 'Very High';
    if (value >= 3) return 'High';
    if (value >= 2) return 'Medium';
    if (value >= 1) return 'Low';
  }
  return 'Unknown';
}

function getFloodRiskDescription(level: string): string {
  const descriptions: Record<string, string> = {
    'Very High': 'Significant flood risk exists. Properties may experience regular flooding during major rainfall events. Flood insurance is strongly recommended.',
    'High': 'Elevated flood risk. The area may be subject to flooding during significant rainfall events. Consider flood mitigation measures.',
    'Medium': 'Moderate flood risk. Some flooding may occur during heavy rainfall. Check with local council for specific property information.',
    'Low': 'Minimal flood risk identified. However, local conditions can vary and should be verified with local council.'
  };
  return descriptions[level] || 'Flood risk level requires further assessment.';
}

function generateFloodEstimate(suburb: string, state: string, latitude?: number, longitude?: number) {
  // Basic flood risk estimation based on known high-risk areas
  const highRiskSuburbs = [
    'penrith', 'windsor', 'richmond', 'lismore', 'murwillumbah', 'grafton',
    'brisbane city', 'ipswich', 'rockhampton', 'townsville', 'cairns',
    'maribyrnong', 'heidelberg', 'kew', 'hawthorn'
  ];
  
  const suburbLower = suburb.toLowerCase();
  const isHighRisk = highRiskSuburbs.some(s => suburbLower.includes(s));
  
  return {
    level: isHighRisk ? 'Medium' as const : 'Low' as const,
    description: isHighRisk 
      ? 'This area is in a region with known flood history. Detailed flood risk assessment recommended through local council or AFRIP.'
      : 'No major flood risk identified based on regional patterns. For property-specific information, consult local council flood maps.',
    dataSource: 'Estimated based on regional flood patterns (AFRIP data unavailable)',
    note: 'For accurate flood risk assessment, provide property coordinates or consult https://afrip.ga.gov.au/'
  };
}

function generateBushfireEstimate(state: string, suburb: string, postcode: string) {
  // Generate bushfire risk estimates based on state and location patterns
  const highRiskStates = ['NSW', 'VIC', 'SA', 'WA', 'TAS'];
  const veryHighRiskAreas = ['blue mountains', 'dandenong', 'hills', 'ranges', 'forest'];
  
  const suburbLower = suburb.toLowerCase();
  const isVeryHighRisk = veryHighRiskAreas.some(area => suburbLower.includes(area));
  const isHighRiskState = highRiskStates.includes(state.toUpperCase());
  
  let level: 'Low' | 'Medium' | 'High' | 'Extreme' | 'Unknown';
  let description: string;
  
  if (isVeryHighRisk) {
    level = 'Extreme';
    description = 'This area is in a high bushfire risk zone. Properties should have a Bushfire Attack Level (BAL) assessment and bushfire management plan.';
  } else if (isHighRiskState) {
    level = 'High';
    description = `${state} experiences regular bushfire seasons. Check with ${getStateBushfireAgency(state)} for specific property risk ratings.`;
  } else {
    level = 'Medium';
    description = 'Moderate bushfire risk. Maintain defensible space and stay informed during fire season.';
  }
  
  return {
    level,
    description,
    dataSource: `Estimated - Verify with ${getStateBushfireAgency(state)}`,
    officialSource: getStateBushfireDataSource(state),
    note: 'Bushfire risk varies by exact location. Obtain a formal Bushfire Attack Level (BAL) assessment for construction or insurance purposes.'
  };
}

function getStateBushfireAgency(state: string): string {
  const agencies: Record<string, string> = {
    'NSW': 'NSW Rural Fire Service (RFS)',
    'VIC': 'Country Fire Authority (CFA)',
    'QLD': 'Queensland Fire and Emergency Services (QFES)',
    'WA': 'Department of Fire and Emergency Services (DFES)',
    'SA': 'Country Fire Service (CFS)',
    'TAS': 'Tasmania Fire Service (TFS)',
    'ACT': 'ACT Emergency Services Agency (ESA)',
    'NT': 'Northern Territory Police, Fire and Emergency Services (NTPFES)',
  };
  return agencies[state.toUpperCase()] || 'State Emergency Services';
}

function getStateBushfireDataSource(state: string): string {
  const sources: Record<string, string> = {
    'NSW': 'https://www.rfs.nsw.gov.au/plan-and-prepare/building-in-a-bush-fire-area',
    'VIC': 'https://www.cfa.vic.gov.au/plan-prepare/your-local-area-info',
    'QLD': 'https://www.qfes.qld.gov.au/prepare/bushfire',
    'WA': 'https://www.dfes.wa.gov.au/hazard-information/bushfire',
    'SA': 'https://www.cfs.sa.gov.au/public-safety/bushfire-risk-ratings',
    'TAS': 'https://www.fire.tas.gov.au/prepare',
    'ACT': 'https://esa.act.gov.au/prepare/bushfires',
    'NT': 'https://pfes.nt.gov.au/fire-and-rescue/bushfires',
  };
  return sources[state.toUpperCase()] || 'State-based emergency services website';
}
