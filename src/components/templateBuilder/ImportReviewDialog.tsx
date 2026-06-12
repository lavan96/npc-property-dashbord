/**
 * ImportReviewDialog — human-in-the-loop CDIR review surface.
 *
 * This is the first UI consumer of the persisted/in-memory `ImportReviewDraft`:
 * designers can inspect editable/native coverage, raster fallback reliance,
 * warnings, page/layer counts, and the decision recommendation before opening
 * the generated template for manual refinement.
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, Layers3, Loader2, MousePointerClick, RotateCw, Wand2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { ImportReviewDecision, ImportReviewDraft } from '@/lib/reportTemplate/ingestion/review';
import type { ImportReviewDecisionRecord } from '@/lib/reportTemplate/ingestion/importArtifacts';
import type { CdirLayer } from '@/lib/reportTemplate/ingestion/cdir';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ImportReviewDraft | null;
  onOpenTemplate?: () => void;
  onRetry?: () => void;
  onRecordDecision?: (decision: ImportReviewDecision, note?: string) => Promise<void> | void;
  recordedDecision?: ImportReviewDecisionRecord | null;
  onRunReconciliation?: () => Promise<void> | void;
  reconciliationAvailable?: boolean;
  reconciliationBusy?: boolean;
}

function flattenLayers(layers: CdirLayer[]): CdirLayer[] {
  return layers.flatMap((layer) => (layer.kind === 'group' ? flattenLayers(layer.children) : [layer]));
}

function decisionCopy(decision: ImportReviewDecision): { label: string; description: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (decision) {
    case 'accept':
      return { label: 'Accept', description: 'Quality is high enough to continue editing normally.', variant: 'default' };
    case 'accept_with_trace':
      return { label: 'Accept with trace', description: 'Keep trace/fallback layers visible for manual cleanup.', variant: 'secondary' };
    case 'retry':
      return { label: 'Retry import', description: 'The import has blocking errors and should be regenerated.', variant: 'destructive' };
    case 'manual_edit':
    default:
      return { label: 'Manual review', description: 'Open the template and fix flagged regions manually.', variant: 'outline' };
  }
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

export function ImportReviewDialog({ open, onOpenChange, draft, onOpenTemplate, onRetry, onRecordDecision, recordedDecision, onRunReconciliation, reconciliationAvailable, reconciliationBusy }: Props) {
  const [savingDecision, setSavingDecision] = useState<ImportReviewDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const decision = draft ? decisionCopy(draft.recommendedDecision) : null;
  const totalLayers = draft?.cdir.pages.reduce((sum, page) => sum + flattenLayers(page.layers).length, 0) ?? 0;
  const fallbackLayers = draft?.cdir.pages.reduce((sum, page) => sum + flattenLayers(page.layers).filter((layer) => layer.kind === 'image' && layer.fallbackRaster).length, 0) ?? 0;
  const sourceRasterArtifacts = draft?.artifacts.filter((artifact) => artifact.kind === 'source-raster') ?? [];

  const recordDecision = async (value: ImportReviewDecision) => {
    if (!onRecordDecision) return;
    setSavingDecision(value);
    try {
      await onRecordDecision(value, decisionNote.trim() || undefined);
    } finally {
      setSavingDecision(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" /> Import review
          </DialogTitle>
          <DialogDescription>
            Review the editable reconstruction quality before relying on the generated template.
          </DialogDescription>
        </DialogHeader>

        {!draft || !decision ? (
          <Card className="p-4 text-sm text-muted-foreground">No import review data is available for this result.</Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Overall" value={pct(draft.fidelity.overallScore)} />
              <Metric label="Native editable" value={pct(draft.fidelity.nativeCoverage)} />
              <Metric label="Raster fallback" value={pct(draft.fidelity.rasterFallbackCoverage)} tone={draft.fidelity.rasterFallbackCoverage > 0.1 ? 'warning' : 'normal'} />
              <Metric label="Text accuracy" value={pct(draft.fidelity.textAccuracy)} />
            </div>

            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <MousePointerClick className="h-4 w-4 text-primary" /> Recommended decision
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{decision.description}</p>
                </div>
                <Badge variant={decision.variant}>{decision.label}</Badge>
              </div>
            </Card>

            {sourceRasterArtifacts.length > 0 && (
              <Card className="p-4 border-primary/20 bg-primary/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Rendered PDF reference pages available</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {sourceRasterArtifacts.length} locked source raster{sourceRasterArtifacts.length === 1 ? '' : 's'} are attached for review, visual diffing, and reconciliation repair.
                    </p>
                  </div>
                  <Badge variant="outline">ImportAsset</Badge>
                </div>
              </Card>
            )}

            {recordedDecision && (
              <Card className="p-4 border-success/30 bg-success/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">Saved review decision: {decisionCopy(recordedDecision.decision).label}</div>
                    {recordedDecision.note && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{recordedDecision.note}</p>}
                    {recordedDecision.decided_at && <p className="mt-1 text-[11px] text-muted-foreground">Recorded {new Date(recordedDecision.decided_at).toLocaleString()}</p>}
                  </div>
                  <Badge variant="success">Recorded</Badge>
                </div>
              </Card>
            )}

            <div className="grid gap-3 md:grid-cols-[1fr_1.3fr]">
              <Card className="p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Layers3 className="h-4 w-4 text-primary" /> Structure
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Source" value={`${draft.sourceKind}${draft.sourceFilename ? ` · ${draft.sourceFilename}` : ''}`} />
                  <Row label="Pages" value={String(draft.cdir.pages.length)} />
                  <Row label="Native layers" value={String(draft.fidelity.editableLayerCount)} />
                  <Row label="All CDIR layers" value={String(totalLayers)} />
                  <Row label="Fallback rasters" value={String(fallbackLayers)} />
                  <Row label="Median drift" value={draft.fidelity.medianPositionDrift === null ? '—' : `${draft.fidelity.medianPositionDrift}pt`} />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 font-medium">
                  {draft.fidelity.warnings.length ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  Warnings
                </div>
                <ScrollArea className="mt-3 h-40 pr-3">
                  {draft.fidelity.warnings.length ? (
                    <div className="space-y-2">
                      {draft.fidelity.warnings.map((warning, index) => (
                        <div key={`${warning.code}-${index}`} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{warning.code.replace(/_/g, ' ')}</span>
                            <Badge variant={warning.severity === 'error' ? 'destructive' : 'secondary'}>{warning.severity}</Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{warning.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No fidelity warnings were produced for this import.</p>
                  )}
                </ScrollArea>
              </Card>
            </div>

            <Card className="p-4">
              <div className="text-sm font-medium">Pages</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {draft.fidelity.pages.map((page) => (
                  <div key={page.pageId} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">{page.pageLabel}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Native {pct(page.nativeCoverage)}</span>
                      <span>Raster {pct(page.rasterFallbackCoverage)}</span>
                      <span>Text layers {page.editableTextLayers}</span>
                      <span>Warnings {page.warnings.length}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {onRecordDecision && draft && (
          <div className="rounded-md border bg-muted/20 p-3">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="import-review-note">
              Optional review note
            </label>
            <Textarea
              id="import-review-note"
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder="Add cleanup instructions, why you accepted with trace, or why this should be retried…"
              className="mt-2 min-h-[72px] text-sm"
              maxLength={1000}
            />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{decisionNote.length}/1000</div>
          </div>
        )}

        <DialogFooter>
          {onRecordDecision && draft && (
            <div className="flex flex-wrap gap-2 mr-auto">
              {(['accept', 'accept_with_trace', 'manual_edit', 'retry'] as ImportReviewDecision[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={value === draft.recommendedDecision ? 'default' : 'outline'}
                  onClick={() => recordDecision(value)}
                  disabled={savingDecision !== null}
                >
                  {savingDecision === value && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  {decisionCopy(value).label}
                </Button>
              ))}
            </div>
          )}
          {draft?.recommendedDecision === 'retry' && onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCw className="h-4 w-4 mr-1" /> Retry import
            </Button>
          )}
          {onRunReconciliation && (
            <Button variant="secondary" onClick={onRunReconciliation} disabled={!reconciliationAvailable || !!reconciliationBusy}>
              {reconciliationBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
              AI reconcile references
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {onOpenTemplate && <Button onClick={onOpenTemplate}>Open template</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <Card className={`p-3 ${tone === 'warning' ? 'border-warning/40 bg-warning/5' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
