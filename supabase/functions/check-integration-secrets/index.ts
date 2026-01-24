import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthContext } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map of integration IDs to their secret names
const integrationSecretMap: Record<string, string[]> = {
  'airtable': ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE_NAME'],
  'vapi': ['VAPI_API_KEY'],
  'gohighlevel': ['GOHIGHLEVEL_API_KEY', 'GOHIGHLEVEL_LOCATION_ID'],
  'openai': ['OPENAI_API_KEY'],
  'perplexity': ['PERPLEXITY_API_KEY'],
  'microsoft': ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 'MICROSOFT_MAILBOX_EMAIL'],
  'resend': ['RESEND_API_KEY'],
  'domain': ['DOMAIN_API_KEY'],
  'google': ['GOOGLE_MAPS_API_KEY'],
  'firecrawl': ['FIRECRAWL_API_KEY'],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authContext = await getAuthContext(req, { logTag: "check-integration-secrets" });
    if (!authContext.supabaseUser && !authContext.customUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    let body: { integrationId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, return all integrations
    }

    // If specific integration requested, return just that one with extra info
    if (body.integrationId) {
      const integrationId = body.integrationId;
      const secretNames = integrationSecretMap[integrationId];
      
      if (!secretNames) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unknown integration' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const configuredSecrets: string[] = [];
      const missingSecrets: string[] = [];

      for (const secretName of secretNames) {
        const value = Deno.env.get(secretName);
        if (value && value.trim() !== '') {
          configuredSecrets.push(secretName);
        } else {
          missingSecrets.push(secretName);
        }
      }

      const response: Record<string, unknown> = {
        success: true,
        configured: configuredSecrets.length === secretNames.length,
        configuredSecrets,
        missingSecrets,
      };

      // For GHL, also return the location ID (non-sensitive, needed for building URLs)
      if (integrationId === 'gohighlevel') {
        response.locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID') || null;
      }

      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: return all integrations status
    const results: Record<string, { configured: boolean; configuredSecrets: string[]; missingSecrets: string[] }> = {};

    for (const [integrationId, secretNames] of Object.entries(integrationSecretMap)) {
      const configuredSecrets: string[] = [];
      const missingSecrets: string[] = [];

      for (const secretName of secretNames) {
        const value = Deno.env.get(secretName);
        if (value && value.trim() !== '') {
          configuredSecrets.push(secretName);
        } else {
          missingSecrets.push(secretName);
        }
      }

      results[integrationId] = {
        configured: configuredSecrets.length === secretNames.length,
        configuredSecrets,
        missingSecrets,
      };
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        integrations: results,
        message: 'These are display-only statuses from Supabase secrets'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking integration secrets:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
