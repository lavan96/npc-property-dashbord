/**
 * Shared helpers for the GHL dual-account migration system.
 * Workers call these to track progress against `migration_jobs` and
 * `migration_job_items`.
 *
 * IMPORTANT: All helpers must be invoked with a service_role Supabase client.
 * They bypass RLS intentionally — workers are the only writers to these tables.
 */

export type MigrationDomain = 'contacts' | 'opportunities' | 'conversations' | 'notes';
export type MigrationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ItemStatus = 'pending' | 'succeeded' | 'failed' | 'skipped';

export interface CreateJobParams {
  domain: MigrationDomain;
  source_account: 'legacy' | 'new';
  target_account: 'legacy' | 'new';
  dry_run: boolean;
  payload?: Record<string, any>;
  created_by?: string | null;
}

export async function createJob(supabase: any, params: CreateJobParams): Promise<string> {
  const { data, error } = await supabase
    .from('migration_jobs')
    .insert({
      domain: params.domain,
      source_account: params.source_account,
      target_account: params.target_account,
      dry_run: params.dry_run,
      payload: params.payload ?? {},
      created_by: params.created_by ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`createJob failed: ${error.message}`);
  return data.id as string;
}

export async function startJob(supabase: any, jobId: string, total: number): Promise<void> {
  const { error } = await supabase
    .from('migration_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      total_items: total,
    })
    .eq('id', jobId);
  if (error) throw new Error(`startJob failed: ${error.message}`);
}

export async function updateJobProgress(
  supabase: any,
  jobId: string,
  patch: Partial<{
    processed_items: number;
    succeeded_items: number;
    failed_items: number;
    total_items: number;
  }>,
): Promise<void> {
  const { error } = await supabase.from('migration_jobs').update(patch).eq('id', jobId);
  if (error) console.error(`updateJobProgress failed: ${error.message}`);
}

export async function finishJob(
  supabase: any,
  jobId: string,
  status: 'completed' | 'failed' | 'cancelled',
  errorSummary?: string,
): Promise<void> {
  const { error } = await supabase
    .from('migration_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      error_summary: errorSummary ?? null,
    })
    .eq('id', jobId);
  if (error) console.error(`finishJob failed: ${error.message}`);
}

export interface RecordItemParams {
  job_id: string;
  source_id: string;
  target_id?: string | null;
  entity_label?: string | null;
  status: ItemStatus;
  error_message?: string | null;
}

export async function recordItem(supabase: any, params: RecordItemParams): Promise<void> {
  const classification = params.status === 'failed'
    ? classifyError(params.error_message || '')
    : { category: null as string | null, retryable: null as boolean | null };
  const { error } = await supabase.from('migration_job_items').upsert(
    {
      job_id: params.job_id,
      source_id: params.source_id,
      target_id: params.target_id ?? null,
      entity_label: params.entity_label ?? null,
      status: params.status,
      error_message: params.error_message ?? null,
      error_category: classification.category,
      is_retryable: classification.retryable,
      processed_at: new Date().toISOString(),
      attempts: 1,
    },
    { onConflict: 'job_id,source_id' },
  );
  if (error) console.error(`recordItem failed: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Checkpoints + self-redispatch
// ─────────────────────────────────────────────────────────────────────────

/**
 * Persist a worker's pagination cursor + last-processed-id so the next
 * dispatch can resume exactly where this run stopped.
 */
export async function saveCheckpoint(
  supabase: any,
  jobId: string,
  cursor: Record<string, any>,
  lastSourceId?: string | null,
): Promise<void> {
  const patch: Record<string, any> = { resume_cursor: cursor };
  if (lastSourceId !== undefined) patch.last_processed_source_id = lastSourceId;
  const { error } = await supabase.from('migration_jobs').update(patch).eq('id', jobId);
  if (error) console.error(`saveCheckpoint failed: ${error.message}`);
}

/**
 * Read the persisted cursor + auto_resume flag + dispatch_count for a job.
 */
export async function loadCheckpoint(
  supabase: any,
  jobId: string,
): Promise<{
  cursor: Record<string, any>;
  lastSourceId: string | null;
  autoResume: boolean;
  dispatchCount: number;
}> {
  const { data } = await supabase
    .from('migration_jobs')
    .select('resume_cursor, last_processed_source_id, auto_resume, dispatch_count')
    .eq('id', jobId)
    .maybeSingle();
  return {
    cursor: (data?.resume_cursor as any) || {},
    lastSourceId: data?.last_processed_source_id || null,
    autoResume: data?.auto_resume !== false,
    dispatchCount: data?.dispatch_count || 0,
  };
}

/**
 * Mark the job as still processing (NOT finished) and fire a fresh
 * worker invocation against the same job_id so it picks up from the
 * saved checkpoint. The caller returns immediately after this resolves.
 *
 * MAX_DISPATCHES guards against infinite loops if a job can never make
 * progress (e.g. cursor never advances).
 */
export async function selfRedispatch(
  supabase: any,
  jobId: string,
  workerName: string,
  workerBody: Record<string, any>,
  opts?: { maxDispatches?: number },
): Promise<{ dispatched: boolean; reason?: string; dispatchCount: number }> {
  // Default to effectively unbounded redispatching. GHL list endpoints are
  // paged (often max 100 records per request), so large locations must keep
  // checkpointing + redispatching until the API returns an empty/short page.
  // Callers can still pass maxDispatches for one-off safety tests.
  const max = opts?.maxDispatches ?? Number.POSITIVE_INFINITY;

  // Increment dispatch_count + record timestamp atomically-ish
  const { data: jobRow } = await supabase
    .from('migration_jobs')
    .select('dispatch_count, auto_resume')
    .eq('id', jobId)
    .maybeSingle();

  const nextCount = (jobRow?.dispatch_count || 0) + 1;
  const autoResume = jobRow?.auto_resume !== false;

  if (!autoResume) {
    return { dispatched: false, reason: 'auto_resume disabled', dispatchCount: jobRow?.dispatch_count || 0 };
  }
  if (Number.isFinite(max) && nextCount > max) {
    return { dispatched: false, reason: `max_dispatches (${max}) exceeded`, dispatchCount: nextCount - 1 };
  }

  await supabase
    .from('migration_jobs')
    .update({
      status: 'processing',
      dispatch_count: nextCount,
      last_dispatched_at: new Date().toISOString(),
      // explicitly clear completed_at in case a previous run set it
      completed_at: null,
    })
    .eq('id', jobId);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const url = `${supabaseUrl}/functions/v1/${workerName}`;

  const dispatch = fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-internal-call': 'true',
    },
    body: JSON.stringify({ ...workerBody, _service_token: serviceRoleKey, _resume: true }),
  })
    .then((r) => {
      if (!r.ok) console.error(`[selfRedispatch] worker ${workerName} returned ${r.status}`);
      else console.log(`[selfRedispatch] worker ${workerName} re-dispatched (#${nextCount}) for job ${jobId}`);
    })
    .catch((e) => console.error(`[selfRedispatch] dispatch threw:`, e?.message));

  // @ts-ignore — EdgeRuntime is provided by Supabase Deno runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(dispatch);
  } else {
    await dispatch; // fallback: best-effort
  }

  return { dispatched: true, dispatchCount: nextCount };
}

/**
 * Categorize error strings into a small fixed taxonomy so the dashboard can
 * separate "transient/retryable" failures from "user-action-required" ones.
 *
 * Categories:
 *   auth       – 401/403/SCOPE/TOKEN/FORBIDDEN  (NOT retryable until secret fixed)
 *   validation – 400/422/INVALID/REQUIRED       (NOT retryable, data fix needed)
 *   not_found  – 404                            (NOT retryable)
 *   rate_limit – 429/RATE_LIMIT/TOO_MANY        (RETRYABLE)
 *   server     – 5xx / SERVER_ERROR             (RETRYABLE)
 *   network    – fetch/timeout/ECONNRESET       (RETRYABLE)
 *   conflict   – 409                            (NOT retryable)
 *   unknown    – everything else                (RETRYABLE)
 */
export function classifyError(msg: string): { category: string; retryable: boolean } {
  const m = (msg || '').toLowerCase();
  if (!m) return { category: 'unknown', retryable: true };

  if (/\b(401|403)\b|forbidden|unauthor|missing.*scope|invalid.*token|token.*invalid/.test(m)) {
    return { category: 'auth', retryable: false };
  }
  if (/\b429\b|rate[_ -]?limit|too[_ -]?many[_ -]?requests/.test(m)) {
    return { category: 'rate_limit', retryable: true };
  }
  if (/\b(400|422)\b|validation|invalid|required/.test(m)) {
    return { category: 'validation', retryable: false };
  }
  if (/\b404\b|not[_ -]?found/.test(m)) {
    return { category: 'not_found', retryable: false };
  }
  if (/\b409\b|conflict|duplicate|already/.test(m)) {
    return { category: 'conflict', retryable: false };
  }
  if (/\b5\d\d\b|server[_ -]?error|bad[_ -]?gateway|gateway[_ -]?timeout|service[_ -]?unavailable/.test(m)) {
    return { category: 'server', retryable: true };
  }
  if (/timeout|econnrefused|econnreset|enotfound|fetch.*failed|network/.test(m)) {
    return { category: 'network', retryable: true };
  }
  return { category: 'unknown', retryable: true };
}

/**
 * Persist (or refresh) an entry in `ghl_id_mapping` so future workers and
 * sync code can translate IDs between the legacy and new accounts.
 */
export async function recordIdMapping(
  supabase: any,
  params: {
    resource_type: 'contact' | 'opportunity' | 'conversation' | 'note' | 'pipeline' | 'pipeline_stage';
    old_ghl_id: string;
    new_ghl_id: string;
    source_account_label: 'legacy' | 'new';
    target_account_label: 'legacy' | 'new';
    notes?: string;
  },
): Promise<void> {
  // The live `ghl_id_mapping` table has a UNIQUE constraint on
  // (resource_type, old_ghl_id) only — match it exactly so ON CONFLICT works.
  const { error } = await supabase.from('ghl_id_mapping').upsert(
    {
      resource_type: params.resource_type,
      old_ghl_id: params.old_ghl_id,
      new_ghl_id: params.new_ghl_id,
      source_account_label: params.source_account_label,
      target_account_label: params.target_account_label,
      notes: params.notes ?? null,
      remapped_at: new Date().toISOString(),
    },
    { onConflict: 'resource_type,old_ghl_id' },
  );
  if (error) console.error(`recordIdMapping failed: ${error.message}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
