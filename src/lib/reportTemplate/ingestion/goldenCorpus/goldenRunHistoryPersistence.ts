/**
 * goldenRunHistoryPersistence — Phase 9C.
 *
 * Client-side invokers for the four secure `template-import-pdf` history
 * operations backed by `public.pdf_import_golden_runs`:
 *   - save_golden_run_history        → saveGoldenRunHistory
 *   - list_golden_run_history        → listGoldenRunHistory
 *   - get_golden_run_history         → getGoldenRunHistory
 *   - get_latest_golden_run_baselines→ getLatestGoldenRunBaselines
 * All ownership/authorization is enforced server-side by the edge function.
 */
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { normalizeGoldenRunHistoryRecord } from './goldenRunHistorySummary';
import type {
  GetGoldenRunHistoryResult,
  GetLatestGoldenRunBaselinesOptions,
  GetLatestGoldenRunBaselinesResult,
  GoldenRunHistoryInput,
  ListGoldenRunHistoryOptions,
  ListGoldenRunHistoryResult,
  SaveGoldenRunHistoryResult,
} from './goldenRunHistoryTypes';

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

function errorMessage(error: unknown): string {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  const maybe = error as { message?: unknown };
  return String(maybe?.message ?? error);
}

function looksMissing(message: string): boolean {
  return /not found|not_found|missing|no rows/i.test(message);
}

export async function saveGoldenRunHistory(
  importId: string,
  history: GoldenRunHistoryInput,
): Promise<SaveGoldenRunHistoryResult> {
  if (!importId) return { kind: 'error', message: 'importId is required' };
  if (!history) return { kind: 'error', message: 'history is required' };

  try {
    const { data, error } = await invokeSecureFunction<{
      ok?: boolean;
      history_id?: string;
      history?: unknown;
      error?: string;
    }>('template-import-pdf', {
      body: {
        operation: 'save_golden_run_history',
        import_id: importId,
        history,
      },
    } as any);

    if (error) return { kind: 'error', message: errorMessage(error) };
    if (!data || data.error || data.ok !== true || !data.history_id) {
      return { kind: 'error', message: String(data?.error ?? 'save_golden_run_history did not return ok') };
    }
    return {
      kind: 'ok',
      historyId: data.history_id,
      record: normalizeGoldenRunHistoryRecord(data.history),
    };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

export async function listGoldenRunHistory(
  options: ListGoldenRunHistoryOptions = {},
): Promise<ListGoldenRunHistoryResult> {
  const limit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, Number(options.limit) || DEFAULT_HISTORY_LIMIT));

  try {
    const { data, error } = await invokeSecureFunction<{
      ok?: boolean;
      history?: unknown[];
      error?: string;
    }>('template-import-pdf', {
      body: {
        operation: 'list_golden_run_history',
        corpus_id: options.corpusId ?? null,
        import_id: options.importId ?? null,
        limit,
      },
    } as any);

    if (error) return { kind: 'error', message: errorMessage(error) };
    if (!data || data.error || data.ok !== true) {
      return { kind: 'error', message: String(data?.error ?? 'list_golden_run_history did not return ok') };
    }
    const records = Array.isArray(data.history) ? data.history.map(normalizeGoldenRunHistoryRecord) : [];
    return { kind: 'ok', records };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

export async function getGoldenRunHistory(
  historyId: string,
): Promise<GetGoldenRunHistoryResult> {
  if (!historyId) return { kind: 'error', message: 'historyId is required' };

  try {
    const { data, error } = await invokeSecureFunction<{
      ok?: boolean;
      history?: unknown;
      error?: string;
    }>('template-import-pdf', {
      body: {
        operation: 'get_golden_run_history',
        history_id: historyId,
      },
    } as any);

    if (error) {
      const message = errorMessage(error);
      if (looksMissing(message)) return { kind: 'missing' };
      return { kind: 'error', message };
    }
    if (!data || data.error) {
      const message = String(data?.error ?? 'unknown error');
      if (looksMissing(message)) return { kind: 'missing' };
      return { kind: 'error', message };
    }
    if (!data.history) return { kind: 'missing' };
    return { kind: 'ok', record: normalizeGoldenRunHistoryRecord(data.history) };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

export async function getLatestGoldenRunBaselines(
  options: GetLatestGoldenRunBaselinesOptions = {},
): Promise<GetLatestGoldenRunBaselinesResult> {
  try {
    const { data, error } = await invokeSecureFunction<{
      ok?: boolean;
      baselines?: unknown[];
      error?: string;
    }>('template-import-pdf', {
      body: {
        operation: 'get_latest_golden_run_baselines',
        corpus_id: options.corpusId ?? null,
      },
    } as any);

    if (error) return { kind: 'error', message: errorMessage(error) };
    if (!data || data.error || data.ok !== true) {
      return { kind: 'error', message: String(data?.error ?? 'get_latest_golden_run_baselines did not return ok') };
    }
    const baselines = Array.isArray(data.baselines) ? data.baselines.map(normalizeGoldenRunHistoryRecord) : [];
    return { kind: 'ok', baselines };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}
