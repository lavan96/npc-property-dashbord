// Batch 7E.2 — Generated documents (loan/cover/etc) + DocuSign envelope tracking
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';
import { getDocuSignAccessToken, getDocuSignRestBaseUrl } from '../_shared/docusign-auth.ts';
import { buildFreeformEnvelope, pdfBytesToBase64, type FreeformRecipient, type FreeformTab } from '../_shared/docusign-freeform.ts';

interface Body {
  action: 'list' | 'get' | 'create' | 'update' | 'update_status' | 'append_audit' | 'list_signature_events' | 'delete' | 'save_signing_layout' | 'send_freeform' | 'check_status';
  id?: string;
  data?: Record<string, any>;
  filters?: Record<string, any>;
  session_token?: string;
  bucket?: string;
  signing_recipients?: FreeformRecipient[];
  signing_layout?: FreeformTab[];
  email_subject?: string;
  email_blurb?: string;
}

Deno.serve(async (req) => {
  const cors = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body: Body = await req.json();
    const auth = await verifyAuth(supabase, req.headers, body);
    if (auth.error || !auth.userId) return createUnauthorizedResponse(auth.error || 'Auth required', cors);

    const j = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    switch (body.action) {
      case 'list': {
        let q = supabase.from('generated_documents').select('*').order('created_at', { ascending: false }).limit(500);
        const f = body.filters || {};
        if (f.client_id) q = q.eq('client_id', f.client_id);
        if (f.deal_id) q = q.eq('deal_id', f.deal_id);
        if (f.submission_id) q = q.eq('submission_id', f.submission_id);
        if (f.status) q = q.eq('status', f.status);
        if (f.template_type) q = q.eq('template_type', f.template_type);
        const { data, error } = await q;
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'get': {
        const { data, error } = await supabase.from('generated_documents').select('*').eq('id', body.id!).maybeSingle();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'create': {
        const insertRow = { ...(body.data || {}), generated_by: auth.userId };
        const { data, error } = await supabase.from('generated_documents').insert(insertRow).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'update': {
        const { data, error } = await supabase.from('generated_documents').update(body.data || {}).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'update_status': {
        const updates: Record<string, any> = { status: body.data?.status, ...(body.data || {}) };
        delete updates.id;
        const status = body.data?.status;
        if (status === 'sent') updates.sent_at = new Date().toISOString();
        if (status === 'viewed') updates.viewed_at = new Date().toISOString();
        if (status === 'signed') updates.signed_at = new Date().toISOString();
        if (status === 'voided') updates.voided_at = new Date().toISOString();
        const { data, error } = await supabase.from('generated_documents').update(updates).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'append_audit': {
        const { data: existing } = await supabase.from('generated_documents').select('audit').eq('id', body.id!).single();
        const audit = Array.isArray((existing as any)?.audit) ? (existing as any).audit : [];
        audit.push({ ...(body.data?.event || {}), ts: new Date().toISOString(), user_id: auth.userId });
        const { data, error } = await supabase.from('generated_documents').update({ audit }).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'delete': {
        const { error } = await supabase.from('generated_documents').delete().eq('id', body.id!);
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data: { ok: true } });
      }

      case 'list_signature_events': {
        const f = body.filters || {};
        let q = supabase.from('document_signature_events').select('*').order('occurred_at', { ascending: false }).limit(200);
        if (f.document_id) q = q.eq('document_id', f.document_id);
        else if (f.compliance_record_id) q = q.eq('compliance_record_id', f.compliance_record_id);
        else if (f.envelope_id) q = q.eq('docusign_envelope_id', f.envelope_id);
        const { data, error } = await q;
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }
    }

    return j({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-generated-documents]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
