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
  };
  bushfireRisk?: {
    level: 'Low' | 'Medium' | 'High' | 'Extreme' | 'Unknown';
    description: string;
    dataSource: string;
  };
  crimeStatistics?: {
    overallRating: 'Low' | 'Medium' | 'High' | 'Unknown';
    comparedToStateAverage: string;
    dataSource: string;
  };
  climateRisk?: {
    overallRating: 'Low' | 'Medium' | 'High' | 'Unknown';
    mainConcerns: string[];
    dataSource: string;
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

    // Note: For production use, you would integrate with actual government APIs:
    // 1. Flood Risk: https://afrip.ga.gov.au/ (requires API access)
    // 2. Bushfire Risk: State-based systems (e.g., VIC CFA, NSW RFS)
    // 3. Crime Statistics: State police databases
    // 4. Climate Risk: Climate Council / BoM data

    // For now, provide structured placeholders that clearly indicate data sources needed
    riskAssessment.floodRisk = {
      level: 'Unknown',
      description: 'Flood risk data requires integration with the Australian Flood Risk Information Portal (AFRIP). Contact Geoscience Australia for API access at https://afrip.ga.gov.au/',
      dataSource: 'AFRIP (Not Integrated)',
    };

    riskAssessment.bushfireRisk = {
      level: 'Unknown',
      description: getStateBushfireDataSource(state),
      dataSource: `${state} Emergency Services (Not Integrated)`,
    };

    riskAssessment.crimeStatistics = {
      overallRating: 'Unknown',
      comparedToStateAverage: 'Crime statistics require integration with state-based police data.',
      dataSource: getStateCrimeDataSource(state),
    };

    riskAssessment.climateRisk = {
      overallRating: 'Unknown',
      mainConcerns: ['Data integration required'],
      dataSource: 'Climate Council / BoM (Not Integrated)',
    };

    console.log('Risk assessment compiled:', riskAssessment);

    return new Response(
      JSON.stringify({
        success: true,
        data: riskAssessment,
        suburb,
        state,
        postcode,
        note: 'This service requires API access to government databases. Integration instructions provided in each risk category.',
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

function getStateBushfireDataSource(state: string): string {
  const sources: Record<string, string> = {
    'NSW': 'NSW Rural Fire Service provides bushfire risk data at https://www.rfs.nsw.gov.au/plan-and-prepare/bush-fire-survival-plan/bush-fire-risk',
    'VIC': 'CFA Victoria provides bushfire risk ratings at https://www.cfa.vic.gov.au/plan-prepare/your-local-area-info',
    'QLD': 'Queensland Fire Department provides bushfire risk information at https://www.qfes.qld.gov.au/prepare/bushfire',
    'WA': 'DFES Western Australia provides bushfire risk data at https://www.dfes.wa.gov.au/hazard-information/bushfire',
    'SA': 'SA CFS provides bushfire risk assessments at https://www.cfs.sa.gov.au/public-safety/bushfire-risk-ratings',
    'TAS': 'Tasmania Fire Service provides bushfire risk data at https://www.fire.tas.gov.au/prepare',
    'ACT': 'ACT ESA provides bushfire risk information at https://esa.act.gov.au/prepare/bushfires',
    'NT': 'NT PFES provides bushfire risk data at https://pfes.nt.gov.au/fire-and-rescue/bushfires',
  };
  return sources[state] || 'State-based emergency services provide bushfire risk data.';
}

function getStateCrimeDataSource(state: string): string {
  const sources: Record<string, string> = {
    'NSW': 'Bureau of Crime Statistics and Research (BOCSAR) at https://www.bocsar.nsw.gov.au/',
    'VIC': 'Crime Statistics Agency Victoria at https://www.crimestatistics.vic.gov.au/',
    'QLD': 'Queensland Police Service at https://www.police.qld.gov.au/maps-and-statistics',
    'WA': 'WA Police Force crime statistics at https://www.police.wa.gov.au/Crime/CrimeStatistics',
    'SA': 'SAPOL crime statistics at https://www.police.sa.gov.au/about-us/crime-statistics-map',
    'TAS': 'Tasmania Police crime statistics at https://www.police.tas.gov.au/about-us/our-statistics/',
    'ACT': 'ACT Policing crime statistics at https://www.police.act.gov.au/safety-and-security/crime-statistics',
    'NT': 'NT Police crime statistics at https://pfes.nt.gov.au/police/community-safety/nt-crime-statistics',
  };
  return sources[state] || 'State-based police services provide crime statistics.';
}
