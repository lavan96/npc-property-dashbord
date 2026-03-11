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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    
    const body = await req.json().catch(() => ({}));
    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, corsHeaders);

    const { contactId } = body;
    if (!contactId) {
      return new Response(JSON.stringify({ error: 'contactId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch raw contact from GHL
    const response = await fetch(`${GHL_API_BASE}/contacts/${contactId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-04-15',
        'Content-Type': 'application/json',
      },
    });

    const rawData = await response.json();
    const contact = rawData.contact || rawData;

    // Extract all attribution-related fields
    const diagnosis = {
      contactId,
      contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      source: contact.source,
      attributionSource: contact.attributionSource || null,
      lastAttributionSource: contact.lastAttributionSource || null,
      attribution_source: contact.attribution_source || null,
      last_attribution_source: contact.last_attribution_source || null,
      // Check all possible field names
      customFieldKeys: (contact.customFields || []).map((f: any) => ({
        key: f.key || f.fieldKey,
        id: f.id,
        value: f.value,
      })).filter((f: any) => f.value),
      // Check for any utm-related top-level fields
      topLevelKeys: Object.keys(contact).filter((k: string) => 
        k.toLowerCase().includes('utm') || 
        k.toLowerCase().includes('campaign') || 
        k.toLowerCase().includes('attribution') ||
        k.toLowerCase().includes('source') ||
        k.toLowerCase().includes('medium') ||
        k.toLowerCase().includes('fbclid') ||
        k.toLowerCase().includes('gclid') ||
        k.toLowerCase().includes('ad')
      ),
      // Dump relevant top-level values
      relevantFields: {} as Record<string, any>,
    };

    for (const key of diagnosis.topLevelKeys) {
      diagnosis.relevantFields[key] = contact[key];
    }

    console.log('[diagnose] Full diagnosis:', JSON.stringify(diagnosis, null, 2));

    return new Response(JSON.stringify({ success: true, diagnosis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[diagnose] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
