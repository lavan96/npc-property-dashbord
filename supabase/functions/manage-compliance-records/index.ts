// Batch 7E.2 — Compliance records (versioned) + pack exports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createForbiddenResponse, createCorsHeaders } from '../_shared/auth.ts';
import { requireModulePermission, permForAction } from '../_shared/authz.ts';
import { logSecurityEvent } from '../_shared/auth_v2.ts';

interface Body {
  action: 'list' | 'get' | 'create_version' | 'update_status' | 'pack_export' | 'list_packs' | 'delete';
  id?: string;
  data?: Record<string, any>;
  filters?: Record<string, any>;
  session_token?: string;
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

    // AUTHZ: compliance records hold sensitive client/deal/signature/regulatory
    // material. Gate every action on the finance_portal_admin module permission
    // (deny-by-default; superadmin + verified service bypass).
    const authz = await requireModulePermission(
      supabase,
      { userId: auth.userId, authMethod: auth.authMethod },
      'finance_portal_admin',
      permForAction(body.action),
    );
    if (!authz.ok) {
      await logSecurityEvent(supabase, {
        action: `compliance_records.${body.action}`, decision: 'deny',
        reason_code: authz.reason_code, actor_type: 'human', actor_id: auth.userId,
      });
      return createForbiddenResponse(authz.error || 'Access denied', cors);
    }

    const j = (data: any, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    switch (body.action) {
      case 'list': {
        let q = supabase.from('compliance_records').select('*').order('generated_at', { ascending: false });
        const f = body.filters || {};
        if (f.client_id) q = q.eq('client_id', f.client_id);
        if (f.deal_id) q = q.eq('deal_id', f.deal_id);
        if (f.type) q = q.eq('type', f.type);
        if (f.is_current !== undefined) q = q.eq('is_current', f.is_current);
        const { data, error } = await q;
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'get': {
        const { data, error } = await supabase.from('compliance_records').select('*').eq('id', body.id!).maybeSingle();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'create_version': {
        const { client_id, type } = body.data || {};
        if (!client_id || !type) return j({ success: false, error: 'client_id and type required' }, 400);
        const { data: latest } = await supabase
          .from('compliance_records').select('version')
          .eq('client_id', client_id).eq('type', type)
          .order('version', { ascending: false }).limit(1).maybeSingle();
        const nextVersion = (latest?.version || 0) + 1;
        const insertRow = { ...body.data, version: nextVersion, is_current: true, generated_by: auth.userId };
        const { data, error } = await supabase.from('compliance_records').insert(insertRow).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'update_status': {
        const updates: Record<string, any> = { status: body.data?.status };
        if (body.data?.signed_at) updates.signed_at = body.data.signed_at;
        if (body.data?.signed_by_name) updates.signed_by_name = body.data.signed_by_name;
        if (body.data?.docusign_status) updates.docusign_status = body.data.docusign_status;
        if (body.data?.signed_pdf_storage_path) updates.signed_pdf_storage_path = body.data.signed_pdf_storage_path;
        const { data, error } = await supabase.from('compliance_records').update(updates).eq('id', body.id!).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'delete': {
        const { error } = await supabase.from('compliance_records').delete().eq('id', body.id!);
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data: { ok: true } });
      }

      case 'pack_export': {
        const insertRow = {
          client_id: body.data?.client_id,
          deal_id: body.data?.deal_id,
          included_record_ids: body.data?.included_record_ids || [],
          included_types: body.data?.included_types || [],
          shared_with_client: !!body.data?.shared_with_client,
          notes: body.data?.notes,
          generated_by: auth.userId,
        };
        const { data, error } = await supabase.from('compliance_pack_exports').insert(insertRow).select().single();
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }

      case 'list_packs': {
        const { data, error } = await supabase
          .from('compliance_pack_exports').select('*')
          .eq('client_id', body.filters?.client_id || '').order('generated_at', { ascending: false });
        if (error) return j({ success: false, error: error.message }, 500);
        return j({ success: true, data });
      }
    }

    return j({ success: false, error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[manage-compliance-records]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
