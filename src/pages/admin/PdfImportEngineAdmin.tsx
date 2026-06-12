/**
 * PdfImportEngineAdmin — superadmin console for the Docling rollout.
 *
 * Phase 6 of the Docling pipeline plan. Lets a superadmin:
 *   1. Read and edit `feature_flags.pdf_import.engine`
 *        - default (legacy | docling)
 *        - superadmin override (legacy | docling)
 *        - allowlist (user ids opted-in early)
 *   2. Run the same PDF through BOTH engines and compare fidelity scores,
 *      duration, page counts, and warning lists side-by-side.
 *
 * Talks to the `feature-flags-admin` edge function via `invokeSecureFunction`
 * (the table's RLS only honours `auth.uid()` — this app uses custom auth).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Save, Upload, Zap, Cpu, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { invokeSecureFunction, describeAuthError } from '@/lib/secureInvoke';
import { extractPdfToTemplateRouted } from '@/lib/reportTemplate/pdfImport/extractPdfToTemplateRouted';
import type { FidelityMode, ImportProgress, ImportResult } from '@/lib/reportTemplate/pdfImport/extractPdfToTemplate';
import { useAuth } from '@/hooks/useAuth';
import { invalidatePdfImportEngineCache } from '@/lib/featureFlags/pdfImportEngine';

const FLAG_KEY = 'pdf_import.engine';

type EngineValue = 'legacy' | 'docling';
interface FlagValue {
  default: EngineValue;
  superadmin: EngineValue;
  allowlist: string[];
}

interface FlagRow {
  key: string;
  value: FlagValue;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface EngineRun {
  engine: EngineValue;
  status: 'idle' | 'running' | 'done' | 'error';
  progress?: ImportProgress | null;
  durationMs?: number;
  result?: ImportResult;
  error?: string;
}

function normalizeValue(raw: any): FlagValue {
  const def: EngineValue = raw?.default === 'docling' ? 'docling' : 'legacy';
  const sa: EngineValue = raw?.superadmin === 'docling' ? 'docling' : 'legacy';
  const allow = Array.isArray(raw?.allowlist) ? raw.allowlist.filter((x: any) => typeof x === 'string') : [];
  return { default: def, superadmin: sa, allowlist: allow };
}

export default function PdfImportEngineAdmin() {
  const { isSuperadmin, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<FlagRow | null>(null);
  const [draft, setDraft] = useState<FlagValue>({ default: 'legacy', superadmin: 'legacy', allowlist: [] });
  const [allowlistText, setAllowlistText] = useState('');
  const [description, setDescription] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await invokeSecureFunction<{ row: FlagRow | null }>(
      'feature-flags-admin',
      { operation: 'get', key: FLAG_KEY },
    );
    if (error) {
      toast.error(describeAuthError(error.message) ?? `Load failed: ${error.message}`);
      setLoading(false);
      return;
    }
    const r = data?.row ?? null;
    if (r) {
      const v = normalizeValue(r.value);
      setRow(r);
      setDraft(v);
      setAllowlistText(v.allowlist.join('\n'));
      setDescription(r.description ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    const allowlist = allowlistText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const value: FlagValue = { ...draft, allowlist };
    const { data, error } = await invokeSecureFunction<{ row: FlagRow }>(
      'feature-flags-admin',
      { operation: 'upsert', key: FLAG_KEY, value, description: description || null },
    );
    setSaving(false);
    if (error) {
      toast.error(describeAuthError(error.message) ?? `Save failed: ${error.message}`);
      return;
    }
    invalidatePdfImportEngineCache();
    if (data?.row) {
      setRow(data.row);
      setDraft(normalizeValue(data.row.value));
    }
    toast.success('Flag saved — new imports will use the updated engine immediately.');
  }, [draft, allowlistText, description]);

  // ─── Side-by-side comparison ──────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<FidelityMode>('semantic');
  const [runs, setRuns] = useState<Record<EngineValue, EngineRun>>({
    legacy: { engine: 'legacy', status: 'idle' },
    docling: { engine: 'docling', status: 'idle' },
  });
  const comparing = runs.legacy.status === 'running' || runs.docling.status === 'running';

  const runEngine = async (engine: EngineValue, source: File) => {
    setRuns((prev) => ({ ...prev, [engine]: { engine, status: 'running', progress: { phase: 'reading' } } }));
    const start = performance.now();
    try {
      const result = await extractPdfToTemplateRouted(source, {
        mode,
        templateName: `[engine-diff:${engine}] ${source.name.replace(/\.pdf$/i, '')}`,
        userId: user?.id ?? null,
        isSuperadmin,
        engine,
        onProgress: (p) => setRuns((prev) => ({ ...prev, [engine]: { ...prev[engine], progress: p } })),
      });
      const durationMs = Math.round(performance.now() - start);
      setRuns((prev) => ({ ...prev, [engine]: { engine, status: 'done', result, durationMs, progress: { phase: 'done' } } }));
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setRuns((prev) => ({ ...prev, [engine]: { engine, status: 'error', error: (err as Error).message, durationMs } }));
    }
  };

  const compare = useCallback(async () => {
    if (!file) return;
    setRuns({
      legacy: { engine: 'legacy', status: 'idle' },
      docling: { engine: 'docling', status: 'idle' },
    });
    // Run sequentially so the Docling sidecar isn't asked to parse the same
    // bytes twice in parallel (and so the UI's two progress bars stay sane).
    await runEngine('legacy', file);
    await runEngine('docling', file);
  }, [file, mode, user?.id, isSuperadmin]);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return toast.error('Only PDF files supported.');
    if (f.size > 50 * 1024 * 1024) return toast.error('Max 50 MB.');
    setFile(f);
  };

  const diff = useMemo(() => {
    const a = runs.legacy.result;
    const b = runs.docling.result;
    if (!a || !b) return null;
    const score = (r: ImportResult) => (r.cdirFidelity ? r.cdirFidelity.overallScore : 0);
    return {
      legacyScore: score(a),
      doclingScore: score(b),
      delta: score(b) - score(a),
      legacyPages: a.pageCount,
      doclingPages: b.pageCount,
      legacyMs: runs.legacy.durationMs ?? 0,
      doclingMs: runs.docling.durationMs ?? 0,
    };
  }, [runs.legacy.result, runs.docling.result, runs.legacy.durationMs, runs.docling.durationMs]);

  if (!isSuperadmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Superadmin role required to manage the PDF import engine flag.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> PDF import engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controls which extractor `template-import-pdf` and the in-app importer use:
            the legacy in-browser pdf.js pipeline, or the new Docling Cloud Run sidecar
            (`pdf-parse-dispatch` → `pdf_import_jobs`).
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flag configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading flag…
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Default engine (all users)</Label>
                  <Select value={draft.default} onValueChange={(v) => setDraft((d) => ({ ...d, default: v as EngineValue }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legacy">Legacy (pdf.js)</SelectItem>
                      <SelectItem value="docling">Docling (cloud)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Applied when no allowlist or per-user override matches.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Superadmin override</Label>
                  <Select value={draft.superadmin} onValueChange={(v) => setDraft((d) => ({ ...d, superadmin: v as EngineValue }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legacy">Legacy (pdf.js)</SelectItem>
                      <SelectItem value="docling">Docling (cloud)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Engine forced for every superadmin (independent of the default).
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-xs">Allowlist (one user id per line) — these users always get Docling</Label>
                <Textarea
                  value={allowlistText}
                  onChange={(e) => setAllowlistText(e.target.value)}
                  rows={4}
                  placeholder="11111111-2222-3333-4444-555555555555"
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Matched against `custom_users.id` via `resolvePdfImportEngine`. Comma- or whitespace-separated also OK.
                </p>
              </div>

              <div>
                <Label className="text-xs">Description (visible in DB; not surfaced to UI)</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-muted-foreground">
                  {row ? <>Last updated {new Date(row.updated_at).toLocaleString()} {row.updated_by ? `· by ${row.updated_by.slice(0, 8)}…` : ''}</> : 'Flag has never been written.'}
                </div>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save flag
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Side-by-side fidelity comparison</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Runs the same PDF through both extractors and compares the editable-fidelity score, page count,
            and end-to-end duration. Two real templates are created and prefixed with `[engine-diff:…]` so
            they can be deleted afterwards.
          </p>

          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={comparing}
              className="border-2 border-dashed rounded-lg p-4 text-left hover:border-primary/50 transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm">
                  {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Select a PDF…</span>}
                  {file && <span className="ml-2 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </button>
            <Select value={mode} onValueChange={(v) => setMode(v as FidelityMode)} disabled={comparing}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semantic">Semantic</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="pixel">Pixel-perfect</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void compare()} disabled={!file || comparing}>
              {comparing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Run both engines
            </Button>
          </div>

          <Separator />

          <div className="grid sm:grid-cols-2 gap-4">
            <EngineRunCard run={runs.legacy} />
            <EngineRunCard run={runs.docling} />
          </div>

          {diff && (
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Δ Docling − Legacy</span>
                  <Badge variant={diff.delta >= 0 ? 'default' : 'destructive'}>
                    {(diff.delta * 100).toFixed(1)} pts editable fidelity
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Pages" a={diff.legacyPages} b={diff.doclingPages} />
                  <Metric label="Fidelity" a={`${Math.round(diff.legacyScore * 100)}%`} b={`${Math.round(diff.doclingScore * 100)}%`} />
                  <Metric label="Duration" a={`${(diff.legacyMs / 1000).toFixed(1)}s`} b={`${(diff.doclingMs / 1000).toFixed(1)}s`} />
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EngineRunCard({ run }: { run: EngineRun }) {
  const Icon = run.engine === 'docling' ? Zap : Cpu;
  const fidelity = run.result?.cdirFidelity;
  const percent = (() => {
    const p = run.progress;
    if (!p) return 0;
    if (p.phase === 'done') return 100;
    if (!p.page || !p.totalPages) return run.status === 'running' ? 8 : 0;
    return Math.round((p.page / p.totalPages) * 95);
  })();

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className={`h-4 w-4 ${run.engine === 'docling' ? 'text-primary' : 'text-muted-foreground'}`} />
          {run.engine === 'docling' ? 'Docling (cloud)' : 'Legacy (pdf.js)'}
        </div>
        {run.status === 'done' && <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Done</Badge>}
        {run.status === 'error' && <Badge variant="destructive" className="text-[10px]"><X className="h-3 w-3 mr-1" />Failed</Badge>}
        {run.status === 'running' && <Badge variant="secondary" className="text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>}
      </div>

      {run.status === 'running' && (
        <div className="space-y-1">
          <Progress value={percent} />
          <div className="text-[11px] text-muted-foreground capitalize">
            {run.progress?.phase}
            {run.progress?.page && run.progress?.totalPages ? ` · ${run.progress.page} / ${run.progress.totalPages}` : ''}
            {run.progress?.message ? ` · ${run.progress.message}` : ''}
          </div>
        </div>
      )}

      {run.status === 'error' && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="break-words">{run.error}</span>
        </div>
      )}

      {run.status === 'done' && run.result && (
        <div className="space-y-1 text-xs">
          <Row label="Pages" value={run.result.pageCount} />
          <Row label="Duration" value={`${((run.durationMs ?? 0) / 1000).toFixed(1)}s`} />
          {fidelity && (
            <>
              <Row label="Editable fidelity" value={`${Math.round(fidelity.overallScore * 100)}%`} highlight />
              <Row label="Native coverage" value={`${Math.round(fidelity.nativeCoverage * 100)}%`} />
              <Row label="Raster fallback" value={`${Math.round(fidelity.rasterFallbackCoverage * 100)}%`} />
              {fidelity.textAccuracy !== null && (
                <Row label="Text accuracy" value={`${Math.round(fidelity.textAccuracy * 100)}%`} />
              )}
              {fidelity.warnings.length > 0 && (
                <div className="text-[11px] text-muted-foreground pt-1">
                  {fidelity.warnings.length} warning{fidelity.warnings.length === 1 ? '' : 's'}: {fidelity.warnings.slice(0, 2).map((w) => w.message).join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between border-b border-border/40 pb-0.5 ${highlight ? 'font-medium' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Metric({ label, a, b }: { label: string; a: number | string; b: number | string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">
        <span className="text-muted-foreground">{a}</span>
        <span className="mx-1">→</span>
        <span className="font-medium">{b}</span>
      </div>
    </div>
  );
}
