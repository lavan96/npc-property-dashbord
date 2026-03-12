import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface Phase5Request {
  action: 'creatives' | 'funnel' | 'true_roi';
  datePreset?: string;
  timeRange?: { since: string; until: string };
  insights?: any[];
  campaigns?: any[];
  limit?: number;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: Phase5Request = await req.json().catch(() => ({ action: 'creatives' }));

    const authResult = await verifyAuth(supabase, req.headers, body as any);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    const action = body.action || 'creatives';

    // ─── ACTION: CREATIVES ───
    if (action === 'creatives') {
      const accessToken = Deno.env.get('META_ADS_ACCESS_TOKEN');
      const adAccountId = Deno.env.get('META_ADS_AD_ACCOUNT_ID');

      if (!accessToken || !adAccountId) {
        return new Response(
          JSON.stringify({ success: false, error: 'Meta Ads credentials not configured.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const limit = Math.min(body.limit || 20, 50);

      // Fetch ads with creative fields including video
      const adsUrl = `${META_BASE_URL}/${accountId}/ads?access_token=${accessToken}&fields=id,name,status,creative{id,thumbnail_url,image_url,image_hash,title,body,call_to_action_type,object_story_spec},insights.date_preset(${body.datePreset || 'last_30d'}){spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,reach}&limit=${limit}`;

      console.log(`[meta-ads-phase5] Fetching creatives for ${accountId}`);

      const metaResponse = await fetch(adsUrl);
      const metaData = await metaResponse.json();

      if (!metaResponse.ok) {
        console.error('[meta-ads-phase5] Meta API error:', JSON.stringify(metaData));
        return new Response(
          JSON.stringify({ success: false, error: metaData?.error?.message || 'Meta API error' }),
          { status: metaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process ads into creative cards
      const rawCreatives = (metaData.data || []).map((ad: any) => {
        const creative = ad.creative || {};
        const insightsData = ad.insights?.data?.[0] || {};
        const leads = (insightsData.actions || []).find((a: any) => a.action_type === 'lead');
        const leadCount = leads ? Number(leads.value) : 0;
        const spend = Number(insightsData.spend || 0);
        const cpl = leadCount > 0 ? spend / leadCount : 0;

        // Extract video ID from object_story_spec
        const storySpec = creative.object_story_spec || {};
        const videoData = storySpec.video_data || {};
        const videoId = videoData.video_id || null;

        // Determine media type
        const isVideo = !!videoId;

        return {
          ad_id: ad.id,
          ad_name: ad.name,
          status: ad.status,
          thumbnail_url: creative.thumbnail_url || creative.image_url || null,
          image_url: creative.image_url || null,
          title: creative.title || null,
          body: creative.body || null,
          cta_type: creative.call_to_action_type || null,
          is_video: isVideo,
          video_id: videoId,
          video_url: null as string | null,
          spend: spend,
          impressions: Number(insightsData.impressions || 0),
          clicks: Number(insightsData.clicks || 0),
          ctr: Number(insightsData.ctr || 0),
          cpc: Number(insightsData.cpc || 0),
          reach: Number(insightsData.reach || 0),
          leads: leadCount,
          cpl: cpl,
        };
      }).filter((c: any) => c.spend > 0)
        .sort((a: any, b: any) => b.spend - a.spend);

      // Fetch video source URLs in parallel
      const videoCreatives = rawCreatives.filter((c: any) => c.video_id);
      if (videoCreatives.length > 0) {
        const videoFetches = videoCreatives.map(async (c: any) => {
          try {
            const videoRes = await fetch(`${META_BASE_URL}/${c.video_id}?fields=source,thumbnails{uri,width,height}&access_token=${accessToken}`);
            const videoJson = await videoRes.json();
            if (videoJson.source) {
              c.video_url = videoJson.source;
            }
            // Get highest-res thumbnail for video creatives
            const thumbs = videoJson.thumbnails?.data;
            if (thumbs && thumbs.length > 0) {
              // Pick the largest thumbnail available
              const bestThumb = thumbs.reduce((best: any, t: any) => (t.width > (best?.width || 0)) ? t : best, thumbs[0]);
              if (bestThumb?.uri) {
                c.image_url = bestThumb.uri;
              }
            }
          } catch (e) {
            console.warn(`[meta-ads-phase5] Failed to fetch video ${c.video_id}:`, e);
          }
        });
        await Promise.all(videoFetches);
      }

      const creatives = rawCreatives;

      // Log API usage
      await supabase.from('api_usage_log').insert({
        service_name: 'meta_ads',
        endpoint: 'creatives',
        status: 'success',
        request_count: 1,
        user_id: null,
        metadata: { action: 'creatives', userId: authResult.userId },
      });

      return new Response(
        JSON.stringify({ success: true, creatives }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── ACTION: FUNNEL ───
    if (action === 'funnel') {
      // Get lead attributions with deal info
      const { data: attributions, error: attrError } = await supabase
        .from('lead_source_attributions')
        .select('id, client_id, deal_id, meta_campaign_id, meta_campaign_name, meta_ad_id, meta_ad_name, meta_adset_id, meta_adset_name, attributed_at, source_type')
        .not('meta_campaign_id', 'is', null)
        .order('attributed_at', { ascending: false })
        .limit(500);

      if (attrError) {
        console.error('[meta-ads-phase5] Attribution query error:', attrError);
      }

      // Get deals for these leads
      const dealIds = (attributions || []).filter((a: any) => a.deal_id).map((a: any) => a.deal_id);
      let deals: any[] = [];
      if (dealIds.length > 0) {
        const { data: dealData } = await supabase
          .from('client_deals')
          .select('id, current_stage, current_stage_number, deal_type, total_contract_price, commission_estimate, settlement_date, created_at')
          .in('id', dealIds);
        deals = dealData || [];
      }

      // Get total client count (all leads, not just attributed)
      const { count: totalClients } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true });

      // Build funnel stages
      const totalLeads = attributions?.length || 0;
      const leadsWithDeals = (attributions || []).filter((a: any) => a.deal_id).length;
      
      // Classify deal stages
      const qualifiedDeals = deals.filter(d => d.current_stage_number >= 2).length;
      const approvedDeals = deals.filter(d => d.current_stage_number >= 4).length;
      const settledDeals = deals.filter(d => d.current_stage_number >= 6 || d.settlement_date).length;

      // Build by-campaign breakdown
      const campaignMap: Record<string, any> = {};
      for (const attr of (attributions || [])) {
        const cid = attr.meta_campaign_id || 'unknown';
        if (!campaignMap[cid]) {
          campaignMap[cid] = {
            campaign_id: cid,
            campaign_name: attr.meta_campaign_name || 'Unknown',
            leads: 0,
            deals: 0,
            qualified: 0,
            approved: 0,
            settled: 0,
          };
        }
        campaignMap[cid].leads++;
        if (attr.deal_id) {
          campaignMap[cid].deals++;
          const deal = deals.find(d => d.id === attr.deal_id);
          if (deal) {
            if (deal.current_stage_number >= 2) campaignMap[cid].qualified++;
            if (deal.current_stage_number >= 4) campaignMap[cid].approved++;
            if (deal.current_stage_number >= 6 || deal.settlement_date) campaignMap[cid].settled++;
          }
        }
      }

      const funnel = {
        stages: [
          { name: 'Meta Leads (Attributed)', value: totalLeads, color: 'hsl(var(--primary))' },
          { name: 'Deals Created', value: leadsWithDeals, color: 'hsl(220, 70%, 55%)' },
          { name: 'Qualified', value: qualifiedDeals, color: 'hsl(160, 60%, 45%)' },
          { name: 'Approved', value: approvedDeals, color: 'hsl(30, 80%, 55%)' },
          { name: 'Settled / Won', value: settledDeals, color: 'hsl(142, 71%, 45%)' },
        ],
        byCampaign: Object.values(campaignMap).sort((a: any, b: any) => b.leads - a.leads),
        totalClients: totalClients || 0,
      };

      return new Response(
        JSON.stringify({ success: true, funnel }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── ACTION: TRUE ROI ───
    if (action === 'true_roi') {
      const metaInsights = body.insights || [];
      
      // Get attributions with deals
      const { data: attributions } = await supabase
        .from('lead_source_attributions')
        .select('id, client_id, deal_id, meta_campaign_id, meta_campaign_name, attributed_at')
        .not('meta_campaign_id', 'is', null)
        .limit(500);

      const dealIds = (attributions || []).filter((a: any) => a.deal_id).map((a: any) => a.deal_id);
      let deals: any[] = [];
      if (dealIds.length > 0) {
        const { data: dealData } = await supabase
          .from('client_deals')
          .select('id, current_stage, current_stage_number, total_contract_price, commission_estimate, settlement_date, deal_type')
          .in('id', dealIds);
        deals = dealData || [];
      }

      // Calculate per-campaign ROI
      const campaignROI: Record<string, any> = {};
      
      // Aggregate Meta spend by campaign
      for (const row of metaInsights) {
        const cid = row.campaign_id;
        if (!cid) continue;
        if (!campaignROI[cid]) {
          campaignROI[cid] = {
            campaign_id: cid,
            campaign_name: row.campaign_name || 'Unknown',
            meta_spend: 0,
            meta_leads: 0,
            meta_clicks: 0,
            attributed_leads: 0,
            deals_created: 0,
            deals_settled: 0,
            total_deal_value: 0,
            total_commission: 0,
            meta_cpl: 0,
            true_cpl: 0,
            cost_per_deal: 0,
            roas: 0,
          };
        }
        campaignROI[cid].meta_spend += Number(row.spend || 0);
        campaignROI[cid].meta_clicks += Number(row.clicks || 0);
        const leadAction = (row.actions || []).find((a: any) => a.action_type === 'lead');
        campaignROI[cid].meta_leads += leadAction ? Number(leadAction.value) : 0;
      }

      // Enrich with CRM data
      for (const attr of (attributions || [])) {
        const cid = attr.meta_campaign_id;
        if (!cid || !campaignROI[cid]) continue;
        campaignROI[cid].attributed_leads++;
        if (attr.deal_id) {
          campaignROI[cid].deals_created++;
          const deal = deals.find(d => d.id === attr.deal_id);
          if (deal) {
            if (deal.current_stage_number >= 6 || deal.settlement_date) {
              campaignROI[cid].deals_settled++;
              campaignROI[cid].total_deal_value += Number(deal.total_contract_price || 0);
              campaignROI[cid].total_commission += Number(deal.commission_estimate || 0);
            }
          }
        }
      }

      // Calculate derived metrics
      const results = Object.values(campaignROI).map((c: any) => {
        c.meta_cpl = c.meta_leads > 0 ? c.meta_spend / c.meta_leads : 0;
        c.true_cpl = c.attributed_leads > 0 ? c.meta_spend / c.attributed_leads : 0;
        c.cost_per_deal = c.deals_created > 0 ? c.meta_spend / c.deals_created : 0;
        c.cost_per_settled = c.deals_settled > 0 ? c.meta_spend / c.deals_settled : 0;
        c.roas = c.meta_spend > 0 ? c.total_commission / c.meta_spend : 0;
        return c;
      }).sort((a: any, b: any) => b.meta_spend - a.meta_spend);

      // Totals
      const totals = results.reduce((acc: any, r: any) => {
        acc.meta_spend += r.meta_spend;
        acc.meta_leads += r.meta_leads;
        acc.attributed_leads += r.attributed_leads;
        acc.deals_created += r.deals_created;
        acc.deals_settled += r.deals_settled;
        acc.total_deal_value += r.total_deal_value;
        acc.total_commission += r.total_commission;
        return acc;
      }, { meta_spend: 0, meta_leads: 0, attributed_leads: 0, deals_created: 0, deals_settled: 0, total_deal_value: 0, total_commission: 0 });

      totals.meta_cpl = totals.meta_leads > 0 ? totals.meta_spend / totals.meta_leads : 0;
      totals.true_cpl = totals.attributed_leads > 0 ? totals.meta_spend / totals.attributed_leads : 0;
      totals.cost_per_deal = totals.deals_created > 0 ? totals.meta_spend / totals.deals_created : 0;
      totals.cost_per_settled = totals.deals_settled > 0 ? totals.meta_spend / totals.deals_settled : 0;
      totals.roas = totals.meta_spend > 0 ? totals.total_commission / totals.meta_spend : 0;

      return new Response(
        JSON.stringify({ success: true, campaigns: results, totals }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[meta-ads-phase5] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
