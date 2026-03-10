import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse } from '../_shared/auth.ts';

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
  'cloudflare': ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_ACCOUNT_ID'],
  'meta_ads': ['META_ADS_ACCESS_TOKEN', 'META_ADS_AD_ACCOUNT_ID'],
};

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authentication and admin role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body: { integrationId?: string } = await req.json().catch(() => ({}));
    
    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      console.log('[check-integration-secrets] Auth failed:', authResult.error);
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }
    
    // Check if user has superadmin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authResult.userId)
      .eq('role', 'superadmin')
      .single();

    if (roleError || !roleData) {
      console.warn(`User ${authResult.userId} attempted to check integration secrets without superadmin role.`);
      return createForbiddenResponse('Forbidden: Superadmin access required', corsHeaders);
    }
    console.log(`Superadmin ${authResult.userId} is checking integration secrets.`);

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
