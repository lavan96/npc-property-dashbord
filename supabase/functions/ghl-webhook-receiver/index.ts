import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCustomField(customFields: any[], keys: string[]) {
  for (const key of keys) {
    const field = customFields.find((f: any) =>
      f.key === key || f.id === key || f.fieldKey === key
    );
    if (field?.value) return field.value;
  }
  return null;
}

/** Resolve a GHL stage ID to the local Supabase stage/pipeline UUIDs */
async function resolveStage(supabase: any, ghlStageId: string) {
  const { data: stage } = await supabase
    .from('ghl_pipeline_stages')
    .select('id, name, pipeline_id')
    .eq('ghl_id', ghlStageId)
    .maybeSingle();

  if (!stage) return null;

  const { data: pipeline } = await supabase
    .from('ghl_pipelines')
    .select('id, name')
    .eq('id', stage.pipeline_id)
    .maybeSingle();

  return {
    stageUuid: stage.id,
    stageName: stage.name,
    pipelineUuid: stage.pipeline_id,
    pipelineName: pipeline?.name || 'Unknown',
  };
}

/** Look up the contact's opportunity in GHL via the API */
async function fetchOpportunityForContact(
  contactId: string,
  apiKey: string,
  locationId: string
): Promise<{ id: string; pipelineStageId: string; pipelineId: string; status: string; monetaryValue?: number } | null> {
  try {
    const res = await fetch(`${GHL_API_BASE}/opportunities/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ locationId, contactId, limit: 10 }),
    });

    if (!res.ok) {
      console.warn('[ghl-webhook] Opportunity search failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const opps = data.opportunities || [];
    if (opps.length === 0) return null;

    // Return the first (most recent) opportunity
    const opp = opps[0];
    return {
      id: opp.id,
      pipelineStageId: opp.pipelineStageId,
      pipelineId: opp.pipelineId,
      status: opp.status || 'open',
      monetaryValue: opp.monetaryValue,
    };
  } catch (err) {
    console.error('[ghl-webhook] Error fetching opportunity:', err);
    return null;
  }
}

/** Update client pipeline fields from an opportunity's stage data */
async function updateClientPipelineFields(
  supabase: any,
  clientId: string,
  opportunityId: string,
  ghlStageId: string,
  opportunityStatus: string,
  monetaryValue?: number
) {
  const stageInfo = await resolveStage(supabase, ghlStageId);

  const updateData: Record<string, any> = {
    ghl_opportunity_id: opportunityId,
    opportunity_status: opportunityStatus,
    pipeline_updated_at: new Date().toISOString(),
    ghl_last_synced_at: new Date().toISOString(),
    ghl_sync_status: 'synced',
  };

  if (stageInfo) {
    updateData.pipeline_status = stageInfo.stageName;
    updateData.current_stage_id = stageInfo.stageUuid;
    updateData.current_pipeline_id = stageInfo.pipelineUuid;
    console.log(`[ghl-webhook] Resolved stage: ${stageInfo.stageName} (${stageInfo.pipelineName})`);
  } else {
    console.warn(`[ghl-webhook] Could not resolve GHL stage ID: ${ghlStageId} — stage may not be synced yet`);
  }

  if (monetaryValue) {
    updateData.borrowing_capacity = monetaryValue;
  }

  const { error } = await supabase
    .from('clients')
    .update(updateData)
    .eq('id', clientId);

  if (error) {
    console.error('[ghl-webhook] Error updating pipeline fields:', error);
  } else {
    console.log(`[ghl-webhook] Updated pipeline fields for client ${clientId}`);
  }
}

// ─── Opportunity Event Handler ──────────────────────────────────────────────

async function handleOpportunityEvent(supabase: any, body: any) {
  // GHL opportunity webhooks typically include: id, pipelineId, pipelineStageId, contact.id, status
  const opp = body;
  const opportunityId = opp.id;
  const contactId = opp.contact?.id || opp.contactId || opp.contact_id;
  const pipelineStageId = opp.pipelineStageId || opp.pipeline_stage_id;
  const pipelineId = opp.pipelineId || opp.pipeline_id;
  const status = opp.status || 'open';
  const monetaryValue = opp.monetaryValue || opp.monetary_value;

  if (!contactId) {
    console.error('[ghl-webhook] Opportunity event missing contactId');
    return { success: false, error: 'Missing contactId in opportunity event' };
  }

  if (!pipelineStageId) {
    console.error('[ghl-webhook] Opportunity event missing pipelineStageId');
    return { success: false, error: 'Missing pipelineStageId' };
  }

  console.log(`[ghl-webhook] Processing opportunity event: opp=${opportunityId}, contact=${contactId}, stage=${pipelineStageId}`);

  // Find client by ghl_contact_id
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('ghl_contact_id', contactId)
    .maybeSingle();

  if (!client) {
    console.warn(`[ghl-webhook] No client found for GHL contact ${contactId} — opportunity event ignored`);
    return { success: false, error: 'Client not found for this contact' };
  }

  await updateClientPipelineFields(supabase, client.id, opportunityId, pipelineStageId, status, monetaryValue);

  return {
    success: true,
    clientId: client.id,
    stageSynced: true,
  };
}

// ─── Contact Event Handler (existing logic) ─────────────────────────────────

async function handleContactEvent(supabase: any, body: any, apiKey: string | null, locationId: string | null) {
  const contact = body.contact || body;
  const contactId = contact.id || body.contact_id || body.contactId;
  const firstName = contact.firstName || contact.first_name || body.first_name || 'Unknown';
  const lastName = contact.lastName || contact.last_name || body.last_name || 'Unknown';
  const email = contact.email || body.email || null;
  const phone = contact.phone || body.phone || null;
  const address = contact.address1 || body.address1 || null;
  const city = contact.city || body.city || null;
  const state = contact.state || body.state || null;
  const postalCode = contact.postalCode || body.postalCode || null;
  const country = contact.country || body.country || 'Australia';
  const source = contact.source || body.source || null;
  const dateAdded = contact.dateAdded || body.dateAdded || new Date().toISOString();
  const customFields = contact.customFields || body.customFields || [];
  const tags = contact.tags || body.tags || [];

  if (!contactId) {
    console.error('[ghl-webhook] No contact ID in webhook payload');
    return { success: false, error: 'Missing contact ID', status: 400 };
  }

  const fullAddress = [address, city, state, postalCode].filter(Boolean).join(', ') || null;

  const clientData: Record<string, any> = {
    primary_first_name: firstName,
    primary_surname: lastName,
    primary_email: email,
    primary_mobile: phone,
    current_address: fullAddress,
    country: country,
    ghl_contact_id: contactId,
    ghl_sync_status: 'synced',
    ghl_last_synced_at: new Date().toISOString(),
  };

  // Check if client already exists by ghl_contact_id
  const { data: existingByGhl } = await supabase
    .from('clients')
    .select('id')
    .eq('ghl_contact_id', contactId)
    .maybeSingle();

  let clientDbId: string | null = null;
  let isNewClient = false;

  if (existingByGhl) {
    const { error: updateError } = await supabase
      .from('clients')
      .update(clientData)
      .eq('id', existingByGhl.id);
    if (updateError) console.error('[ghl-webhook] Error updating client:', updateError);
    clientDbId = existingByGhl.id;
    console.log('[ghl-webhook] Updated existing client:', clientDbId);
  } else if (email) {
    const { data: existingByEmail } = await supabase
      .from('clients')
      .select('id')
      .eq('primary_email', email)
      .maybeSingle();

    if (existingByEmail) {
      const { error: updateError } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', existingByEmail.id);
      if (updateError) console.error('[ghl-webhook] Error updating client by email:', updateError);
      clientDbId = existingByEmail.id;
      console.log('[ghl-webhook] Updated client by email match:', clientDbId);
    }
  }

  if (!clientDbId) {
    const { data: inserted, error: insertError } = await supabase
      .from('clients')
      .insert(clientData)
      .select('id')
      .single();

    if (insertError) {
      console.error('[ghl-webhook] Error inserting client:', insertError);
      return { success: false, error: 'Failed to create client', details: insertError.message, status: 500 };
    }
    clientDbId = inserted.id;
    isNewClient = true;
    console.log('[ghl-webhook] Created new client:', clientDbId);
  }

  // ── Auto-fetch opportunity from GHL API to populate pipeline fields ──
  if (clientDbId && apiKey && locationId) {
    console.log(`[ghl-webhook] Auto-fetching opportunity for contact ${contactId}...`);
    const opp = await fetchOpportunityForContact(contactId, apiKey, locationId);
    if (opp) {
      console.log(`[ghl-webhook] Found opportunity ${opp.id} at stage ${opp.pipelineStageId}`);
      await updateClientPipelineFields(supabase, clientDbId, opp.id, opp.pipelineStageId, opp.status, opp.monetaryValue);
    } else {
      console.log(`[ghl-webhook] No opportunity found for contact ${contactId} (may be created later)`);
    }
  }

  // ── Extract UTM attribution data ──
  const utmSource = getCustomField(customFields, ['utm_source', 'utmSource']) || source;
  const utmMedium = getCustomField(customFields, ['utm_medium', 'utmMedium']);
  const utmCampaign = getCustomField(customFields, ['utm_campaign', 'utmCampaign']);
  const utmContent = getCustomField(customFields, ['utm_content', 'utmContent']);
  const utmTerm = getCustomField(customFields, ['utm_term', 'utmTerm']);
  const metaCampaignId = getCustomField(customFields, ['meta_campaign_id', 'fb_campaign_id', 'facebook_campaign_id']);
  const metaAdsetId = getCustomField(customFields, ['meta_adset_id', 'fb_adset_id', 'facebook_adset_id']);
  const metaAdId = getCustomField(customFields, ['meta_ad_id', 'fb_ad_id', 'facebook_ad_id']);
  const landingPage = getCustomField(customFields, ['landing_page', 'landing_page_url', 'page_url', 'full_url']);
  const fbclid = getCustomField(customFields, ['fbclid', 'fb_click_id']);
  const gclid = getCustomField(customFields, ['gclid', 'google_click_id']);
  const deviceType = getCustomField(customFields, ['device', 'device_type']);
  const geoLocation = getCustomField(customFields, ['geo_location', 'location', 'ip_city']);
  const conversionPage = getCustomField(customFields, ['conversion_page', 'form_url', 'conversion_url']);

  const ghlAttrSource = contact.attributionSource || contact.attribution_source
    || getCustomField(customFields, ['attribution_source']) || null;
  const ghlLastAttrSource = contact.lastAttributionSource || contact.last_attribution_source
    || getCustomField(customFields, ['last_attribution_source']) || null;

  const hasAttribution = utmSource || utmMedium || utmCampaign || utmContent || utmTerm
    || metaCampaignId || metaAdsetId || metaAdId || fbclid || gclid || source
    || ghlAttrSource || ghlLastAttrSource;

  if (clientDbId && hasAttribution) {
    const attributionData = {
      client_id: clientDbId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
      landing_page_url: landingPage,
      fbclid,
      gclid,
      device_type: deviceType,
      geo_location: geoLocation,
      conversion_page_url: conversionPage,
      ghl_attribution_source: ghlAttrSource,
      ghl_last_attribution_source: ghlLastAttrSource,
      source_type: 'webhook_auto',
      ghl_contact_id: contactId,
      attributed_at: dateAdded,
      enrichment_status: metaCampaignId ? 'pending' : 'not_applicable',
    };

    const { error: attrError } = await supabase
      .from('lead_source_attributions')
      .upsert(attributionData, { onConflict: 'ghl_contact_id' })
      .select();

    if (attrError) {
      console.warn('[ghl-webhook] Upsert failed, trying insert:', attrError.message);
      const { error: insertAttrError } = await supabase
        .from('lead_source_attributions')
        .insert(attributionData);
      if (insertAttrError) {
        console.error('[ghl-webhook] Failed to save attribution:', insertAttrError.message);
      }
    }

    console.log('[ghl-webhook] Saved attribution data for client:', clientDbId);
  }

  return {
    success: true,
    clientId: clientDbId,
    isNewClient,
    hasAttribution: !!hasAttribution,
    status: 200,
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('GHL_WEBHOOK_SECRET');
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');

    if (!supabaseUrl || !supabaseKey) {
      console.error('[ghl-webhook] Missing Supabase credentials');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();

    console.log('[ghl-webhook] Received webhook:', JSON.stringify({
      type: body.type,
      contactId: body.contact_id || body.id,
      pipelineStageId: body.pipelineStageId,
      hasCustomFields: !!body.customFields,
    }));

    // Optional: verify webhook secret if configured
    if (webhookSecret) {
      const headerSecret = req.headers.get('x-ghl-webhook-secret');
      if (headerSecret !== webhookSecret) {
        console.warn('[ghl-webhook] Invalid webhook secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Detect event type ──
    // GHL webhook types: ContactCreate, ContactUpdate, OpportunityCreate,
    // OpportunityStageUpdate, OpportunityStatusUpdate, OpportunityMonetaryValueUpdate, etc.
    const eventType = (body.type || body.event || body.eventType || '').toLowerCase();

    const isOpportunityEvent = eventType.includes('opportunity')
      || body.pipelineStageId
      || body.pipelineId
      || (body.pipeline_stage_id && body.contact);

    if (isOpportunityEvent) {
      console.log(`[ghl-webhook] Detected opportunity event: ${eventType || 'inferred from payload'}`);
      const result = await handleOpportunityEvent(supabase, body);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: contact event
    console.log(`[ghl-webhook] Processing as contact event: ${eventType || 'default'}`);
    const result = await handleContactEvent(supabase, body, apiKey || null, locationId || null);
    const httpStatus = result.status || 200;
    delete result.status;

    return new Response(JSON.stringify(result), {
      status: httpStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ghl-webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
