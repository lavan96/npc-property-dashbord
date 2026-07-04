/**
 * GoldenRegressionHistoryPanel — Phase 9C.
 *
 * Displays the golden run history ledger (`pdf_import_golden_runs`) for a corpus
 * or import, plus the current run's baseline comparison. Read-only: it only calls
 * `listGoldenRunHistory`. History is written by the orchestrator's save step.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw, History } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  getGoldenCorpusConsoleStatusTone,
  getGoldenRunBaselineOutcomeLabel,
  getGoldenRunBaselineOutcomeTone,
  listGoldenRunHistory,
  type GoldenRunBaselineComparison,
  type GoldenRunHistoryRecord,
} from '@/lib/reportTemplate/ingestion/goldenCorpus';

interface GoldenRegressionHistoryPanelProps {
  corpusId?: string | null;
  importId?: string | null;
  baselineComparison?: GoldenRunBaselineComparison | null;
  /** Bump to force a refetch (e.g. after a new run is saved). */
  refreshKey?: number;
}

const DASH = '—';
const text = (v: string | null | undefined) => (v && String(v).trim() !== '' ? v : DASH);
const pct = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n * 100)}%` : DASH;

export function GoldenRegressionHistoryPanel({
  corpusId,
  importId,
  baselineComparison,
  refreshKey,
}: GoldenRegressionHistoryPanelProps) {
  const [records, setRecords] = useState<GoldenRunHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    if (!corpusId && !importId) {
      setErrorMessage('Provide a corpus or import to load history.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const res = await listGoldenRunHistory({ corpusId, importId, limit: 100 });
    setLoading(false);
    setLoadedOnce(true);
    if (res.kind === 'error') {
      setErrorMessage(res.message);
      toast.error(`History load failed: ${res.message}`);
      return;
    }
    setRecords(res.records);
  }, [corpusId, importId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpusId, importId, refreshKey]);

  return (
    <div className="space-y-4">
      {baselineComparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex flex-wrap items-center gap-2">
              Baseline comparison
              <Badge variant={getGoldenRunBaselineOutcomeTone(baselineComparison.outcome)}>
                {getGoldenRunBaselineOutcomeLabel(baselineComparison.outcome)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2 text-sm">
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              <Row label="Quality gate">
                {text(baselineComparison.gateStatusFrom)} → {text(baselineComparison.gateStatusTo)}{' '}
                <span className="text-muted-foreground">({baselineComparison.gateDirection})</span>
              </Row>
              <Row label="Operator decision">
                {text(baselineComparison.decisionFrom)} → {text(baselineComparison.decisionTo)}{' '}
                <span className="text-muted-foreground">({baselineComparison.decisionDirection})</span>
              </Row>
              <Row label="Warnings Δ">{baselineComparison.warningCountDelta}</Row>
              <Row label="Failures Δ">{baselineComparison.failureCountDelta}</Row>
              <Row label="Baseline run">
                <span className="font-mono text-xs">{text(baselineComparison.baselineRunId)}</span>
              </Row>
              <Row label="Tolerance">{baselineComparison.tolerance}</Row>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {baselineComparison.metrics.map((m) => (
                <div key={m.metric} className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="font-medium">{m.metric}</div>
                  <div className="text-muted-foreground">
                    {pct(m.baseline)} → {pct(m.current)}
                  </div>
                  <Badge variant={m.direction === 'degraded' ? 'destructive' : m.direction === 'improved' ? 'default' : 'outline'}
                    className="mt-1 text-[10px]">
                    {m.direction}
                  </Badge>
                </div>
              ))}
            </div>
            {baselineComparison.reasons.length > 0 && (
              <div className="text-xs text-muted-foreground break-all">
                {baselineComparison.reasons.join(', ')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" /> Run history ({records.length})
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCcw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {errorMessage ? (
            <div className="text-sm text-destructive break-all">{errorMessage}</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {loadedOnce ? 'No history yet for this corpus/import.' : 'Loading…'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Run ID</TableHead>
                    <TableHead>Gate</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="text-right">Visual QA</TableHead>
                    <TableHead className="text-right">Repair</TableHead>
                    <TableHead className="text-right">Export</TableHead>
                    <TableHead className="text-right">W / F</TableHead>
                    <TableHead>Baseline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{text(r.createdAt)}</TableCell>
                      <TableCell className="font-mono text-[11px] max-w-[160px] truncate" title={r.runId}>{text(r.runId)}</TableCell>
                      <TableCell>
                        <Badge variant={getGoldenCorpusConsoleStatusTone(
                          r.qualityGateStatus === 'pass' ? 'completed'
                            : r.qualityGateStatus === 'warning' ? 'completed_with_warnings'
                            : r.qualityGateStatus === 'not_evaluated' ? 'not_evaluated'
                            : 'failed',
                        )} className="text-[10px]">
                          {r.qualityGateStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.operatorDecision}</TableCell>
                      <TableCell className="text-right text-xs">{pct(r.visualQaScore)}</TableCell>
                      <TableCell className="text-right text-xs">{pct(r.repairFinalScore)}</TableCell>
                      <TableCell className="text-right text-xs">{pct(r.exportVsSourceScore)}</TableCell>
                      <TableCell className="text-right text-xs">{r.warningCount} / {r.failureCount}</TableCell>
                      <TableCell>
                        {r.baselineComparison ? (
                          <Badge variant={getGoldenRunBaselineOutcomeTone(r.baselineComparison.outcome)} className="text-[10px]">
                            {getGoldenRunBaselineOutcomeLabel(r.baselineComparison.outcome)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">{DASH}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all font-medium">{children}</span>
    </div>
  );
}

export default GoldenRegressionHistoryPanel;
