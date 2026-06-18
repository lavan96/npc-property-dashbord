/**
 * AI Estimate Review Panel
 * ---------------------------------------------------------------------------
 * AI estimates NEVER auto-overwrite calculator fields. They land here first.
 *
 * Per-field actions: Accept, Edit-before-apply, Reject, Mark Verified (with
 * confirm). Bulk actions: Accept all, Reject all.
 *
 * On accept:
 *   - Writes to Master Property Assumption Store as `AI Estimate`
 *   - Cascades into dependent tabs (master store handles tabDependencies)
 *   - Marks affected tabs as updated in the Report Freshness store
 *   - Marks final reports as out of date (if one was generated)
 *
 * On edit-after-accept:
 *   - Source flips to `User Override`
 *   - Original AI estimate value is preserved on the record
 *
 * Mark Verified requires explicit user confirmation that external evidence
 * has been sighted.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useMasterAssumptionStore,
  type AssumptionConfidence,
  type AssumptionValue,
  type CalculatorTabKey,
} from '@/utils/commercial/masterPropertyAssumptionStore';
import { useReportFreshnessStore } from '@/utils/commercial/reportFreshnessStore';

export interface PendingAiEstimate {
  key: string;
  label: string;
  unit?: string | null;
  currentValue?: AssumptionValue;
  suggestedValue: AssumptionValue;
  suggestedRange?: { low: number | null; high: number | null } | null;
  confidence: AssumptionConfidence;
  sourceBasis?: string[];
  missingInformation?: string[];
  riskNotes?: string[];
  affectedTabs: CalculatorTabKey[];
  specialistReview?: boolean;
  source?: 'AI Estimate' | 'Research Engine';
}

interface AiEstimateReviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimates: PendingAiEstimate[];
  /** Fired after Accept (single or bulk) so callers can refresh UI. */
  onApplied?: (acceptedKeys: string[]) => void;
}

type RowState = {
  selected: boolean;
  editing: boolean;
  editValue: string;
  status: 'pending' | 'accepted' | 'rejected';
};

function fmt(value: AssumptionValue | undefined, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (unit === 'percent') return `${value}%`;
    if (unit === 'aud') return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
    if (unit === 'aud_per_sqm') return `$${value.toLocaleString('en-AU')}/m²`;
    if (unit === 'sqm') return `${value.toLocaleString('en-AU')} m²`;
    if (unit === 'months') return `${value} mo`;
    return value.toLocaleString('en-AU');
  }
  return String(value);
}

function fmtRange(range?: { low: number | null; high: number | null } | null, unit?: string | null): string {
  if (!range || (range.low == null && range.high == null)) return '—';
  return `${fmt(range.low ?? null, unit)} – ${fmt(range.high ?? null, unit)}`;
}

function parseEdited(raw: string, original: AssumptionValue): AssumptionValue {
  if (typeof original === 'number') {
    const n = Number(raw.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : original;
  }
  if (typeof original === 'boolean') return raw === 'true';
  return raw;
}

const confidenceBadge: Record<AssumptionConfidence, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

export function AiEstimateReviewPanel({ open, onOpenChange, estimates, onApplied }: AiEstimateReviewPanelProps) {
  const acceptAiEstimate = useMasterAssumptionStore(s => s.acceptAiEstimate);
  const applyUserOverride = useMasterAssumptionStore(s => s.applyUserOverride);
  const markVerified = useMasterAssumptionStore(s => s.markVerified);
  const markTabsUpdated = useReportFreshnessStore(s => s.markTabsUpdated);

  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, RowState> = {};
    estimates.forEach(e => {
      next[e.key] = {
        selected: true,
        editing: false,
        editValue: e.suggestedValue == null ? '' : String(e.suggestedValue),
        status: 'pending',
      };
    });
    setRows(next);
  }, [open, estimates]);

  const pendingEstimates = useMemo(
    () => estimates.filter(e => rows[e.key]?.status === 'pending'),
    [estimates, rows],
  );

  const applyOne = (est: PendingAiEstimate, value: AssumptionValue, edited: boolean) => {
    if (edited) {
      applyUserOverride({
        key: est.key,
        value,
        label: est.label,
        tabDependencies: est.affectedTabs,
        notes: 'Edited from AI estimate before applying.',
      });
      // Preserve the original AI estimate value on the record for audit.
      // setAssumption merges prev, but userOverride goes through a different path,
      // so write the AI value first (silently) if not already there.
      const store = useMasterAssumptionStore.getState();
      const rec = store.assumptions[est.key];
      if (rec && rec.acceptedAiEstimateValue == null) {
        // Inject the original AI value into the record without changing effective value.
        useMasterAssumptionStore.setState(state => ({
          assumptions: {
            ...state.assumptions,
            [est.key]: { ...rec, acceptedAiEstimateValue: est.suggestedValue },
          },
        }));
      }
    } else {
      acceptAiEstimate({
        key: est.key,
        estimatedValue: value,
        confidence: est.confidence,
        label: est.label,
        tabDependencies: est.affectedTabs,
        notes: [
          est.sourceBasis?.length ? `Source: ${est.sourceBasis.join('; ')}` : null,
          est.riskNotes?.length ? `Risk: ${est.riskNotes.join('; ')}` : null,
          est.missingInformation?.length ? `Missing: ${est.missingInformation.join('; ')}` : null,
        ].filter(Boolean).join(' • ') || undefined,
      });
    }
    markTabsUpdated(est.affectedTabs, `${edited ? 'Edited' : 'Accepted'} AI estimate: ${est.label}`);
  };

  const handleAcceptSelected = () => {
    const acceptedKeys: string[] = [];
    for (const est of estimates) {
      const row = rows[est.key];
      if (!row || row.status !== 'pending' || !row.selected) continue;
      const edited = row.editing && row.editValue !== String(est.suggestedValue);
      const value = edited ? parseEdited(row.editValue, est.suggestedValue) : est.suggestedValue;
      applyOne(est, value, edited);
      acceptedKeys.push(est.key);
    }
    if (acceptedKeys.length === 0) {
      toast.info('Nothing selected to accept.');
      return;
    }
    setRows(prev => {
      const next = { ...prev };
      acceptedKeys.forEach(k => { next[k] = { ...next[k], status: 'accepted' }; });
      return next;
    });
    onApplied?.(acceptedKeys);
    toast.success(`Applied ${acceptedKeys.length} estimate${acceptedKeys.length === 1 ? '' : 's'}.`);
  };

  const handleAcceptAll = () => {
    setRows(prev => {
      const next = { ...prev };
      estimates.forEach(e => { if (next[e.key]?.status === 'pending') next[e.key] = { ...next[e.key], selected: true }; });
      return next;
    });
    // Defer one tick so selection change is committed; safer to just apply directly:
    const acceptedKeys: string[] = [];
    for (const est of estimates) {
      const row = rows[est.key];
      if (!row || row.status !== 'pending') continue;
      applyOne(est, est.suggestedValue, false);
      acceptedKeys.push(est.key);
    }
    if (acceptedKeys.length === 0) return;
    setRows(prev => {
      const next = { ...prev };
      acceptedKeys.forEach(k => { next[k] = { ...next[k], status: 'accepted' }; });
      return next;
    });
    onApplied?.(acceptedKeys);
    toast.success(`Accepted all ${acceptedKeys.length} estimates.`);
  };

  const handleRejectSelected = () => {
    const rejected: string[] = [];
    setRows(prev => {
      const next = { ...prev };
      for (const est of estimates) {
        const row = next[est.key];
        if (row?.status === 'pending' && row.selected) {
          next[est.key] = { ...row, status: 'rejected' };
          rejected.push(est.key);
        }
      }
      return next;
    });
    if (rejected.length) toast.message(`Rejected ${rejected.length} estimate${rejected.length === 1 ? '' : 's'}.`);
  };

  const handleRejectAll = () => {
    setRows(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (next[k].status === 'pending') next[k] = { ...next[k], status: 'rejected' };
      });
      return next;
    });
    toast.message('Rejected all pending estimates.');
  };

  const handleMarkVerified = (est: PendingAiEstimate) => {
    const ok = window.confirm(
      `Mark "${est.label}" as Verified?\n\nOnly do this if you have sighted external evidence (contract, lease, valuation, broker quote, etc.) that confirms this value.`,
    );
    if (!ok) return;
    // Ensure value is in store before flagging verified.
    const store = useMasterAssumptionStore.getState();
    if (!store.assumptions[est.key]) {
      acceptAiEstimate({
        key: est.key,
        estimatedValue: est.suggestedValue,
        confidence: est.confidence,
        label: est.label,
        tabDependencies: est.affectedTabs,
      });
    }
    markVerified(est.key, 'User confirmed external verification from AI Estimate Review Panel.');
    markTabsUpdated(est.affectedTabs, `Verified: ${est.label}`);
    setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], status: 'accepted' } }));
    toast.success(`Marked "${est.label}" as Verified.`);
  };

  const pendingCount = pendingEstimates.length;
  const total = estimates.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Estimate Review
            <Badge variant="outline" className="ml-2">{pendingCount} pending</Badge>
            <Badge variant="secondary">{total} total</Badge>
          </DialogTitle>
          <DialogDescription>
            AI estimates never auto-overwrite calculator fields. Review each suggestion below, then accept, edit, reject, or verify it. Accepted values cascade into all dependent tabs.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-3">
            {estimates.length === 0 && (
              <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No AI estimates to review.
              </div>
            )}

            {estimates.map(est => {
              const row = rows[est.key];
              if (!row) return null;
              const isDone = row.status !== 'pending';
              const insufficient =
                est.suggestedValue === null ||
                est.suggestedValue === undefined ||
                est.suggestedValue === '';
              return (
                <div
                  key={est.key}
                  className={`rounded-lg border p-3 ${
                    row.status === 'accepted' ? 'border-emerald-500/40 bg-emerald-500/5'
                    : row.status === 'rejected' ? 'border-destructive/40 bg-destructive/5 opacity-70'
                    : insufficient ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border/70 bg-card/60'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={row.selected}
                        disabled={isDone || insufficient}
                        onCheckedChange={(v) =>
                          setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], selected: Boolean(v) } }))
                        }
                        className="mt-1"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{est.label}</span>
                          {!insufficient && (
                            <Badge variant="outline" className={confidenceBadge[est.confidence]}>
                              {est.confidence} confidence
                            </Badge>
                          )}
                          <Badge variant="outline">{est.source ?? 'AI Estimate'}</Badge>
                          {insufficient && (
                            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                              <AlertTriangle className="mr-1 h-3 w-3" /> Insufficient information
                            </Badge>
                          )}
                          {est.specialistReview && !insufficient && (
                            <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-300">
                              <AlertTriangle className="mr-1 h-3 w-3" /> Specialist review
                            </Badge>
                          )}
                          {row.status === 'accepted' && (
                            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Applied
                            </Badge>
                          )}
                          {row.status === 'rejected' && (
                            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                              Rejected
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Tabs affected: {est.affectedTabs.join(', ') || '—'}
                        </div>
                      </div>
                    </div>

                    {!isDone && (
                      <div className="flex flex-wrap gap-2">
                        {!insufficient && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], editing: !prev[est.key].editing } }))
                            }
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            {row.editing ? 'Cancel edit' : 'Edit'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => {
                          setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], status: 'rejected' } }));
                        }}>
                          <X className="mr-1 h-3 w-3" /> {insufficient ? 'Dismiss' : 'Reject'}
                        </Button>
                        {!insufficient && (
                          <Button size="sm" variant="secondary" onClick={() => handleMarkVerified(est)}>
                            <ShieldCheck className="mr-1 h-3 w-3" /> Mark Verified
                          </Button>
                        )}
                        {!insufficient && (
                          <Button size="sm" onClick={() => {
                            const edited = row.editing && row.editValue !== String(est.suggestedValue);
                            const value = edited ? parseEdited(row.editValue, est.suggestedValue) : est.suggestedValue;
                            applyOne(est, value, edited);
                            setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], status: 'accepted' } }));
                            onApplied?.([est.key]);
                            toast.success(`Applied "${est.label}".`);
                          }}>
                            Accept
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {insufficient ? (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      Insufficient information to estimate this field. Please add property details, lease information, contract data or market evidence.
                      {est.missingInformation && est.missingInformation.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 opacity-80">
                          {est.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="Current value" value={fmt(est.currentValue, est.unit)} />
                      <Field label="Suggested value" value={fmt(est.suggestedValue, est.unit)} />
                      <Field label="Suggested range" value={fmtRange(est.suggestedRange, est.unit)} />
                      <Field label="Confidence" value={est.confidence} />
                      <List label="Source basis" values={est.sourceBasis} />
                      <List label="Missing information" values={est.missingInformation} />
                      <List label="Risk warning" values={est.riskNotes} />
                    </div>
                  )}

                  {row.editing && !isDone && !insufficient && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Edit before applying:</span>
                      <Input
                        value={row.editValue}
                        onChange={(e) => setRows(prev => ({ ...prev, [est.key]: { ...prev[est.key], editValue: e.target.value } }))}
                        className="max-w-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-6 py-3">
          <div className="text-xs text-muted-foreground">
            Accepted estimates write to the Master Property Assumption Store as <span className="font-medium">AI Estimate</span>, cascade to dependent tabs, and mark any generated report as out of date.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={handleRejectAll} disabled={pendingCount === 0}>Reject all</Button>
            <Button variant="outline" size="sm" onClick={handleRejectSelected} disabled={pendingCount === 0}>Reject selected</Button>
            <Button variant="outline" size="sm" onClick={handleAcceptSelected} disabled={pendingCount === 0}>Accept selected</Button>
            <Button size="sm" onClick={handleAcceptAll} disabled={pendingCount === 0}>Accept all</Button>
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function List({ label, values }: { label: string; values?: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {values && values.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {values.map((v, i) => <li key={i}>{v}</li>)}
        </ul>
      ) : (
        <div className="text-xs text-muted-foreground">None identified</div>
      )}
    </div>
  );
}
