const INTERNAL_EDGE_SECRET = (Deno.env.get('INTERNAL_EDGE_SECRET') || '').trim();
// Shared logic for processing bulk_generation_items. Used by both
// `generate-bulk-reports` (initial run) and `resume-bulk-generation` (cron).
//
// Design:
// - Items are claimed atomically via `claim_next_bulk_item` (FOR UPDATE SKIP LOCKED).
// - Each property is wrapped in an AbortController (REPORT_TIMEOUT_MS).
// - A heartbeat interval keeps `heartbeat_at` fresh so the cron requeuer
//   doesn't yank an actively-running item.
// - On failure, items below `max_attempts` are returned to `pending` for
//   the cron to pick up; otherwise marked `failed`.

const REPORT_TIMEOUT_MS = 8 * 60 * 1000; // 8 min per property
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30s
const BATCH_SIZE = 2; // concurrent properties per worker invocation

export interface BulkProperty {
  id: string;
  address: string;
  suburb?: string;
  state?: string;
  zipCode?: string;
}

interface ClaimedItem {
  id: string;
  property_listing_id: string;
  property_address: string;
  attempts: number;
  report_id: string | null;
}

function startHeartbeat(supabase: any, itemId: string): number {
  return setInterval(async () => {
    try {
      await supabase
        .from('bulk_generation_items')
        .update({ heartbeat_at: new Date().toISOString() })
        .eq('id', itemId);
    } catch (e) {
      console.warn(`[bulkWorker] heartbeat failed for ${itemId}`, e);
    }
  }, HEARTBEAT_INTERVAL_MS) as unknown as number;
}

async function ensureReportRow(
  supabase: any,
  item: ClaimedItem,
  userId: string,
  jobId: string,
): Promise<string> {
  if (item.report_id) {
    // Make sure existing row is tagged with the bulk job for widget grouping
    await supabase
      .from('investment_reports')
      .update({ bulk_job_id: jobId })
      .eq('id', item.report_id)
      .is('bulk_job_id', null);
    return item.report_id;
  }
  const { data, error } = await supabase
    .from('investment_reports')
    .insert({
      property_address: item.property_address,
      report_content: '',
      status: 'processing',
      generated_by: userId,
      report_scope: 'address',
      bulk_job_id: jobId,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to pre-create report row: ${error?.message}`);
  }
  await supabase
    .from('bulk_generation_items')
    .update({ report_id: data.id })
    .eq('id', item.id);
  return data.id;
}

async function callInvestmentReport(
  reportId: string,
  property: { address: string; suburb?: string; state?: string; zipCode?: string },
  signal: AbortSignal,
): Promise<void> {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();

  const response = await fetch(
    `${supabaseUrl}/functions/v1/generate-investment-report`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_EDGE_SECRET || serviceRoleKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        reportId,
        propertyAddress: property.address,
        propertyDetails: {
          suburb: property.suburb,
          state: property.state,
          zipCode: property.zipCode,
          queryType: 'address',
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  const json = await response.json();
  if (!json?.success) {
    throw new Error(json?.error || 'Inner function returned success=false');
  }
}

async function processOneItem(
  supabase: any,
  item: ClaimedItem,
  userId: string,
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const startedAt = Date.now();
  const heartbeat = startHeartbeat(supabase, item.id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('per-property timeout'), REPORT_TIMEOUT_MS);

  let reportId: string | null = null;
  try {
    reportId = await ensureReportRow(supabase, item, userId, jobId);
    await callInvestmentReport(
      reportId,
      { address: item.property_address },
      controller.signal,
    );

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    await supabase
      .from('bulk_generation_items')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processing_time_seconds: elapsed,
        heartbeat_at: null,
        claimed_at: null,
        worker_id: null,
      })
      .eq('id', item.id);

    console.log(`[bulkWorker] ✅ ${item.property_address} in ${elapsed}s (attempt ${item.attempts})`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bulkWorker] ❌ ${item.property_address} (attempt ${item.attempts}): ${msg}`);

    // Retry policy: if under max_attempts, requeue as pending so cron picks it up.
    // Otherwise terminal failure.
    const { data: row } = await supabase
      .from('bulk_generation_items')
      .select('max_attempts')
      .eq('id', item.id)
      .single();
    const maxAttempts = row?.max_attempts ?? 3;
    const willRetry = item.attempts < maxAttempts;

    await supabase
      .from('bulk_generation_items')
      .update({
        status: willRetry ? 'pending' : 'failed',
        error_message: msg,
        last_error_at: new Date().toISOString(),
        completed_at: willRetry ? null : new Date().toISOString(),
        heartbeat_at: null,
        claimed_at: null,
        worker_id: null,
      })
      .eq('id', item.id);

    if (!willRetry && reportId) {
      await supabase
        .from('investment_reports')
        .update({ status: 'failed', error_message: msg })
        .eq('id', reportId);
    }
    return { success: false, error: msg };
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}

async function refreshJobCounts(supabase: any, jobId: string): Promise<{ done: boolean }> {
  const { data: rows } = await supabase
    .from('bulk_generation_items')
    .select('status')
    .eq('job_id', jobId);
  const items = rows || [];
  const completed = items.filter((r: any) => r.status === 'completed').length;
  const failed = items.filter((r: any) => r.status === 'failed').length;
  const remaining = items.length - completed - failed;
  const done = remaining === 0;
  await supabase
    .from('bulk_generation_jobs')
    .update({
      completed_reports: completed,
      failed_reports: failed,
      updated_at: new Date().toISOString(),
      ...(done
        ? {
            status: failed === items.length ? 'failed' : 'completed',
            completed_at: new Date().toISOString(),
            ...(failed === items.length
              ? { error_message: 'All items failed' }
              : {}),
          }
        : {}),
    })
    .eq('id', jobId);
  return { done };
}

/**
 * Drain pending items for a job, processing up to BATCH_SIZE concurrently.
 * Stops when no more items can be claimed or after `maxIterations` to keep
 * within the worker's wall budget.
 */
export async function drainJob(
  supabase: any,
  jobId: string,
  userId: string,
  workerId: string,
  maxIterations = 50,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0, succeeded = 0, failed = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Claim up to BATCH_SIZE items
    const claims: ClaimedItem[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const { data, error } = await supabase.rpc('claim_next_bulk_item', {
        p_job_id: jobId,
        p_worker: workerId,
      });
      if (error) {
        console.error(`[bulkWorker] claim error for job ${jobId}:`, error);
        break;
      }
      const claimed = Array.isArray(data) && data.length ? data[0] : null;
      if (!claimed) break;
      claims.push(claimed as ClaimedItem);
    }

    if (claims.length === 0) break;

    const results = await Promise.allSettled(
      claims.map((c) => processOneItem(supabase, c, userId, jobId)),
    );
    for (const r of results) {
      processed++;
      if (r.status === 'fulfilled' && r.value.success) succeeded++;
      else failed++;
    }

    await refreshJobCounts(supabase, jobId);
  }

  // Final reconciliation
  const { done } = await refreshJobCounts(supabase, jobId);
  console.log(`[bulkWorker] job ${jobId} drain finished — processed=${processed}, done=${done}`);

  return { processed, succeeded, failed };
}
