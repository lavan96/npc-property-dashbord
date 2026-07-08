/**
 * GoldenRegressionRunConsole — Phase 9B.
 *
 * Operator console that drives the Phase 9A orchestrator (`orchestrateGoldenCorpusRun`)
 * in evaluate_only and evaluate_and_persist modes. It never uploads PDFs or imports files;
 * it evaluates an existing import ID. Evaluate Only is read-only; Evaluate + Persist writes
 * `golden_regression_summary` to `template_imports.meta` (behind an explicit confirmation).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Play, Save, RotateCcw, Copy, ShieldCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DEFAULT_GOLDEN_CORPUS_REGISTRY,
  GOLDEN_CORPUS_CONSOLE_OPERATOR_DECISIONS,
  buildGoldenCorpusOrchestratorRequestFromForm,
  createDefaultGoldenCorpusConsoleFormState,
  getGoldenCorpusConsoleResultHeadline,
  getGoldenCorpusConsoleStatusTone,
  getGoldenCorpusItem,
  orchestrateGoldenCorpusRun,
  validateGoldenCorpusConsoleForm,
  type GoldenCorpusConsoleFormState,
  type GoldenCorpusConsoleMode,
  type GoldenCorpusOrchestratorResult,
} from '@/lib/reportTemplate/ingestion/goldenCorpus';
import { GoldenRegressionSnapshotPanel } from './GoldenRegressionSnapshotPanel';
import { GoldenRegressionResultPanel } from './GoldenRegressionResultPanel';
import { GoldenRegressionQualityGatePanel } from './GoldenRegressionQualityGatePanel';
import { GoldenRegressionTriagePanel } from './GoldenRegressionTriagePanel';
import { GoldenRegressionHistoryPanel } from './GoldenRegressionHistoryPanel';
import { AutomatedExportParityPanel } from './AutomatedExportParityPanel';

interface GoldenRegressionRunConsoleProps {
  initialCorpusId?: string | null;
  initialImportId?: string | null;
  initialTemplateId?: string | null;
}

export function GoldenRegressionRunConsole({
  initialCorpusId,
  initialImportId,
  initialTemplateId,
}: GoldenRegressionRunConsoleProps) {
  const initialForm = useMemo(
    () =>
      createDefaultGoldenCorpusConsoleFormState({
        corpusId: initialCorpusId && getGoldenCorpusItem(initialCorpusId) ? initialCorpusId : 'golden-simple-001',
        importId: initialImportId ?? '',
        templateId: initialTemplateId ?? '',
      }),
    [initialCorpusId, initialImportId, initialTemplateId],
  );

  const [form, setForm] = useState<GoldenCorpusConsoleFormState>(initialForm);
  const [result, setResult] = useState<GoldenCorpusOrchestratorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmPersistOpen, setConfirmPersistOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const setField = (field: keyof GoldenCorpusConsoleFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));
  const setBool = (field: keyof GoldenCorpusConsoleFormState, value: boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const evalValidation = useMemo(() => validateGoldenCorpusConsoleForm(form, 'evaluate_only'), [form]);
  const persistValidation = useMemo(() => validateGoldenCorpusConsoleForm(form, 'evaluate_and_persist'), [form]);
  const corpusItem = useMemo(() => getGoldenCorpusItem(form.corpusId), [form.corpusId]);

  const errors = persistValidation.issues.filter((i) => i.severity === 'error');
  const persistWarnings = persistValidation.issues.filter((i) => i.severity === 'warning');

  const run = async (mode: GoldenCorpusConsoleMode) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const request = buildGoldenCorpusOrchestratorRequestFromForm(form, mode);
      const orchestratorResult = await orchestrateGoldenCorpusRun({ request });
      setResult(orchestratorResult);
      if (orchestratorResult.historySaved) setHistoryRefreshKey((k) => k + 1);
      if (mode === 'evaluate_and_persist') {
        if (orchestratorResult.persisted) toast.success('Golden regression summary persisted.');
        else toast.error(`Persistence did not complete (${orchestratorResult.status}).`);
        if (orchestratorResult.historySaved) toast.success('Run saved to history ledger.');
        else if (orchestratorResult.historyPersistenceResult?.kind === 'error') {
          toast.error(`History save failed: ${orchestratorResult.historyPersistenceResult.message}`);
        }
      } else {
        toast.success(`Evaluated: ${orchestratorResult.status}.`);
      }
      if (orchestratorResult.baselineComparison?.outcome === 'degraded') {
        toast.warning('Baseline regression detected vs previous run.');
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Unexpected orchestrator error.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onEvaluateOnly = () => {
    if (!evalValidation.ok) return;
    void run('evaluate_only');
  };

  const onEvaluateAndPersist = () => {
    if (!persistValidation.ok) return;
    setConfirmPersistOpen(true);
  };

  const onConfirmPersist = async () => {
    setConfirmPersistOpen(false);
    await run('evaluate_and_persist');
  };

  const onReset = () => {
    setForm(initialForm);
    setResult(null);
    setErrorMessage(null);
  };

  const onCopyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard?.writeText(JSON.stringify(result, null, 2));
      toast.success('Result JSON copied.');
    } catch {
      toast.error('Clipboard not available.');
    }
  };

  const snapshot = result?.runEvaluation?.snapshot ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Golden Regression Run Console
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Evaluate and optionally persist a golden corpus regression result for an existing PDF import.
          </p>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Read-only unless you persist</AlertTitle>
            <AlertDescription className="text-xs">
              This console does not upload PDFs or import files. It only evaluates an existing import ID.
              <strong> Evaluate Only</strong> is read-only. <strong>Evaluate + Persist</strong> writes
              <code className="mx-1">golden_regression_summary</code> to <code>template_imports.meta</code>.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Run inputs</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="corpusId">Corpus item</Label>
              <Select value={form.corpusId} onValueChange={(v) => setField('corpusId', v)}>
                <SelectTrigger id="corpusId"><SelectValue placeholder="Select a corpus item" /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_GOLDEN_CORPUS_REGISTRY.corpus.map((c) => (
                    <SelectItem key={c.corpusId} value={c.corpusId}>{c.corpusId} — {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="operatorDecision">Operator decision</Label>
              <Select value={form.operatorDecision} onValueChange={(v) => setField('operatorDecision', v)}>
                <SelectTrigger id="operatorDecision"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOLDEN_CORPUS_CONSOLE_OPERATOR_DECISIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="importId">Import ID</Label>
              <Input id="importId" value={form.importId} onChange={(e) => setField('importId', e.target.value)}
                placeholder="template_imports.id" className="font-mono text-xs" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="templateId">Template ID (optional)</Label>
              <Input id="templateId" value={form.templateId} onChange={(e) => setField('templateId', e.target.value)}
                placeholder="report_templates.id" className="font-mono text-xs" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="runId">Run ID (optional)</Label>
              <Input id="runId" value={form.runId} onChange={(e) => setField('runId', e.target.value)}
                placeholder="auto-generated if blank" className="font-mono text-xs" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="runBatchId">Run batch ID (optional)</Label>
              <Input id="runBatchId" value={form.runBatchId} onChange={(e) => setField('runBatchId', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={form.notesText} onChange={(e) => setField('notesText', e.target.value)}
              placeholder="One note per line." rows={3} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="compareBaseline" className="text-sm">Compare with latest baseline</Label>
                <p className="text-xs text-muted-foreground">Read-only: compares against the previous run for this corpus.</p>
              </div>
              <Switch id="compareBaseline" checked={form.compareBaseline}
                onCheckedChange={(v) => setBool('compareBaseline', v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="saveHistory" className="text-sm">Save history when persisting</Label>
                <p className="text-xs text-muted-foreground">Appends a row to <code>pdf_import_golden_runs</code> on Evaluate + Persist.</p>
              </div>
              <Switch id="saveHistory" checked={form.saveHistory}
                onCheckedChange={(v) => setBool('saveHistory', v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="runExportParity" className="text-sm">Run export parity automation before evaluation</Label>
                <p className="text-xs text-muted-foreground">Reuses Visual QA evidence to build an export parity summary before quality gates.</p>
              </div>
              <Switch id="runExportParity" checked={form.runExportParity}
                onCheckedChange={(v) => setBool('runExportParity', v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="persistExportParity" className="text-sm">Persist export parity result</Label>
                <p className="text-xs text-muted-foreground">Writes <code>export_parity_summary</code> to <code>template_imports.meta</code> when the runner can build one.</p>
              </div>
              <Switch id="persistExportParity" checked={form.persistExportParity} disabled={!form.runExportParity}
                onCheckedChange={(v) => setBool('persistExportParity', v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="buildImportIntelligenceProfile" className="text-sm">Build import intelligence profile</Label>
                <p className="text-xs text-muted-foreground">Deterministically classifies document type, complexity, and risk. Read-only unless persistence is enabled.</p>
              </div>
              <Switch id="buildImportIntelligenceProfile" checked={form.buildImportIntelligenceProfile}
                onCheckedChange={(v) => setBool('buildImportIntelligenceProfile', v)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="persistImportIntelligenceProfile" className="text-sm">Persist import intelligence profile</Label>
                <p className="text-xs text-muted-foreground">Stores a safe structured profile in <code>template_imports.meta.import_intelligence_profile</code> (only when persisting the run). Does not store raw PDF contents.</p>
              </div>
              <Switch id="persistImportIntelligenceProfile" checked={form.persistImportIntelligenceProfile} disabled={!form.buildImportIntelligenceProfile}
                onCheckedChange={(v) => setBool('persistImportIntelligenceProfile', v)} />
            </div>
          </div>

          {corpusItem && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-medium">{corpusItem.title} · {corpusItem.category}</div>
              <div className="text-muted-foreground">{corpusItem.purpose}</div>
              <div className="mt-1 text-muted-foreground">
                Thresholds — Visual QA ≥ {corpusItem.scoreThresholds.visualQaMinimum} ·
                Repair ≥ {corpusItem.scoreThresholds.repairFinalMinimum} ·
                Export parity ≥ {corpusItem.scoreThresholds.exportParityMinimum} ·
                manual review {corpusItem.expectedOutcomes.manualReviewAllowed ? 'allowed' : 'not allowed'} ·
                fallback {corpusItem.expectedOutcomes.fallbackAllowed ? 'allowed' : 'not allowed'}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Fix before running</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 text-xs">{errors.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
              </AlertDescription>
            </Alert>
          )}
          {persistWarnings.length > 0 && (
            <Alert>
              <AlertTitle>Warnings (persist)</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 text-xs">{persistWarnings.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
              </AlertDescription>
            </Alert>
          )}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTitle>Orchestrator error</AlertTitle>
              <AlertDescription className="text-xs break-all">{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={onEvaluateOnly} disabled={loading || !evalValidation.ok}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Evaluate Only
            </Button>
            <Button variant="secondary" onClick={onEvaluateAndPersist} disabled={loading || !persistValidation.ok}>
              <Save className="h-4 w-4 mr-2" /> Evaluate + Persist
            </Button>
            <Button variant="outline" onClick={onReset} disabled={loading}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset
            </Button>
            <Button variant="outline" onClick={onCopyJson} disabled={!result}>
              <Copy className="h-4 w-4 mr-2" /> Copy Result JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={getGoldenCorpusConsoleStatusTone(result.status)}>{result.status}</Badge>
              {getGoldenCorpusConsoleResultHeadline(result)}
              {result.importId && (
                <Link
                  to={`/admin/template-import-quality`}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  Template Import Quality <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="result">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="result">Result</TabsTrigger>
                <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
                <TabsTrigger value="gates">Quality Gates</TabsTrigger>
                <TabsTrigger value="triage">Triage</TabsTrigger>
                <TabsTrigger value="exportParity">Export Parity</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="result" className="mt-4"><GoldenRegressionResultPanel result={result} /></TabsContent>
              <TabsContent value="snapshot" className="mt-4"><GoldenRegressionSnapshotPanel snapshot={snapshot} /></TabsContent>
              <TabsContent value="gates" className="mt-4"><GoldenRegressionQualityGatePanel report={result.qualityGateReport} /></TabsContent>
              <TabsContent value="triage" className="mt-4"><GoldenRegressionTriagePanel triage={result.triageSummary} /></TabsContent>
              <TabsContent value="exportParity" className="mt-4"><AutomatedExportParityPanel result={result.exportParityRunnerResult} /></TabsContent>
              <TabsContent value="history" className="mt-4">
                <GoldenRegressionHistoryPanel
                  corpusId={result.corpusId}
                  importId={result.importId}
                  refreshKey={historyRefreshKey}
                />
              </TabsContent>
              <TabsContent value="json" className="mt-4">
                <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/30 p-3 text-[11px]">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmPersistOpen} onOpenChange={setConfirmPersistOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Persist golden regression summary?</DialogTitle>
            <DialogDescription>
              {form.runExportParity && (
                <span className="block mb-2">
                  Export parity automation will run <strong>before</strong> golden evaluation
                  {form.persistExportParity
                    ? <> and will update <code className="mx-1">export_parity_summary</code> before saving the golden regression result.</>
                    : <> (persistence off — the export parity summary will not be written).</>}
                </span>
              )}
              This will save the latest golden regression summary to
              <code className="mx-1">template_imports.meta.golden_regression_summary</code>
              and{form.saveHistory ? ' also append a history row to ' : ' (history saving is off, so it will NOT write to) '}
              <code className="mx-1">pdf_import_golden_runs</code>
              for the selected import. Failing or blocked results may be persisted as evidence.
              {form.buildImportIntelligenceProfile && form.persistImportIntelligenceProfile && (
                <span className="block mt-2">
                  This will also save the <code className="mx-1">import_intelligence_profile</code> metadata for this import.
                  It does not store raw PDF text or PDF files.
                </span>
              )}
              {' '}Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPersistOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={onConfirmPersist} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Evaluate + Persist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GoldenRegressionRunConsole;
