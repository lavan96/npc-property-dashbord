import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { extractSessionToken, createCorsHeaders } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Valid bucket names that this function can access
const ALLOWED_BUCKETS = [
  'client-files',
  'client-documents', 
  'vownet-forms',
  'investment-reports',
  'report-templates',
  'branding-assets',
  'qa_exports',
  'email-attachments'
];

interface SessionValidationResult {
  error: string | null;
  userId: string | null;
  username: string | null;
}

async function verifySession(supabase: any, sessionToken: string | null | undefined): Promise<SessionValidationResult> {
  if (!sessionToken) {
    return { error: 'No session token provided', userId: null, username: null };
  }

  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error || !session) {
    return { error: 'Invalid session token', userId: null, username: null };
  }

  if (new Date(session.expires_at) < new Date()) {
    return { error: 'Session expired', userId: null, username: null };
  }

  // Optionally get username for logging
  let username = null;
  try {
    const { data: user } = await supabase
      .from('custom_users')
      .select('username')
      .eq('id', session.user_id)
      .maybeSingle();
    username = user?.username;
  } catch (e) {
    // Username lookup is optional
  }

  return { error: null, userId: session.user_id, username };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    
    const { 
      operation,  // 'upload', 'download', 'delete', 'signedUrl', 'list'
      bucket,
      path,
      file_data,      // Base64 encoded file content for upload
      content_type,   // MIME type for upload
      expires_in,     // Seconds for signed URL (default 3600)
      upsert,         // Boolean for upload
    } = body;

    // Extract session token from cookie, header, or body
    const session_token = extractSessionToken(req.headers, body);

    // Validate session
    const sessionResult = await verifySession(supabase, session_token);
    if (sessionResult.error) {
      console.log(`[Secure Storage] Auth failed: ${sessionResult.error}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: sessionResult.error 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Secure Storage] User ${sessionResult.username || sessionResult.userId} - ${operation} on ${bucket}/${path}`);

    // Validate bucket
    if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Invalid bucket: ${bucket}. Allowed: ${ALLOWED_BUCKETS.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle operations
    switch (operation) {
      case 'upload': {
        if (!path || !file_data) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing path or file_data' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Decode base64 file data
        const fileBytes = base64Decode(file_data);
        
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, fileBytes, {
            contentType: content_type || 'application/octet-stream',
            upsert: upsert || false
          });

        if (error) {
          console.error(`[Secure Storage] Upload error:`, error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Secure Storage] Uploaded: ${bucket}/${path}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { path: data.path, fullPath: data.fullPath } 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'download': {
        if (!path) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing path' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase.storage
          .from(bucket)
          .download(path);

        if (error) {
          console.error(`[Secure Storage] Download error:`, error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Convert blob to base64 for transport
        const arrayBuffer = await data.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        
        console.log(`[Secure Storage] Downloaded: ${bucket}/${path}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { 
            content: base64,
            contentType: data.type,
            size: data.size
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        if (!path) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing path' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Handle single path or array of paths
        const paths = Array.isArray(path) ? path : [path];
        
        const { data, error } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (error) {
          console.error(`[Secure Storage] Delete error:`, error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Secure Storage] Deleted: ${bucket}/${paths.join(', ')}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { deleted: paths }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'signedUrl': {
        if (!path) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing path' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expires_in || 3600);

        if (error) {
          console.error(`[Secure Storage] Signed URL error:`, error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Secure Storage] Created signed URL: ${bucket}/${path}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { signedUrl: data.signedUrl }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list': {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(path || '', {
            limit: 100,
            offset: 0
          });

        if (error) {
          console.error(`[Secure Storage] List error:`, error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[Secure Storage] Listed: ${bucket}/${path || ''} (${data?.length || 0} items)`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { files: data }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'publicUrl': {
        // For buckets that allow public read (like branding-assets)
        if (!path) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing path' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        console.log(`[Secure Storage] Public URL: ${bucket}/${path}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: { publicUrl: data.publicUrl }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Unknown operation: ${operation}. Valid: upload, download, delete, signedUrl, list, publicUrl` 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('[Secure Storage] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
