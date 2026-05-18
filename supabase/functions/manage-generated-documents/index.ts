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

      case 'save_signing_layout': {
        if (!body.id) return j({ success: false, error: 'Missing id' }, 400);
        const { error } = await supabase.from('generated_documents').update({
          signing_recipients: body.signing_recipients ?? [],
          signing_layout: body.signing_layout ?? [],
          signing_prepared_at: new Date().toISOString(),
        }).eq('id', body.id);
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true });
      }

      case 'send_freeform': {
        if (!body.id) return j({ success: false, error: 'Missing id' }, 400);
        const recipients = body.signing_recipients ?? [];
        const tabs = body.signing_layout ?? [];
        if (recipients.length === 0) return j({ success: false, error: 'At least one recipient required' }, 400);
        if (tabs.length === 0) return j({ success: false, error: 'Place at least one field' }, 400);
        for (const r of recipients) {
          if (!r.email || !r.name) return j({ success: false, error: 'Recipient missing name/email' }, 400);
        }
        const { data: doc, error: dErr } = await supabase.from('generated_documents').select('*').eq('id', body.id).single();
        if (dErr || !doc) return j({ success: false, error: 'Document not found' }, 404);
        if (!doc.pdf_storage_path) return j({ success: false, error: 'PDF not ready' }, 409);
        const bucket = body.bucket || 'client-documents';
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(doc.pdf_storage_path);
        if (dlErr || !blob) return j({ success: false, error: `Failed to load PDF from ${bucket}: ${dlErr?.message}` }, 500);
        const pdfBytes = new Uint8Array(await blob.arrayBuffer());

        const accountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
        if (!accountId) return j({ success: false, error: 'DOCUSIGN_ACCOUNT_ID not configured', requires_setup: true }, 422);
        let token: string;
        try { token = await getDocuSignAccessToken(); }
        catch (e: any) { return j({ success: false, error: `DocuSign auth: ${e.message}` }, 401); }

        const envelope = buildFreeformEnvelope({
          pdfBase64: pdfBytesToBase64(pdfBytes),
          documentName: `${doc.title || 'Document'}.pdf`,
          recipients, tabs,
          emailSubject: body.email_subject || `${doc.title || 'Document for signature'}`,
          emailBlurb: body.email_blurb || 'Please review and sign the attached document.',
        });
        const url = `${getDocuSignRestBaseUrl()}/v2.1/accounts/${accountId}/envelopes`;
        const dsRes = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        });
        const txt = await dsRes.text();
        let dsData: any; try { dsData = JSON.parse(txt); } catch { return j({ success: false, error: `DocuSign non-JSON (${dsRes.status})`, raw: txt.substring(0, 400) }, 502); }
        if (!dsRes.ok) {
          console.error('[generated-docs freeform] envelope failed:', txt.substring(0, 1000));
          return j({ success: false, error: `DocuSign: ${dsData.message || dsData.errorCode || 'Unknown'}`, details: dsData }, dsRes.status);
        }
        await supabase.from('generated_documents').update({
          status: 'sent',
          docusign_envelope_id: dsData.envelopeId,
          docusign_status: dsData.status,
          sent_at: new Date().toISOString(),
          sent_to: recipients.map(r => r.email),
          signing_recipients: recipients,
          signing_layout: tabs,
          signing_prepared_at: new Date().toISOString(),
        }).eq('id', body.id);
        return j({ success: true, envelope_id: dsData.envelopeId, status: dsData.status });
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
