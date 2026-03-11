import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey || !locationId) {
      return new Response(JSON.stringify({ error: 'GHL credentials not configured', success: false }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const body = await req.json().catch(() => ({}));

    // Verify auth - admin only
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['superadmin', 'admin'])
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required', success: false }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { batchSize = 50, offset = 0 } = body;

    console.log(`[backfill] Starting attribution backfill. Offset: ${offset}, Batch: ${batchSize}`);

    // Fetch clients that have a ghl_contact_id but no attribution record
    const { data: clients, error: fetchError } = await supabase
      .from('clients')
      .select('id, ghl_contact_id, primary_first_name, primary_surname')
      .not('ghl_contact_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (fetchError) {
      console.error('[backfill] Error fetching clients:', fetchError);
      throw new Error(`Failed to fetch clients: ${fetchError.message}`);
    }

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No more clients to process',
        stats: { processed: 0, attributed: 0, skipped: 0, errors: 0 },
        hasMore: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which clients already have attributions
    const clientIds = clients.map((c: any) => c.id);
    const { data: existingAttributions } = await supabase
      .from('lead_source_attributions')
      .select('client_id')
      .in('client_id', clientIds);

    const existingSet = new Set((existingAttributions || []).map((a: any) => a.client_id));

    const ghlHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    };

    let attributed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const client of clients) {
      // Skip if already has attribution
      if (existingSet.has(client.id)) {
        skipped++;
        continue;
      }

      try {
        // Fetch contact details from GHL
        const response = await fetch(`${GHL_API_BASE}/contacts/${client.ghl_contact_id}`, {
          headers: ghlHeaders,
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 404) {
            console.warn(`[backfill] GHL contact ${client.ghl_contact_id} not found, skipping`);
            skipped++;
            continue;
          }
          throw new Error(`GHL API ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const contact = data.contact || data;

        // Extract attribution data
        const customFields = contact.customFields || [];
        const getField = (keys: string[]) => {
          for (const key of keys) {
            const field = customFields.find((f: any) =>
              f.key === key || f.id === key || f.fieldKey === key
            );
            if (field?.value) return field.value;
          }
          return null;
        };

        const utmSource = getField(['utm_source', 'utmSource']) || contact.source || null;
        const utmMedium = getField(['utm_medium', 'utmMedium']);
        const utmCampaign = getField(['utm_campaign', 'utmCampaign']);
        const utmContent = getField(['utm_content', 'utmContent']);
        const utmTerm = getField(['utm_term', 'utmTerm']);
        const metaCampaignId = getField(['meta_campaign_id', 'fb_campaign_id', 'facebook_campaign_id']);
        const metaAdsetId = getField(['meta_adset_id', 'fb_adset_id', 'facebook_adset_id']);
        const metaAdId = getField(['meta_ad_id', 'fb_ad_id', 'facebook_ad_id']);
        const landingPage = getField(['landing_page', 'landing_page_url', 'page_url', 'full_url']);
        const fbclid = getField(['fbclid', 'fb_click_id']);
        const gclid = getField(['gclid', 'google_click_id']);
        const deviceType = getField(['device', 'device_type']);
        const geoLocation = getField(['geo_location', 'location', 'ip_city']);
        const conversionPage = getField(['conversion_page', 'form_url', 'conversion_url']);

        // GHL native attribution
        const ghlAttrSource = contact.attributionSource || contact.attribution_source
          || getField(['attribution_source']) || null;
        const ghlLastAttrSource = contact.lastAttributionSource || contact.last_attribution_source
          || getField(['last_attribution_source']) || null;

        const hasData = utmSource || utmMedium || utmCampaign || utmContent || utmTerm
          || metaCampaignId || fbclid || gclid || contact.source || ghlAttrSource;

        if (!hasData) {
          skipped++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('lead_source_attributions')
          .insert({
            client_id: client.id,
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
            source_type: 'backfill',
            ghl_contact_id: client.ghl_contact_id,
            attributed_at: contact.dateAdded || new Date().toISOString(),
            enrichment_status: metaCampaignId ? 'pending' : 'not_applicable',
          });

        if (insertError) {
          console.error(`[backfill] Insert error for ${client.id}:`, insertError.message);
          errors++;
          errorDetails.push(`${client.primary_first_name} ${client.primary_surname}: ${insertError.message}`);
        } else {
          attributed++;
          console.log(`[backfill] Attributed ${client.primary_first_name} ${client.primary_surname}: source=${utmSource}, campaign=${utmCampaign}`);
        }

        // Rate limit: ~2 requests per second to avoid GHL throttling
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`[backfill] Error processing ${client.ghl_contact_id}:`, err.message);
        errors++;
        errorDetails.push(`${client.primary_first_name} ${client.primary_surname}: ${err.message}`);
      }
    }

    const hasMore = clients.length === batchSize;
    const nextOffset = offset + batchSize;

    console.log(`[backfill] Batch complete. Attributed: ${attributed}, Skipped: ${skipped}, Errors: ${errors}, HasMore: ${hasMore}`);

    return new Response(JSON.stringify({
      success: true,
      message: hasMore
        ? `Processed ${clients.length} clients. ${attributed} attributed, ${skipped} skipped, ${errors} errors. More available...`
        : `Backfill complete! ${attributed} attributed, ${skipped} skipped, ${errors} errors.`,
      stats: {
        processed: clients.length,
        attributed,
        skipped,
        errors,
      },
      hasMore,
      nextOffset,
      errors: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[backfill] Error:', error);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
