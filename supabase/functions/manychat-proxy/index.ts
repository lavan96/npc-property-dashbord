import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

function normalizeList(value: unknown, nestedKeys: string[] = []): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of nestedKeys) {
      const nestedValue = (value as Record<string, unknown>)[key];
      if (Array.isArray(nestedValue)) return nestedValue;
    }
  }
  return [];
}

function normalizeObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
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

    const body = await req.json().catch(() => ({}));

    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    const MANYCHAT_API_KEY = Deno.env.get('MANYCHAT_API_KEY');
    if (!MANYCHAT_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'MANYCHAT_API_KEY is not configured. Add it in Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = body;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    let result: any = {};

    switch (action) {
      case 'get_page_info': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getInfo`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, pageInfo: normalizeObject(data.data) };
        break;
      }

      case 'get_tags': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getTags`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, tags: normalizeList(data.data, ['tags']) };
        break;
      }

      case 'get_custom_fields': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getCustomFields`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, customFields: normalizeList(data.data, ['custom_fields', 'customFields']) };
        break;
      }

      case 'get_widgets': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getGrowthTools`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, widgets: normalizeList(data.data, ['widgets', 'growth_tools']) };
        break;
      }

      case 'get_bot_fields': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getBotFields`, { headers });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, botFields: normalizeList(data.data, ['bot_fields', 'botFields']) };
        break;
      }

      case 'get_flows': {
        const resp = await fetch(`${MANYCHAT_API_BASE}/page/getFlows`, { headers });
        if (resp.status === 404) {
          result = { success: true, flows: [], note: 'Flows endpoint not available for this account type' };
          break;
        }
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = {
          success: true,
          flows: normalizeList(data.data, ['flows']),
          folders: normalizeList(data.data, ['folders']),
        };
        break;
      }

      case 'find_subscriber': {
        const { name } = body;
        if (!name || name.trim().length < 2) {
          return new Response(
            JSON.stringify({ success: false, error: 'Name must be at least 2 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const resp = await fetch(`${MANYCHAT_API_BASE}/subscriber/findByName`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, subscribers: normalizeList(data.data, ['subscribers']) };
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
        result = { success: true, subscriber: normalizeObject(data.data) };
        break;
      }

      case 'find_by_custom_field': {
        const { field_id, field_value } = body;
        if (!field_id || !field_value) {
          return new Response(
            JSON.stringify({ success: false, error: 'field_id and field_value are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const resp = await fetch(`${MANYCHAT_API_BASE}/subscriber/findByCustomField`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ field_id: Number(field_id), field_value }),
        });
        if (!resp.ok) throw new Error(`ManyChat API error [${resp.status}]: ${await resp.text()}`);
        const data = await resp.json();
        result = { success: true, subscribers: normalizeList(data.data, ['subscribers']) };
        break;
      }

      case 'get_overview': {
        const [pageResp, tagsResp, widgetsResp, fieldsResp, botFieldsResp, flowsResp] = await Promise.all([
          fetch(`${MANYCHAT_API_BASE}/page/getInfo`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getTags`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getGrowthTools`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getCustomFields`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getBotFields`, { headers }),
          fetch(`${MANYCHAT_API_BASE}/page/getFlows`, { headers }),
        ]);

        if (!pageResp.ok) throw new Error(`ManyChat page info error [${pageResp.status}]: ${await pageResp.text()}`);

        const pageData = await pageResp.json();
        const tagsData = tagsResp.ok ? await tagsResp.json() : { data: [] };
        const widgetsData = widgetsResp.ok ? await widgetsResp.json() : { data: [] };
        const fieldsData = fieldsResp.ok ? await fieldsResp.json() : { data: [] };
        const botFieldsData = botFieldsResp.ok ? await botFieldsResp.json() : { data: [] };
        const flowsData = flowsResp.ok ? await flowsResp.json() : { data: [] };

        result = {
          success: true,
          pageInfo: normalizeObject(pageData.data),
          tags: normalizeList(tagsData.data, ['tags']),
          widgets: normalizeList(widgetsData.data, ['widgets', 'growth_tools']),
          customFields: normalizeList(fieldsData.data, ['custom_fields', 'customFields']),
          botFields: normalizeList(botFieldsData.data, ['bot_fields', 'botFields']),
          flows: normalizeList(flowsData.data, ['flows']),
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
