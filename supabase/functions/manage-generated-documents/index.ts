// Batch 7E.2 — Generated documents (loan/cover/etc) + DocuSign envelope tracking
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createForbiddenResponse, createCorsHeaders } from '../_shared/auth.ts';
import { requireModulePermission, permForAction } from '../_shared/authz.ts';
import { logSecurityEvent } from '../_shared/auth_v2.ts';
import { getDocuSignAccessToken, getDocuSignRestBaseUrl } from '../_shared/docusign-auth.ts';
import { buildFreeformEnvelope, pdfBytesToBase64, type FreeformRecipient, type FreeformTab } from '../_shared/docusign-freeform.ts';

interface Body {
  action: 'list' | 'get' | 'create' | 'update' | 'update_status' | 'append_audit' | 'list_signature_events' | 'delete' | 'save_signing_layout' | 'send_freeform' | 'check_status' | 'envelope_details' | 'download_signed';
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

    // AUTHZ (Critical 8): "valid dashboard session" is NOT authorization here.
    // This function can list/read/mutate any generated document and send it
    // through the org DocuSign account to arbitrary recipients. Gate every
    // action on the agreements module permission (deny-by-default; superadmin
    // and verified service calls bypass). Send/void/delete require the stronger
    // edit/delete flags via permForAction.
    const requiredPerm = permForAction(body.action);
    const authz = await requireModulePermission(
      supabase,
      { userId: auth.userId, authMethod: auth.authMethod },
      'agreements',
      requiredPerm,
    );
    if (!authz.ok) {
      await logSecurityEvent(supabase, {
        action: `generated_documents.${body.action}`,
        decision: 'deny',
        reason_code: authz.reason_code,
        actor_type: 'human',
        actor_id: auth.userId,
      });
      return createForbiddenResponse(authz.error || 'Access denied', cors);
    }

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

      case 'check_status':
      case 'envelope_details': {
        if (!body.id) return j({ success: false, error: 'Missing id' }, 400);
        const { data: doc, error: dErr } = await supabase.from('generated_documents').select('*').eq('id', body.id).single();
        if (dErr || !doc?.docusign_envelope_id) return j({ success: false, error: 'Envelope not found' }, 404);
        const acct = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
        if (!acct) return j({ success: false, error: 'DocuSign not configured' }, 422);
        let token: string;
        try { token = await getDocuSignAccessToken(); }
        catch (e: any) { return j({ success: false, error: `DocuSign auth: ${e.message}` }, 401); }
        const auth = { Authorization: `Bearer ${token}` };
        const base = getDocuSignRestBaseUrl();
        const envId = doc.docusign_envelope_id;
        const [envRes, recRes, evtRes] = await Promise.all([
          fetch(`${base}/v2.1/accounts/${acct}/envelopes/${envId}`, { headers: auth }),
          fetch(`${base}/v2.1/accounts/${acct}/envelopes/${envId}/recipients`, { headers: auth }),
          fetch(`${base}/v2.1/accounts/${acct}/envelopes/${envId}/audit_events`, { headers: auth }),
        ]);
        const envelope = await envRes.json();
        if (!envRes.ok) return j({ success: false, error: `DocuSign: ${envelope?.message || 'Unknown'}` }, 502);
        const recipients = recRes.ok ? await recRes.json() : null;
        const auditRaw = evtRes.ok ? await evtRes.json() : null;

        let newStatus = doc.status;
        const updates: Record<string, any> = { docusign_status: envelope.status };
        if (envelope.status === 'completed') { newStatus = 'signed'; updates.signed_at = envelope.completedDateTime || new Date().toISOString(); }
        else if (envelope.status === 'delivered') newStatus = 'viewed';
        else if (envelope.status === 'sent') newStatus = 'sent';
        else if (envelope.status === 'declined') newStatus = 'voided';
        else if (envelope.status === 'voided') { newStatus = 'voided'; updates.voided_at = envelope.voidedDateTime || new Date().toISOString(); updates.voided_reason = envelope.voidedReason || null; }
        updates.status = newStatus;
        await supabase.from('generated_documents').update(updates).eq('id', body.id);

        const events = (auditRaw?.auditEvents || []).map((ev: any) => {
          const fields: Record<string, string> = {};
          (ev.eventFields || []).forEach((f: any) => { fields[f.name] = f.value; });
          return {
            action: fields.Action || fields.action || 'event',
            description: fields.Description || fields.description || '',
            user: fields.UserName || fields.userName || '',
            email: fields.UserEmail || fields.userEmail || '',
            timestamp: fields.LogTime || fields.logTime || '',
          };
        }).filter((e: any) => e.timestamp);

        const signers = (recipients?.signers || []).map((s: any) => ({
          name: s.name, email: s.email, status: s.status, routingOrder: s.routingOrder,
          sentAt: s.sentDateTime, deliveredAt: s.deliveredDateTime, signedAt: s.signedDateTime, declinedReason: s.declinedReason,
        }));

        return j({
          success: true,
          envelope: {
            envelopeId: envelope.envelopeId, status: envelope.status, emailSubject: envelope.emailSubject,
            sentDateTime: envelope.sentDateTime, statusChangedDateTime: envelope.statusChangedDateTime,
            completedDateTime: envelope.completedDateTime, voidedDateTime: envelope.voidedDateTime, voidedReason: envelope.voidedReason,
          },
          signers, events, mapped_status: newStatus,
        });
      }

      case 'download_signed': {
        if (!body.id) return j({ success: false, error: 'Missing id' }, 400);
        const { data: doc, error: dErr } = await supabase.from('generated_documents').select('id, title, docusign_envelope_id').eq('id', body.id).single();
        if (dErr || !doc?.docusign_envelope_id) return j({ success: false, error: 'Envelope not found' }, 404);
        const acct = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
        if (!acct) return j({ success: false, error: 'DocuSign not configured' }, 422);
        let token: string;
        try { token = await getDocuSignAccessToken(); }
        catch (e: any) { return j({ success: false, error: `DocuSign auth: ${e.message}` }, 401); }
        const url = `${getDocuSignRestBaseUrl()}/v2.1/accounts/${acct}/envelopes/${doc.docusign_envelope_id}/documents/combined`;
        const dsRes = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } });
        if (!dsRes.ok) {
          const txt = await dsRes.text();
          return j({ success: false, error: `DocuSign: ${txt.substring(0, 300)}` }, 502);
        }
        const bytes = new Uint8Array(await dsRes.arrayBuffer());
        let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        const filename = `${(doc.title || 'Document').replace(/[^a-z0-9]+/gi, '_')}_signed.pdf`;
        return j({ success: true, pdf_base64: b64, filename });
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
