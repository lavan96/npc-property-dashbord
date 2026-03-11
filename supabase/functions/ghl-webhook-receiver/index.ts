import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('GHL_WEBHOOK_SECRET');

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

    // GHL sends different payload shapes depending on the event type
    // Normalize the contact data
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
      return new Response(JSON.stringify({ error: 'Missing contact ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fullAddress = [address, city, state, postalCode].filter(Boolean).join(', ') || null;

    const clientData = {
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
      // Update existing
      const { error: updateError } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', existingByGhl.id);

      if (updateError) {
        console.error('[ghl-webhook] Error updating client:', updateError);
      }
      clientDbId = existingByGhl.id;
      console.log('[ghl-webhook] Updated existing client:', clientDbId);
    } else if (email) {
      // Check by email
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

        if (updateError) {
          console.error('[ghl-webhook] Error updating client by email:', updateError);
        }
        clientDbId = existingByEmail.id;
        console.log('[ghl-webhook] Updated client by email match:', clientDbId);
      }
    }

    if (!clientDbId) {
      // Insert new client
      const { data: inserted, error: insertError } = await supabase
        .from('clients')
        .insert(clientData)
        .select('id')
        .single();

      if (insertError) {
        console.error('[ghl-webhook] Error inserting client:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create client', details: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      clientDbId = inserted.id;
      isNewClient = true;
      console.log('[ghl-webhook] Created new client:', clientDbId);
    }

    // Extract UTM attribution data
    const getCustomField = (keys: string[]) => {
      for (const key of keys) {
        const field = customFields.find((f: any) =>
          f.key === key || f.id === key || f.fieldKey === key
        );
        if (field?.value) return field.value;
      }
      return null;
    };

    const utmSource = getCustomField(['utm_source', 'utmSource']) || source;
    const utmMedium = getCustomField(['utm_medium', 'utmMedium']);
    const utmCampaign = getCustomField(['utm_campaign', 'utmCampaign']);
    const utmContent = getCustomField(['utm_content', 'utmContent']);
    const utmTerm = getCustomField(['utm_term', 'utmTerm']);
    const metaCampaignId = getCustomField(['meta_campaign_id', 'fb_campaign_id', 'facebook_campaign_id']);
    const metaAdsetId = getCustomField(['meta_adset_id', 'fb_adset_id', 'facebook_adset_id']);
    const metaAdId = getCustomField(['meta_ad_id', 'fb_ad_id', 'facebook_ad_id']);
    const landingPage = getCustomField(['landing_page', 'landing_page_url', 'page_url', 'full_url']);
    const fbclid = getCustomField(['fbclid', 'fb_click_id']);
    const gclid = getCustomField(['gclid', 'google_click_id']);
    const deviceType = getCustomField(['device', 'device_type']);
    const geoLocation = getCustomField(['geo_location', 'location', 'ip_city']);
    const conversionPage = getCustomField(['conversion_page', 'form_url', 'conversion_url']);

    // GHL native attribution fields
    const ghlAttrSource = contact.attributionSource || contact.attribution_source
      || getCustomField(['attribution_source']) || null;
    const ghlLastAttrSource = contact.lastAttributionSource || contact.last_attribution_source
      || getCustomField(['last_attribution_source']) || null;

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

      // Upsert to avoid duplicates on re-sent webhooks
      const { error: attrError } = await supabase
        .from('lead_source_attributions')
        .upsert(attributionData, { onConflict: 'ghl_contact_id' })
        .select();

      if (attrError) {
        // If upsert fails (e.g., no unique constraint on ghl_contact_id), try insert
        console.warn('[ghl-webhook] Upsert failed, trying insert:', attrError.message);
        const { error: insertAttrError } = await supabase
          .from('lead_source_attributions')
          .insert(attributionData);

        if (insertAttrError) {
          console.error('[ghl-webhook] Failed to save attribution:', insertAttrError.message);
        }
      }

      console.log('[ghl-webhook] Saved attribution data for client:', clientDbId, {
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      clientId: clientDbId,
      isNewClient,
      hasAttribution: !!hasAttribution,
    }), {
      status: 200,
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
