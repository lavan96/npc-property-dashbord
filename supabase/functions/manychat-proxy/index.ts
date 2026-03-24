import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

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

    const body = await req.json().catch(() => ({}));

    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    const MANYCHAT_API_KEY = Deno.env.get('MANYCHAT_API_KEY');
    if (!MANYCHAT_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'MANYCHAT_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = body;
    const headers = {
      'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    let result: any = {};

    switch (action) {
      case 'get_subscribers_count': {
        // Get page info which includes subscriber count
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getInfo`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, pageInfo: data.data };
        break;
      }

      case 'get_flows': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/sending/getFlows`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, flows: data.data || [] };
        break;
      }

      case 'get_tags': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getTags`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, tags: data.data || [] };
        break;
      }

      case 'get_custom_fields': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getCustomFields`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, customFields: data.data || [] };
        break;
      }

      case 'get_widgets': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getGrowthTools`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, widgets: data.data || [] };
        break;
      }

      case 'get_subscriber': {
        const { subscriberId } = body;
        if (!subscriberId) {
          return new Response(
            JSON.stringify({ success: false, error: 'subscriberId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const resp = await fetch(`${MANYCHAT_API_BASE}/subscriber/getInfo?subscriber_id=${subscriberId}`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, subscriber: data.data };
        break;
      }

      case 'find_subscriber': {
        const { name } = body;
        if (!name) {
          return new Response(
            JSON.stringify({ success: false, error: 'name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const resp = await fetch(`${MANYCHAT_API_BASE}/subscriber/findByName`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name }),
        });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, subscribers: data.data || [] };
        break;
      }

      case 'get_overview': {
        // Fetch page info, tags, and flows in parallel for the overview dashboard
        const [pageResp, tagsResp, flowsResp, widgetsResp] = await Promise.all([
          fetch(`${MANYCHAT_API_BASE}/page/getInfo`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getTags`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/sending/getFlows`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getGrowthTools`, { headers }),
        ]);

        if (!pageResp.ok) throw new Error(`ManyChat page info error [${pageResp.status}]: ${await pageResp.text()}`);
        
        const pageData = await pageResp.json();
        const tagsData = tagsResp.ok ? await tagsResp.json() : { data: [] };
        const flowsData = flowsResp.ok ? await flowsResp.json() : { data: [] };
        const widgetsData = widgetsResp.ok ? await widgetsResp.json() : { data: [] };

        result = {
          success: true,
          pageInfo: pageData.data,
          tags: tagsData.data || [],
          flows: flowsData.data || [],
          widgets: widgetsData.data || [],
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ManyChat proxy error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...createCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
    );
  }
});
