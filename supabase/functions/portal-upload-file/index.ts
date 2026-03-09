import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
import { createCorsHeaders } from "../_shared/auth.ts"

function extractPortalToken(headers: Headers, formData?: FormData): string | null {
  const headerToken = headers.get('x-portal-session-token');
  if (headerToken) return headerToken;
  if (formData) {
    const token = formData.get('portal_session_token');
    if (token && typeof token === 'string') return token;
  }
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

    const formData = await req.formData();
    const sessionToken = extractPortalToken(req.headers, formData);

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', success: false }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .select(`*, client_portal_users:user_id (id, client_id, email, status)`)
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
    const file = formData.get('file') as File;
    const category = (formData.get('category') as string) || 'general';

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'File too large (max 10MB)', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const filePath = `${clientId}/portal-uploads/${Date.now()}-${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('client-files')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[portal-upload-file] Storage upload error:', uploadError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file: ' + uploadError.message, success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create file record
    const { data: fileRecord, error: insertError } = await supabase
      .from('client_files')
      .insert({
        client_id: clientId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        category: category,
        document_type: 'portal_upload',
        description: `Uploaded via client portal`,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[portal-upload-file] DB insert error:', insertError.message);
      return new Response(
        JSON.stringify({ error: 'File uploaded but record creation failed', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, file: fileRecord }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[portal-upload-file] Error:', error?.message || error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
