import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { createCorsHeaders } from "../_shared/auth.ts"

/**
 * Portal-specific data access Edge Function
 * Authenticates portal users via their session token and returns
 * data scoped ONLY to their linked client_id.
 * 
 * This is separate from get-client-data (which uses internal admin auth).
 */

function extractPortalToken(headers: Headers, body?: any): string | null {
  const headerToken = headers.get('x-portal-session-token');
  if (headerToken) return headerToken;
  if (body?.portal_session_token) return body.portal_session_token;
  const sessionHeader = headers.get('x-session-token');
  if (sessionHeader) return sessionHeader;
  if (body?.session_token) return body.session_token;
  return null;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const sessionToken = extractPortalToken(req.headers, body);

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session and get client_id
    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .select(`
        *,
        client_portal_users:user_id (
          id, client_id, email, status
        )
      `)
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session?.client_portal_users || session.client_portal_users.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = session.client_portal_users.client_id;
    const include = body.include || {};

    const result: Record<string, any> = { success: true, clientId };

    // Fetch client profile
    if (include.client !== false) {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      result.client = client;
    }

    // Fetch properties
    if (include.properties !== false) {
      const { data: properties } = await supabase
        .from('client_properties')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      result.properties = properties || [];
    }

    // Fetch employment
    if (include.employment) {
      const { data: employment } = await supabase
        .from('client_employment')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      result.employment = employment || [];
    }

    // Fetch income sources
    if (include.income) {
      const { data: income } = await supabase
        .from('client_income_sources')
        .select('*')
        .eq('client_id', clientId)
        .order('display_order', { ascending: true });
      result.income = income || [];
    }

    // Fetch expenses
    if (include.expenses) {
      const { data: expenses } = await supabase
        .from('client_expenses')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      result.expenses = expenses || [];
    }

    // Fetch deals
    if (include.deals) {
      const { data: deals } = await supabase
        .from('client_deals')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      result.deals = deals || [];
    }

    // Fetch emails (read-only)
    if (include.emails) {
      const { data: emails } = await supabase
        .from('email_copilot_emails')
        .select('id, subject, sender, to_recipients, received_at, folder, status, urgency_level')
        .eq('client_id', clientId)
        .order('received_at', { ascending: false })
        .limit(100);
      result.emails = emails || [];
    }

    // Fetch files/documents
    if (include.files) {
      const { data: files } = await supabase
        .from('client_files')
        .select('id, file_name, file_path, file_type, file_size, category, document_type, description, uploaded_at')
        .eq('client_id', clientId)
        .order('uploaded_at', { ascending: false });
      result.files = files || [];
    }

    // Fetch borrowing capacity
    if (include.borrowingCapacity) {
      const { data: bc } = await supabase
        .from('borrowing_capacity_assessments')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      result.borrowingCapacity = bc;
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Portal data fetch error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
