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
  const { error } = await supabase.from('migration_job_items').upsert(
    {
      job_id: params.job_id,
      source_id: params.source_id,
      target_id: params.target_id ?? null,
      entity_label: params.entity_label ?? null,
      status: params.status,
      error_message: params.error_message ?? null,
      processed_at: new Date().toISOString(),
      attempts: 1,
    },
    { onConflict: 'job_id,source_id' },
  );
  if (error) console.error(`recordItem failed: ${error.message}`);
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
    { onConflict: 'resource_type,old_ghl_id,source_account_label,target_account_label' },
  );
  if (error) console.error(`recordIdMapping failed: ${error.message}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
