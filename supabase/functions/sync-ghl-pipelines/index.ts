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

// Default colors for pipeline stages based on position
const STAGE_COLORS = [
  '#6B7280', // gray
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#A855F7', // purple
  '#EC4899', // pink
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#EAB308', // yellow
  '#84CC16', // lime
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
];

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

    // Step 1: Fetch all pipelines from GHL
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
    const ghlPipelines: GHLPipeline[] = pipelinesData.pipelines || [];
    console.log(`Found ${ghlPipelines.length} pipelines from GHL`);

    // Step 2: Sync pipelines to database
    const pipelineIdMap: Record<string, string> = {}; // ghl_id -> supabase uuid
    const stageIdMap: Record<string, { uuid: string; stageName: string; pipelineName: string; pipelineUuid: string; pipelinePosition: number; stagePosition: number }> = {};

    for (let pIdx = 0; pIdx < ghlPipelines.length; pIdx++) {
      const pipeline = ghlPipelines[pIdx];
      
      // Upsert pipeline
      const { data: pipelineData, error: pipelineError } = await supabase
        .from('ghl_pipelines')
        .upsert({
          ghl_id: pipeline.id,
          name: pipeline.name,
          position: pIdx,
          location_id: locationId,
          is_active: true,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'ghl_id' })
        .select('id')
        .single();

      if (pipelineError) {
        console.error(`Error upserting pipeline ${pipeline.name}:`, pipelineError);
        continue;
      }

      const pipelineUuid = pipelineData.id;
      pipelineIdMap[pipeline.id] = pipelineUuid;
      console.log(`Synced pipeline: ${pipeline.name} (${pipeline.id}) -> ${pipelineUuid}`);

      // Upsert stages for this pipeline
      for (const stage of pipeline.stages || []) {
        const colorIndex = stage.position % STAGE_COLORS.length;
        
        const { data: stageData, error: stageError } = await supabase
          .from('ghl_pipeline_stages')
          .upsert({
            ghl_id: stage.id,
            pipeline_id: pipelineUuid,
            name: stage.name,
            position: stage.position,
            color: STAGE_COLORS[colorIndex],
            synced_at: new Date().toISOString(),
          }, { onConflict: 'ghl_id' })
          .select('id')
          .single();

        if (stageError) {
          console.error(`Error upserting stage ${stage.name}:`, stageError);
          continue;
        }

        stageIdMap[stage.id] = {
          uuid: stageData.id,
          stageName: stage.name,
          pipelineName: pipeline.name,
          pipelineUuid: pipelineUuid,
          pipelinePosition: pIdx,
          stagePosition: stage.position,
        };
      }
    }

    console.log(`Synced ${Object.keys(stageIdMap).length} pipeline stages to database`);

    // Step 3: Fetch all opportunities from GHL - increased limit to ensure all are fetched
    let allOpportunities: GHLOpportunity[] = [];
    let startAfterId: string | null = null;
    let startAfter: number | null = null;
    let pageCount = 0;
    const maxPages = 50; // Increased from 20 to handle more opportunities (up to 5000)

    while (pageCount < maxPages) {
      pageCount++;

      // GHL opportunities/search validation is strict; this endpoint expects `locationId` (camelCase)
      // and rejects unknown properties.
      const searchUrl = `${GHL_API_BASE}/opportunities/search`;
      const searchBody: Record<string, any> = {
        locationId: locationId,
        limit: 100,
      };
      if (startAfterId) searchBody.startAfterId = startAfterId;
      if (startAfter) searchBody.startAfter = startAfter;

      console.log(`Fetching opportunities page ${pageCount} via POST to ${searchUrl}`);

      const oppResponse = await fetch(searchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchBody),
      });

      if (!oppResponse.ok) {
        const errorText = await oppResponse.text();
        console.error(`GHL opportunities SEARCH error: ${oppResponse.status} - ${errorText}`);
        throw new Error(`GHL API error: ${oppResponse.status} - ${errorText}`);
      }

      const oppData: GHLOpportunitiesResponse = await oppResponse.json();
      const opportunities = oppData.opportunities || [];

      console.log(`Received ${opportunities.length} opportunities on page ${pageCount}`);

      if (opportunities.length === 0) break;

      allOpportunities = [...allOpportunities, ...opportunities];

      // Check for pagination (GHL may return either cursor fields or nextPageUrl)
      if (oppData.meta?.nextPageUrl) {
        // Some responses provide a fully qualified URL; others may be relative.
        const nextUrl = oppData.meta.nextPageUrl.startsWith('http')
          ? oppData.meta.nextPageUrl
          : `${GHL_API_BASE}${oppData.meta.nextPageUrl}`;

        // Reset cursor vars and continue with nextPageUrl on next loop iteration
        startAfterId = null;
        startAfter = null;

        // Encode the next page cursor back into startAfter/startAfterId if present in URL,
        // otherwise we will just fetch nextUrl directly by overwriting url building.
        // Easiest: set startAfterId/startAfter by parsing query params.
        try {
          const parsed = new URL(nextUrl);
          startAfterId = parsed.searchParams.get('startAfterId');
          const startAfterStr = parsed.searchParams.get('startAfter');
          startAfter = startAfterStr ? Number(startAfterStr) : null;
        } catch (_e) {
          // If URL parsing fails, stop pagination to avoid infinite loops.
          break;
        }

        // Continue loop (url will be rebuilt with the cursor)
        continue;
      }

      if (oppData.meta?.startAfterId) {
        startAfterId = oppData.meta.startAfterId;
        startAfter = oppData.meta.startAfter || null;
        continue;
      }

      break;
    }

    console.log(`========================================`);
    console.log(`SYNC SUMMARY - OPPORTUNITIES FROM GHL`);
    console.log(`========================================`);
    console.log(`Total opportunities fetched from GHL: ${allOpportunities.length}`);
    console.log(`Pages fetched: ${pageCount}`);
    
    // Count opportunities by pipeline for debugging
    const oppByPipeline: Record<string, number> = {};
    const oppByStage: Record<string, number> = {};
    for (const opp of allOpportunities) {
      const pipelineInfo = pipelineIdMap[opp.pipelineId] ? ghlPipelines.find(p => p.id === opp.pipelineId)?.name : opp.pipelineId;
      const stageInfo = stageIdMap[opp.pipelineStageId];
      const pipelineName = pipelineInfo || 'Unknown Pipeline';
      const stageName = stageInfo?.stageName || 'Unknown Stage';
      
      oppByPipeline[pipelineName] = (oppByPipeline[pipelineName] || 0) + 1;
      oppByStage[`${pipelineName} / ${stageName}`] = (oppByStage[`${pipelineName} / ${stageName}`] || 0) + 1;
    }
    
    console.log(`Opportunities by pipeline:`);
    for (const [pipeline, count] of Object.entries(oppByPipeline)) {
      console.log(`  - ${pipeline}: ${count}`);
    }
    
    console.log(`Opportunities by stage (top 20):`);
    const sortedStages = Object.entries(oppByStage).sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [stage, count] of sortedStages) {
      console.log(`  - ${stage}: ${count}`);
    }

    // Step 4: Group opportunities by contact and select the furthest-down-the-pipeline opportunity
    // Priority: Higher pipeline position > Higher stage position within the same pipeline
    const contactOpportunityMap: Record<string, { 
      opp: GHLOpportunity; 
      pipelinePosition: number; 
      stagePosition: number;
    }> = {};

    for (const opp of allOpportunities) {
      const contactId = opp.contact?.id;
      if (!contactId) {
        console.log(`Opportunity ${opp.id} has no contact, skipping`);
        continue;
      }

      const stageInfo = stageIdMap[opp.pipelineStageId];
      const pipelinePosition = stageInfo?.pipelinePosition ?? -1;
      const stagePosition = stageInfo?.stagePosition ?? -1;

      const existing = contactOpportunityMap[contactId];
      
      // Keep the opportunity that is furthest down in the pipeline
      // Compare by pipeline position first, then by stage position
      const shouldReplace = !existing || 
        pipelinePosition > existing.pipelinePosition ||
        (pipelinePosition === existing.pipelinePosition && stagePosition > existing.stagePosition);

      if (shouldReplace) {
        contactOpportunityMap[contactId] = { opp, pipelinePosition, stagePosition };
      }
    }

    const uniqueContacts = Object.keys(contactOpportunityMap).length;
    const duplicatesRemoved = allOpportunities.length - uniqueContacts;
    console.log(`========================================`);
    console.log(`DEDUPLICATION RESULTS`);
    console.log(`========================================`);
    console.log(`Unique contacts with opportunities: ${uniqueContacts}`);
    console.log(`Duplicate opportunities removed (same contact, earlier stage): ${duplicatesRemoved}`);
    console.log(`========================================`);

    // Step 5: Update clients with the selected opportunity data
    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundContacts: string[] = [];

    for (const [contactId, { opp }] of Object.entries(contactOpportunityMap)) {
      // Get stage info from our map
      const stageInfo = stageIdMap[opp.pipelineStageId];
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

      // Build update data with new relational fields
      const updateData: Record<string, any> = {
        pipeline_status: pipelineStatus,
        pipeline_updated_at: new Date().toISOString(),
        ghl_opportunity_id: opp.id,
        opportunity_status: opp.status || 'open',
      };

      // Link to pipeline and stage using UUIDs
      if (stageInfo) {
        updateData.current_pipeline_id = stageInfo.pipelineUuid;
        updateData.current_stage_id = stageInfo.uuid;
      } else if (pipelineIdMap[opp.pipelineId]) {
        updateData.current_pipeline_id = pipelineIdMap[opp.pipelineId];
      }

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
        // Removed per-client logging to reduce noise - summary is logged at the end
      }
    }

    console.log(`Pipeline sync complete. Updated: ${updatedCount}, Not found: ${notFoundCount}`);

    // Build response with full pipeline structure
    const pipelinesWithStages = ghlPipelines.map(p => ({
      id: pipelineIdMap[p.id] || p.id,
      ghl_id: p.id,
      name: p.name,
      stages: (p.stages || []).map(s => ({
        id: stageIdMap[s.id]?.uuid || s.id,
        ghl_id: s.id,
        name: s.name,
        position: s.position,
        color: STAGE_COLORS[s.position % STAGE_COLORS.length],
      })),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pipeline sync complete! Synced ${ghlPipelines.length} pipelines and updated ${updatedCount} clients.`,
        stats: {
          pipelinesFound: ghlPipelines.length,
          stagesSynced: Object.keys(stageIdMap).length,
          opportunitiesFound: allOpportunities.length,
          clientsUpdated: updatedCount,
          contactsNotFound: notFoundCount,
        },
        pipelines: pipelinesWithStages,
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
