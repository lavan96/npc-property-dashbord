import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

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

    const body = await req.json();
    const { clientId, newStageId, newPipelineId } = body;

    if (!clientId || !newStageId) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: clientId and newStageId',
        success: false
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Updating opportunity stage for client ${clientId} to stage ${newStageId}`);

    // Fetch client to get GHL opportunity ID
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('ghl_opportunity_id, ghl_contact_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Failed to fetch client:', clientError);
      return new Response(JSON.stringify({
        error: `Client not found: ${clientError?.message}`,
        success: false
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client.ghl_opportunity_id) {
      console.log('No GHL opportunity linked to this client');
      return new Response(JSON.stringify({
        error: 'No GHL opportunity linked to this client',
        success: false
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the new stage to get its GHL ID
    const { data: stage, error: stageError } = await supabase
      .from('ghl_pipeline_stages')
      .select('ghl_id, name, pipeline_id')
      .eq('id', newStageId)
      .single();

    if (stageError || !stage) {
      console.error('Failed to fetch stage:', stageError);
      return new Response(JSON.stringify({
        error: `Stage not found: ${stageError?.message}`,
        success: false
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the pipeline to get its GHL ID
    const { data: pipeline, error: pipelineError } = await supabase
      .from('ghl_pipelines')
      .select('ghl_id, name')
      .eq('id', stage.pipeline_id)
      .single();

    if (pipelineError || !pipeline) {
      console.error('Failed to fetch pipeline:', pipelineError);
      return new Response(JSON.stringify({
        error: `Pipeline not found: ${pipelineError?.message}`,
        success: false
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    };

    // Update the opportunity in GHL
    const updatePayload = {
      pipelineId: pipeline.ghl_id,
      pipelineStageId: stage.ghl_id,
    };

    console.log(`Updating GHL opportunity ${client.ghl_opportunity_id} with:`, updatePayload);

    const ghlResponse = await fetch(
      `${GHL_API_BASE}/opportunities/${client.ghl_opportunity_id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatePayload),
      }
    );

    if (!ghlResponse.ok) {
      const errorText = await ghlResponse.text();
      console.error('GHL update error:', errorText);
      return new Response(JSON.stringify({
        error: `GHL update failed: ${errorText}`,
        success: false
      }), {
        status: ghlResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ghlData = await ghlResponse.json();
    console.log('GHL update response:', ghlData);

    // Update local client record
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        current_stage_id: newStageId,
        current_pipeline_id: stage.pipeline_id,
        pipeline_status: stage.name,
        pipeline_updated_at: new Date().toISOString(),
        ghl_last_synced_at: new Date().toISOString(),
        ghl_sync_status: 'synced'
      })
      .eq('id', clientId);

    if (updateError) {
      console.error('Failed to update local client:', updateError);
    }

    console.log(`Successfully moved opportunity to stage: ${stage.name}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Moved to ${stage.name}`,
      ghlOpportunityId: client.ghl_opportunity_id,
      newStage: stage.name,
      newPipeline: pipeline.name
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-ghl-opportunity-stage:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
