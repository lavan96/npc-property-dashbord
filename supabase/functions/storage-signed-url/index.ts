import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthContext } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_BUCKETS = new Set([
  'branding-assets',
  'client-documents',
  'client-files',
  'investment-reports',
  'report-templates',
  'vownet-forms',
  'qa_exports',
  'email-attachments',
]);

type ActionType = 'download' | 'upload' | 'delete';

interface SignedStorageRequest {
  action: ActionType;
  bucket: string;
  path?: string;
  paths?: string[];
  expiresIn?: number;
  upsert?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await getAuthContext(req, { logTag: "storage-signed-url" });

    const body: SignedStorageRequest = await req.json();
    const { action, bucket, path, paths, expiresIn, upsert } = body;

    if (!action || !bucket) {
      return new Response(
        JSON.stringify({ success: false, error: 'Action and bucket are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bucket not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === 'download') {
      if (!path) {
        return new Response(
          JSON.stringify({ success: false, error: 'Path is required for download' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn ?? 600);

      if (error || !data?.signedUrl) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message ?? 'Failed to create signed URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, signedUrl: data.signedUrl, path }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'upload') {
      if (!path) {
        return new Response(
          JSON.stringify({ success: false, error: 'Path is required for upload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(path, { upsert: Boolean(upsert) });

      if (error || !data?.token) {
        return new Response(
          JSON.stringify({ success: false, error: error?.message ?? 'Failed to create signed upload URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, signedUrl: data.signedUrl, token: data.token, path }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete') {
      const targetPaths = Array.isArray(paths) ? paths : path ? [path] : [];
      if (targetPaths.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'Paths are required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .remove(targetPaths);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, removed: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unsupported action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[storage-signed-url] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
