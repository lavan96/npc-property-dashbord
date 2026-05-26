/**
 * Finance Portal — Lender Packet builder (Phase 7.2 C3)
 * Returns a manifest of signed download URLs + metadata for a purchase file's
 * uploaded documents in lender-preferred order. The client assembles the ZIP
 * and cover sheet with JSZip + jsPDF.
 */
import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finance-session-token, x-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'finance-portal-documents';
const SIGNED_URL_TTL = 60 * 30; // 30 min

// Lender-preferred ordering for packets
const PACKET_ORDER = [
  'identity',
  'income_payg', 'income_self_employed',
  'bank_statements',
  'assets', 'liabilities', 'existing_loans',
  'deposit_proof',
  'purchase_docs',
  'valuation',
  'loan_approval',
  'settlement',
  'other',
];

function json(d: any, status = 200) {
  return new Response(JSON.stringify(d), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function tokenFrom(headers: Headers, body?: any) {
  return headers.get('x-finance-session-token')
    || body?.finance_session_token
    || headers.get('x-session-token')
    || body?.session_token
    || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));
    const sessionToken = tokenFrom(req.headers, body);
    if (!sessionToken) return json({ error: 'Session token required' }, 401);

    const { data: portalUser } = await supabase
      .from('finance_portal_users')
      .select('id, email, is_active, revoked_at, session_expires_at, global_permissions')
      .eq('session_token', sessionToken)
      .maybeSingle();
    if (!portalUser || !portalUser.is_active || portalUser.revoked_at) return json({ error: 'Invalid session' }, 401);
    if (!portalUser.session_expires_at || new Date(portalUser.session_expires_at) < new Date()) return json({ error: 'Session expired' }, 401);

    const fileId = body.purchase_file_id;
    if (!fileId) return json({ error: 'purchase_file_id required' }, 400);

    const { data: file } = await supabase
      .from('purchase_files')
      .select('id, client_id, title, lender_key, lender_name, loan_amount, property_address, settlement_date, status')
      .eq('id', fileId)
      .maybeSingle();
    if (!file) return json({ error: 'Not found' }, 404);

    const { data: assignment } = await supabase
      .from('finance_portal_client_assignments')
      .select('permissions')
      .eq('finance_user_id', portalUser.id)
      .eq('client_id', file.client_id)
      .maybeSingle();
    if (!assignment) return json({ error: 'Not assigned' }, 403);

    const { data: reqs } = await supabase
      .from('document_requirement_instances')
      .select('id, label, category, status, quality_status, quality_flags, detected_doc_date, soft_expiry_date, document_id, finance_portal_documents(id, original_filename, storage_path, mime_type, file_size)')
      .eq('purchase_file_id', fileId)
      .not('document_id', 'is', null);

    const { data: client } = await supabase
      .from('clients')
      .select('first_name, surname, email, phone_number')
      .eq('id', file.client_id)
      .maybeSingle();

    // Conditions ledger
    const { data: conditions } = await supabase
      .from('purchase_file_conditions')
      .select('id, label, status, due_date, notes')
      .eq('purchase_file_id', fileId)
      .order('status').order('due_date');

    // Borrowing snapshot if present
    const { data: snapshot } = await supabase
      .from('purchase_file_borrowing_snapshots')
      .select('*')
      .eq('purchase_file_id', fileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build manifest with signed URLs in lender order
    const orderIdx = (cat: string) => {
      const i = PACKET_ORDER.indexOf(cat);
      return i === -1 ? 999 : i;
    };
    const sorted = (reqs || []).slice().sort((a: any, b: any) => orderIdx(a.category) - orderIdx(b.category));

    const files: any[] = [];
    let seq = 1;
    for (const r of sorted as any[]) {
      const doc = r.finance_portal_documents;
      if (!doc) continue;
      const { data: signed, error: sErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_TTL);
      if (sErr || !signed) continue;
      const num = String(seq).padStart(2, '0');
      const safeLabel = (r.label || doc.original_filename).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 80);
      const ext = (doc.original_filename.split('.').pop() || 'bin').toLowerCase();
      files.push({
        sequence: seq,
        packet_filename: `${num} - ${r.category} - ${safeLabel}.${ext}`,
        original_filename: doc.original_filename,
        signed_url: signed.signedUrl,
        category: r.category,
        label: r.label,
        mime_type: doc.mime_type,
        file_size: doc.file_size,
        quality_status: r.quality_status,
        detected_date: r.detected_doc_date,
        requirement_status: r.status,
      });
      seq++;
    }

    const meta = {
      file: {
        id: file.id,
        title: file.title,
        lender_name: file.lender_name || file.lender_key || 'N/A',
        loan_amount: file.loan_amount,
        property_address: file.property_address,
        settlement_date: file.settlement_date,
        status: file.status,
      },
      client: client ? {
        name: `${client.first_name || ''} ${client.surname || ''}`.trim(),
        email: client.email,
        phone: client.phone_number,
      } : null,
      conditions: conditions || [],
      borrowing_snapshot: snapshot || null,
      generated_at: new Date().toISOString(),
      generated_by: portalUser.email,
      file_count: files.length,
    };

    return json({ meta, files });
  } catch (e: any) {
    return json({ error: e?.message || 'Unexpected error' }, 500);
  }
});
