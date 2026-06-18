/**
 * ActivePropertyHeader
 * ---------------------------------------------------------------------------
 * Sits at the top of the Commercial & Industrial calculator suite when a
 * property is loaded via the Property Injection Pipeline.
 *
 *  - Shows the active property identity
 *  - Shows the data completeness score
 *  - Lists missing assumptions (with the tabs they feed)
 *  - Offers "Run AI Estimates for Missing Fields"
 *  - Tags any AI-supplied values as estimates (never verified)
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, AlertTriangle, CheckCircle2, Building2, Factory, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import {
  cascadePrefillIntoMasterStore,
  computeCompleteness,
  type CompletenessReport,
} from '@/utils/commercial/propertyInjectionPipeline';
import { useMasterAssumptionStore } from '@/utils/commercial/masterPropertyAssumptionStore';
import { useReportFreshnessStore } from '@/utils/commercial/reportFreshnessStore';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { AiEstimateReviewPanel, type PendingAiEstimate } from './AiEstimateReviewPanel';

export function MasterActivePropertyHeader() {
  const { domain, prefill, property } = useCalculatorPrefill();
  const assumptions = useMasterAssumptionStore(s => s.assumptions);
  const { reportsOutOfDate, updatedTabs } = useReportFreshnessStore();
  const [running, setRunning] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingEstimates, setPendingEstimates] = useState<PendingAiEstimate[]>([]);

  // Cascade prefill into master store whenever the active property changes.
  useEffect(() => {
    if (prefill) {
      cascadePrefillIntoMasterStore(prefill, 'Property Profile');
    }
  }, [prefill?.propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeness: CompletenessReport = useMemo(
    () => computeCompleteness(domain),
    // re-derive whenever store contents change
    [domain, assumptions], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleRunAiEstimates = async () => {
    if (!prefill) {
      toast.error('Load a property first.');
      return;
    }
    if (completeness.missing.length === 0) {
      toast.info('No missing fields — nothing to estimate.');
      return;
    }

    setRunning(true);
    try {
      const { data, error } = await invokeSecureFunction('commercial-property-ai-estimates', {
        domain,
        propertyId: prefill.propertyId,
        address: prefill.address,
        state: prefill.state,
        assetSubtype: prefill.assetSubtype,
        knownFields: Object.fromEntries(
          Object.entries(prefill).filter(([, v]) => v !== null && v !== '' && v !== undefined),
        ),
        missingFields: completeness.missing.map(m => ({ key: m.key, label: m.label })),
      }, { timeoutMs: 120000 });

      if (error) throw new Error(error.message || 'AI estimates failed');
      if (!data?.success) throw new Error(data?.error || 'AI estimates returned no data');

      const raw: Array<any> = data.estimates || [];
      const pending: PendingAiEstimate[] = raw
        .filter(e => e.value !== null && e.value !== undefined && e.value !== '')
        .map(e => {
          const meta = completeness.missing.find(m => m.key === e.key);
          const current = assumptions[e.key]?.value ?? null;
          return {
            key: e.key,
            label: meta?.label ?? e.label ?? e.key,
            unit: e.unit ?? null,
            currentValue: current,
            suggestedValue: e.value,
            suggestedRange: e.range ?? null,
            confidence: e.confidence ?? 'low',
            sourceBasis: e.sourceBasis ?? (e.rationale ? [e.rationale] : ['AI estimate']),
            missingInformation: e.missingData ?? [],
            riskNotes: e.riskNotes ?? [],
            affectedTabs: e.affectedTabs ?? meta?.tabs ?? [],
            specialistReview: Boolean(e.specialistReview),
            source: e.source ?? 'AI Estimate',
          };
        });

      if (pending.length === 0) {
        toast.info('AI returned no usable estimates.');
        return;
      }

      setPendingEstimates(pending);
      setReviewOpen(true);
      toast.success(`${pending.length} AI estimate${pending.length === 1 ? '' : 's'} ready for review.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI estimates failed';
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  if (!prefill || !property) {
    return (
      <Card className="border-dashed border-primary/30 bg-card/40">
        <CardContent className="p-4 text-sm text-muted-foreground">
          No active calculator property yet. Use <span className="font-medium text-foreground">Add property to calculators</span> to inject one from any source (manual, scrape, PDF, contract, lease, or an existing record).
        </CardContent>
      </Card>
    );
  }

  const Icon = domain === 'industrial' ? Factory : Building2;
  const tone =
    completeness.scorePct >= 80 ? 'success'
    : completeness.scorePct >= 50 ? 'warning'
    : 'critical';

  return (
    <Card className="border-primary/30 bg-card/80 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active Calculator Property
              </div>
              <div className="text-base font-semibold text-foreground">{prefill.address || '—'}</div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                {prefill.state && <Badge variant="outline">{prefill.state}</Badge>}
                {prefill.assetSubtype && (
                  <Badge variant="secondary" className="capitalize">
                    {String(prefill.assetSubtype).replace(/_/g, ' ')}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-background/60">{domain}</Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Data completeness
              </div>
              <div className={`text-2xl font-bold ${tone === 'success' ? 'text-emerald-500' : tone === 'warning' ? 'text-amber-500' : 'text-destructive'}`}>
                {completeness.scorePct}%
              </div>
              <div className="text-xs text-muted-foreground">
                {completeness.totalKnown}/{completeness.totalRequired} required fields
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleRunAiEstimates}
              disabled={running || completeness.missing.length === 0}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Run AI Estimates for Missing Fields
            </Button>
          </div>
        </div>

        <Progress value={completeness.scorePct} className="h-2" />

        <div className="grid gap-3 md:grid-cols-3">
          <Stat icon={CheckCircle2} tone="success" label="Known" value={completeness.totalKnown} />
          <Stat icon={Sparkles} tone="warning" label="AI Estimated (unverified)" value={completeness.totalEstimated} />
          <Stat icon={AlertTriangle} tone="critical" label="Missing" value={completeness.totalBlank} />
        </div>

        {completeness.missing.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Missing assumptions ({completeness.missing.length})
            </div>
            <ScrollArea className="max-h-40">
              <ul className="space-y-1 text-xs">
                {completeness.missing.map(m => (
                  <li key={m.key} className="flex items-start justify-between gap-2 rounded px-2 py-1 hover:bg-muted/40">
                    <span className="text-foreground">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground">{m.tabs.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        {completeness.totalEstimated > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">
            {completeness.totalEstimated} field{completeness.totalEstimated === 1 ? '' : 's'} populated by AI estimate. These are labelled as estimates and must be verified before relying on report outputs.
          </div>
        )}

        {pendingEstimates.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-700 dark:text-sky-300">
            <span>{pendingEstimates.length} AI estimate{pendingEstimates.length === 1 ? '' : 's'} awaiting review.</span>
            <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>Open review panel</Button>
          </div>
        )}

        {reportsOutOfDate && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <span>
              Final report is out of date — assumptions changed on: {updatedTabs.join(', ') || 'multiple tabs'}.
            </span>
          </div>
        )}
      </CardContent>

      <AiEstimateReviewPanel
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        estimates={pendingEstimates}
      />
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: 'success' | 'warning' | 'critical' }) {
  const toneClass =
    tone === 'success' ? 'text-emerald-500'
    : tone === 'warning' ? 'text-amber-500'
    : 'text-destructive';
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      </div>
    </div>
  );
}
