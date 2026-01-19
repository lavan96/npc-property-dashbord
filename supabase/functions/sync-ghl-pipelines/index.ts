import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface GHLOpportunity {
  id: string;
  name: string;
  monetaryValue: number;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  contact: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
  followUpDate?: string;
  customFields?: Array<{
    id: string;
    key?: string;
    value: any;
  }>;
}

interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

interface GHLOpportunitiesResponse {
  opportunities: GHLOpportunity[];
  meta: {
    total: number;
    nextPageUrl?: string;
    startAfterId?: string;
    startAfter?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey || !locationId) {
      console.error('GHL credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'GoHighLevel credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'Supabase credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    };

    console.log('Fetching GHL pipelines...');

    // Step 1: Fetch all pipelines
    const pipelinesResponse = await fetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`,
      { headers }
    );

    if (!pipelinesResponse.ok) {
      const errorText = await pipelinesResponse.text();
      console.error(`GHL pipelines API error: ${pipelinesResponse.status} - ${errorText}`);
      throw new Error(`GHL API error: ${pipelinesResponse.status} - ${errorText}`);
    }

    const pipelinesData = await pipelinesResponse.json();
    const pipelines: GHLPipeline[] = pipelinesData.pipelines || [];
    console.log(`Found ${pipelines.length} pipelines`);

    // Create a map of stage IDs to stage names and pipeline names
    const stageMap: Record<string, { stageName: string; pipelineName: string }> = {};
    for (const pipeline of pipelines) {
      for (const stage of pipeline.stages || []) {
        stageMap[stage.id] = {
          stageName: stage.name,
          pipelineName: pipeline.name,
        };
      }
    }

    console.log(`Mapped ${Object.keys(stageMap).length} pipeline stages`);

    // Step 2: Fetch all opportunities
    let allOpportunities: GHLOpportunity[] = [];
    let startAfterId: string | null = null;
    let startAfter: number | null = null;
    let pageCount = 0;
    const maxPages = 20;

    while (pageCount < maxPages) {
      pageCount++;
      let url = `${GHL_API_BASE}/opportunities/search?locationId=${locationId}&limit=100`;
      if (startAfter) url += `&startAfter=${startAfter}`;
      if (startAfterId) url += `&startAfterId=${startAfterId}`;

      console.log(`Fetching opportunities page ${pageCount}: ${url}`);

      const oppResponse = await fetch(url, { 
        method: 'POST',
        headers,
        body: JSON.stringify({
          locationId,
          limit: 100,
        })
      });

      if (!oppResponse.ok) {
        const errorText = await oppResponse.text();
        console.error(`GHL opportunities API error: ${oppResponse.status} - ${errorText}`);
        
        // Try the GET endpoint instead
        const oppGetResponse = await fetch(
          `${GHL_API_BASE}/opportunities/?locationId=${locationId}&limit=100`,
          { headers }
        );
        
        if (!oppGetResponse.ok) {
          const getErrorText = await oppGetResponse.text();
          console.error(`GHL opportunities GET API error: ${oppGetResponse.status} - ${getErrorText}`);
          throw new Error(`GHL API error: ${oppGetResponse.status}`);
        }
        
        const oppGetData = await oppGetResponse.json();
        allOpportunities = oppGetData.opportunities || [];
        break;
      }

      const oppData: GHLOpportunitiesResponse = await oppResponse.json();
      const opportunities = oppData.opportunities || [];

      console.log(`Received ${opportunities.length} opportunities`);

      if (opportunities.length === 0) break;

      allOpportunities = [...allOpportunities, ...opportunities];

      // Check for pagination
      if (oppData.meta?.startAfterId) {
        startAfterId = oppData.meta.startAfterId;
        startAfter = oppData.meta.startAfter || null;
      } else {
        break;
      }
    }

    console.log(`Total opportunities fetched: ${allOpportunities.length}`);

    // Step 3: Update clients with pipeline data
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundContacts: string[] = [];

    for (const opp of allOpportunities) {
      const contactId = opp.contact?.id;
      if (!contactId) {
        console.log(`Opportunity ${opp.id} has no contact, skipping`);
        continue;
      }

      // Get stage info
      const stageInfo = stageMap[opp.pipelineStageId];
      const pipelineStatus = stageInfo 
        ? stageInfo.stageName
        : opp.status || 'Unknown Stage';

      // Extract custom fields for borrowing capacity, equity release, etc.
      let borrowingCapacity: number | null = null;
      let proposedRentalIncome: number | null = null;
      let equityRelease: number | null = null;

      if (opp.customFields) {
        for (const field of opp.customFields) {
          const key = (field.key || '').toLowerCase();
          if (key.includes('borrowing') || key.includes('capacity')) {
            borrowingCapacity = parseFloat(field.value) || null;
          } else if (key.includes('rental') || key.includes('income')) {
            proposedRentalIncome = parseFloat(field.value) || null;
          } else if (key.includes('equity') || key.includes('release')) {
            equityRelease = parseFloat(field.value) || null;
          }
        }
      }

      // If no custom field for borrowing, use monetary value
      if (!borrowingCapacity && opp.monetaryValue) {
        borrowingCapacity = opp.monetaryValue;
      }

      // Update client in Supabase
      const updateData: Record<string, any> = {
        pipeline_status: pipelineStatus,
        pipeline_updated_at: new Date().toISOString(),
      };

      if (opp.followUpDate) {
        updateData.follow_up_date = opp.followUpDate;
      }
      if (borrowingCapacity) {
        updateData.borrowing_capacity = borrowingCapacity;
      }
      if (proposedRentalIncome) {
        updateData.proposed_rental_income = proposedRentalIncome;
      }
      if (equityRelease) {
        updateData.equity_release = equityRelease;
      }
      if (opp.notes) {
        updateData.pipeline_notes = opp.notes;
      }

      const { data: updatedClient, error: updateError } = await supabase
        .from('clients')
        .update(updateData)
        .eq('ghl_contact_id', contactId)
        .select('id, primary_first_name, primary_surname')
        .single();

      if (updateError) {
        if (updateError.code === 'PGRST116') {
          notFoundCount++;
          notFoundContacts.push(opp.contact.name || contactId);
        } else {
          console.error(`Error updating client for contact ${contactId}:`, updateError);
        }
      } else {
        updatedCount++;
        console.log(`Updated client ${updatedClient.primary_first_name} ${updatedClient.primary_surname} with status: ${pipelineStatus}`);
      }
    }

    console.log(`Pipeline sync complete. Updated: ${updatedCount}, Not found: ${notFoundCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pipeline sync complete! Updated ${updatedCount} clients.`,
        stats: {
          pipelinesFound: pipelines.length,
          opportunitiesFound: allOpportunities.length,
          clientsUpdated: updatedCount,
          contactsNotFound: notFoundCount,
        },
        pipelines: pipelines.map(p => ({ id: p.id, name: p.name, stageCount: p.stages?.length || 0 })),
        notFoundContacts: notFoundContacts.slice(0, 10),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in sync-ghl-pipelines:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
