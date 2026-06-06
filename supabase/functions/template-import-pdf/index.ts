// Template PDF importer.
// Operations: create_import | upload_asset | finalize | fail
//
// upload_asset accepts base64 PNG/JPG, stores in `template-import-assets`
// (creates the bucket on first use) and returns the public URL. finalize
// writes the assembled ReportTemplate JSON into `report_templates` via the
// service-role client (RLS-only table).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'template-import-assets';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function ensureBucket(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const operation = body.operation as string;
    const userId = body.user_id ?? null;

    if (operation === 'create_import') {
      const { data, error } = await admin
        .from('template_imports')
        .insert({
          user_id: userId,
          status: 'processing',
          fidelity_mode: body.fidelity_mode ?? 'semantic',
          source_filename: body.source_filename ?? null,
          source_size_bytes: body.source_size_bytes ?? null,
          page_count: body.page_count ?? null,
          meta: body.meta ?? {},
        })
        .select()
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ record: data });
    }

    if (operation === 'upload_asset') {
      await ensureBucket(admin);
      const importId = body.import_id as string;
      const kind = (body.kind ?? 'page') as string; // 'page' | 'image'
      const pageIndex = body.page_index ?? 0;
      const seq = body.seq ?? 0;
      const contentType = body.content_type ?? 'image/png';
      const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
      const path = `${importId}/${kind}-${pageIndex}-${seq}.${ext}`;
      const bytes = b64ToBytes(body.data_base64 as string);
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) return json({ error: upErr.message }, 400);
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      return json({ url: pub.publicUrl, path });
    }

    if (operation === 'finalize') {
      const importId = body.import_id as string;
      const name = (body.name as string) ?? 'Imported template';
      const schema = body.schema;
      const pageCount = body.page_count ?? null;
      // Insert into report_templates (service role bypasses RLS)
      const { data: tpl, error: tplErr } = await admin
        .from('report_templates')
        .insert({
          name,
          description: `Imported from ${body.source_filename ?? 'PDF'}`,
          schema,
          version: 1,
          is_active: false,
          is_default: false,
        })
        .select()
        .single();
      if (tplErr) return json({ error: tplErr.message }, 400);

      await admin.from('template_imports').update({
        status: 'completed',
        created_template_id: tpl.id,
        page_count: pageCount,
      }).eq('id', importId);

      // Snapshot initial version if the versions table exists.
      try {
        await admin.from('report_template_versions').insert({
          template_id: tpl.id,
          version: 1,
          schema,
          notes: 'Imported from PDF',
        });
      } catch (_) { /* ignore if table absent */ }

      return json({ template: tpl });
    }

    if (operation === 'fail') {
      const importId = body.import_id as string;
      await admin.from('template_imports').update({
        status: 'failed',
        error: String(body.error ?? 'unknown'),
      }).eq('id', importId);
      return json({ ok: true });
    }

    return json({ error: 'unknown operation' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
