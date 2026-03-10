import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowlist of secrets that can be updated via this endpoint
const ALLOWED_SECRETS = new Set([
  'AIRTABLE_TOKEN',
  'AIRTABLE_BASE_ID',
  'AIRTABLE_TABLE_NAME',
  'VAPI_API_KEY',
  'GOHIGHLEVEL_API_KEY',
  'GOHIGHLEVEL_LOCATION_ID',
  'OPENAI_API_KEY',
  'PERPLEXITY_API_KEY',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
  'MICROSOFT_MAILBOX_EMAIL',
  'RESEND_API_KEY',
  'DOMAIN_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'FIRECRAWL_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'CLOUDFLARE_ACCOUNT_ID',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'MAKE_WEBHOOK_URL',
  'META_ADS_ACCESS_TOKEN',
  'META_ADS_AD_ACCOUNT_ID',
]);

// Validation schemas
const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]{2,50}$/;
const MAX_SECRET_VALUE_LENGTH = 2000;

interface UpdateSecretRequest {
  secrets: { name: string; value: string }[];
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAccessToken = Deno.env.get('SUPABASE_ACCESS_TOKEN');
    const projectRef = Deno.env.get('SUPABASE_URL')?.match(/https:\/\/([^.]+)/)?.[1];

    if (!supabaseAccessToken) {
      console.error('SUPABASE_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SUPABASE_ACCESS_TOKEN not configured. Please add your Supabase personal access token to the secrets.',
          setupRequired: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectRef) {
      console.error('Could not determine project reference');
      return new Response(
        JSON.stringify({ success: false, error: 'Could not determine project reference' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Verify authentication and superadmin role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: UpdateSecretRequest = await req.json();
    
    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      console.log('[update-integration-secret] Auth failed:', authResult.error);
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
      console.warn(`User ${authResult.userId} attempted to update integration secrets without superadmin role.`);
      return createForbiddenResponse('Forbidden: Superadmin access required', corsHeaders);
    }
    console.log(`Superadmin ${authResult.userId} is updating integration secrets.`);
    
    if (!body.secrets || !Array.isArray(body.secrets) || body.secrets.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No secrets provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate all secrets before updating
    const validationErrors: string[] = [];
    const validSecrets: { name: string; value: string }[] = [];

    for (const secret of body.secrets) {
      // Validate secret name format
      if (!SECRET_NAME_REGEX.test(secret.name)) {
        validationErrors.push(`Invalid secret name format: ${secret.name}`);
        continue;
      }

      // Check if secret is in allowlist
      if (!ALLOWED_SECRETS.has(secret.name)) {
        validationErrors.push(`Secret not in allowlist: ${secret.name}`);
        continue;
      }

      // Validate secret value length
      if (secret.value && secret.value.length > MAX_SECRET_VALUE_LENGTH) {
        validationErrors.push(`Secret value too long: ${secret.name} (max ${MAX_SECRET_VALUE_LENGTH} chars)`);
        continue;
      }

      // Only include non-empty secrets
      if (secret.value && secret.value.trim()) {
        validSecrets.push({
          name: secret.name,
          value: secret.value.trim()
        });
      }
    }

    if (validSecrets.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No valid secrets to update',
          validationErrors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Updating ${validSecrets.length} secrets for project ${projectRef}`);

    // Call Supabase Management API to update secrets
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validSecrets),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase API error:', response.status, errorText);
      
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid SUPABASE_ACCESS_TOKEN. Please update your personal access token.',
            setupRequired: true
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `Failed to update secrets: ${errorText}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity
    await supabase.from('activity_logs').insert({
      user_id: authResult.userId,
      username: authResult.username,
      action_type: 'update',
      entity_type: 'settings',
      entity_name: 'Integration Secrets',
      metadata: {
        updated_secrets: validSecrets.map(s => s.name),
        validation_warnings: validationErrors.length > 0 ? validationErrors : undefined
      }
    });

    console.log(`Successfully updated ${validSecrets.length} secrets`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully updated ${validSecrets.length} secret(s)`,
        updatedSecrets: validSecrets.map(s => s.name),
        validationWarnings: validationErrors.length > 0 ? validationErrors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error updating secrets:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
