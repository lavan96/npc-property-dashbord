import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getGoldenRunHistory,
  getLatestGoldenRunBaselines,
  listGoldenRunHistory,
  saveGoldenRunHistory,
  type GoldenRunHistoryInput,
} from '../ingestion/goldenCorpus';
import { invokeSecureFunction } from '@/lib/secureInvoke';

vi.mock('@/lib/secureInvoke', () => ({
  invokeSecureFunction: vi.fn(),
}));

function input(overrides: Partial<GoldenRunHistoryInput> = {}): GoldenRunHistoryInput {
  return {
    runId: 'run-1',
    runBatchId: null,
    corpusId: 'golden-simple-001',
    category: 'simple_one_page',
    importId: 'import-1',
    templateId: 'template-1',
    sourceFilename: 'golden-simple-001.pdf',
    engineVersion: 'docling-1.0',
    orchestratorVersion: 'orch-v1',
    summaryVersion: 'summary-v1',
    importStatus: 'completed',
    runStatus: 'validated',
    runDecision: 'pass',
    qualityGateStatus: 'pass',
    operatorDecision: 'accepted',
    importPageCount: 1,
    templatePageCount: 1,
    visualQaScore: 0.95,
    repairFinalScore: 0.96,
    exportVsSourceScore: 0.94,
    editorVsSourceScore: 0.93,
    exportVsEditorScore: 0.97,
    visualQaManualReviewRequired: false,
    repairRequiresFallback: false,
    repairRequiresManualReview: false,
    aiReconciliationStatus: null,
    aiReconciliationRecommendation: 'not_needed',
    exportParityStatus: 'completed',
    exportParityMode: 'manual',
    warningCount: 0,
    failureCount: 0,
    warnings: [],
    failures: [],
    gateSummary: {},
    triageSummary: {},
    goldenRegressionSummary: {},
    baselineComparison: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(invokeSecureFunction).mockReset();
});

describe('saveGoldenRunHistory', () => {
  it('errors without a network call when importId is blank', async () => {
    const res = await saveGoldenRunHistory('', input());
    expect(res.kind).toBe('error');
    expect(invokeSecureFunction).not.toHaveBeenCalled();
  });

  it('saves through the save_golden_run_history operation and normalizes the record', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({
      data: { ok: true, history_id: 'hist-1', history: { id: 'hist-1', runId: 'run-1', visualQaScore: '0.95' } },
      error: null,
    } as any);

    const res = await saveGoldenRunHistory('import-1', input());
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect(res.historyId).toBe('hist-1');
      expect(res.record.visualQaScore).toBe(0.95);
    }
    expect(invokeSecureFunction).toHaveBeenCalledWith(
      'template-import-pdf',
      expect.objectContaining({
        body: expect.objectContaining({ operation: 'save_golden_run_history', import_id: 'import-1' }),
      }),
    );
  });

  it('maps a backend rejection to kind error', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { error: 'forbidden' }, error: null } as any);
    const res = await saveGoldenRunHistory('import-1', input());
    expect(res.kind).toBe('error');
  });

  it('errors when ok is true but no history_id returned', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { ok: true }, error: null } as any);
    const res = await saveGoldenRunHistory('import-1', input());
    expect(res.kind).toBe('error');
  });
});

describe('listGoldenRunHistory', () => {
  it('lists and normalizes records with a clamped limit', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({
      data: { ok: true, history: [{ id: 'h1', runId: 'r1' }, { id: 'h2', runId: 'r2' }] },
      error: null,
    } as any);

    const res = await listGoldenRunHistory({ corpusId: 'golden-simple-001', limit: 9999 });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.records.map((r) => r.id)).toEqual(['h1', 'h2']);
    expect(invokeSecureFunction).toHaveBeenCalledWith(
      'template-import-pdf',
      expect.objectContaining({
        body: expect.objectContaining({ operation: 'list_golden_run_history', corpus_id: 'golden-simple-001', limit: 200 }),
      }),
    );
  });

  it('returns an empty list when history is missing from the payload', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { ok: true }, error: null } as any);
    const res = await listGoldenRunHistory({ importId: 'import-1' });
    expect(res).toEqual({ kind: 'ok', records: [] });
  });

  it('maps a transport error to kind error', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: null, error: { message: 'network' } } as any);
    const res = await listGoldenRunHistory({});
    expect(res.kind).toBe('error');
  });
});

describe('getGoldenRunHistory', () => {
  it('returns the record when found', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({
      data: { ok: true, history: { id: 'hist-1', runId: 'run-1' } },
      error: null,
    } as any);
    const res = await getGoldenRunHistory('hist-1');
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.record.id).toBe('hist-1');
  });

  it('maps a not-found error to missing', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { error: 'not found' }, error: null } as any);
    const res = await getGoldenRunHistory('nope');
    expect(res.kind).toBe('missing');
  });

  it('treats an absent history payload as missing', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { ok: true }, error: null } as any);
    const res = await getGoldenRunHistory('hist-1');
    expect(res.kind).toBe('missing');
  });
});

describe('getLatestGoldenRunBaselines', () => {
  it('returns normalized baselines', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({
      data: { ok: true, baselines: [{ id: 'b1', corpusId: 'golden-simple-001', visualQaScore: '0.9' }] },
      error: null,
    } as any);
    const res = await getLatestGoldenRunBaselines({ corpusId: 'golden-simple-001' });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect(res.baselines[0].id).toBe('b1');
      expect(res.baselines[0].visualQaScore).toBe(0.9);
    }
    expect(invokeSecureFunction).toHaveBeenCalledWith(
      'template-import-pdf',
      expect.objectContaining({
        body: expect.objectContaining({ operation: 'get_latest_golden_run_baselines', corpus_id: 'golden-simple-001' }),
      }),
    );
  });

  it('maps a backend rejection to kind error', async () => {
    vi.mocked(invokeSecureFunction).mockResolvedValueOnce({ data: { error: 'boom' }, error: null } as any);
    const res = await getLatestGoldenRunBaselines({});
    expect(res.kind).toBe('error');
  });
});
