/**
 * OverviewCommandLayer
 * --------------------
 * The Overview tab's "command layer" for the Commercial & Industrial
 * calculator suite. Surfaces the active property, readiness per calculator
 * tab, key outputs, critical warnings, next best action, report readiness,
 * and the three primary CTAs.
 *
 * Reads from:
 *   - useCalculatorPrefill (active property)
 *   - useCommercialDealState (profile + AI estimate metadata)
 *   - useMasterAssumptionStore (per-key records — drives readiness math)
 *   - useGlobalReadiness (status + prioritised warnings)
 *
 * Writes nothing. CTAs dispatch the same window events that
 * GlobalGenerationControls already listens for.
 */
import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  FileText,
  Sparkles,
  Building2,
  Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import {
  useMasterAssumptionStore,
  type CalculatorTabKey,
  type MasterAssumptionRecord,
} from '@/utils/commercial/masterPropertyAssumptionStore';
import {
  useGlobalReadiness,
  READINESS_BADGE_CLASS,
  SEVERITY_BADGE_CLASS,
} from '@/utils/commercial/globalReadiness';
import { CASCADE_REGISTRY } from '@/utils/commercial/cascadeMap';

// Map master-store tab key → existing tab value in PropertyCalculators
const TAB_VALUE: Record<CalculatorTabKey, string> = {
  overview: 'overview',
  noi: 'noi',
  capRate: 'cap',
  icrDscr: 'icr',
  gst: 'gst',
  borrowing: 'borrowing',
  dcf: 'dcf',
  tenYearCashFlow: 'ten-year',
  industrialMetrics: 'rent',
};

const TAB_LABEL: Record<Exclude<CalculatorTabKey, 'overview'>, string> = {
  noi: 'NOI',
  capRate: 'Cap Rate',
  icrDscr: 'ICR / DSCR',
  gst: 'GST',
  borrowing: 'Borrowing Capacity',
  dcf: 'DCF',
  tenYearCashFlow: '10-Year Cash Flow',
  industrialMetrics: 'Industrial Metrics',
};

const READINESS_TABS: Array<Exclude<CalculatorTabKey, 'overview'>> = [
  'noi', 'capRate', 'icrDscr', 'gst', 'borrowing', 'dcf', 'tenYearCashFlow', 'industrialMetrics',
];

type CardStatus = 'Not Started' | 'In Progress' | 'Ready for Review' | 'Ready' | 'Verified';

interface TabReadiness {
  tab: Exclude<CalculatorTabKey, 'overview'>;
  label: string;
  status: CardStatus;
  expected: number;
  filled: number;
  missing: number;
  lastUpdated: string | null;
  confidence: 'Pending' | 'Low' | 'Medium' | 'High' | 'Verified';
}

function fmt(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return 'Pending';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

function relTime(iso: string | null) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return new Date(iso).toLocaleString();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function openTab(tab: CalculatorTabKey | string) {
  const target = (TAB_VALUE as Record<string, string>)[tab as string] ?? String(tab);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('calculator-tab-open', { detail: { tab: target } }));
}

function dispatchSuite(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail: { timestamp: new Date().toISOString() } }));
}

function computeTabReadiness(
  tab: Exclude<CalculatorTabKey, 'overview'>,
  records: MasterAssumptionRecord[],
): TabReadiness {
  const registry = CASCADE_REGISTRY[tab] ?? {};
  const expectedKeys = Object.values(registry).map(d => d.key);
  const expected = expectedKeys.length || 1;

  // Index records by key for lookup
  const byKey = new Map(records.map(r => [r.key, r]));
  const filledRecords = expectedKeys.map(k => byKey.get(k)).filter(Boolean) as MasterAssumptionRecord[];
  const filled = filledRecords.length;
  const missing = Math.max(0, expected - filled);

  // Confidence aggregation
  const conf: TabReadiness['confidence'] = (() => {
    if (filled === 0) return 'Pending';
    if (filledRecords.every(r => r.verificationStatus === 'verified')) return 'Verified';
    const score = filledRecords.reduce((acc, r) => {
      switch (r.confidence) {
        case 'high': return acc + 3;
        case 'medium': return acc + 2;
        case 'low': return acc + 1;
        default: return acc;
      }
    }, 0) / filled;
    if (score >= 2.5) return 'High';
    if (score >= 1.5) return 'Medium';
    return 'Low';
  })();

  // Status
  const status: CardStatus = (() => {
    if (filled === 0) return 'Not Started';
    if (filledRecords.some(r => r.warningStatus === 'critical' || r.warningStatus === 'caution')) return 'Ready for Review';
    if (missing > 0) return 'In Progress';
    if (conf === 'Verified') return 'Verified';
    return 'Ready';
  })();

  // Last updated = max lastUpdated across filled records
  const lastUpdated = filledRecords.reduce<string | null>((acc, r) => {
    if (!acc) return r.lastUpdated;
    return new Date(r.lastUpdated) > new Date(acc) ? r.lastUpdated : acc;
  }, null);

  return { tab, label: TAB_LABEL[tab], status, expected, filled, missing, lastUpdated, confidence: conf };
}

const STATUS_TONE: Record<CardStatus, string> = {
  'Not Started': 'bg-slate-500/10 text-slate-300 border-slate-500/40',
  'In Progress': 'bg-sky-500/10 text-sky-300 border-sky-500/40',
  'Ready for Review': 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  Ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  Verified: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/50',
};

const CONF_TONE: Record<TabReadiness['confidence'], string> = {
  Pending: 'text-muted-foreground',
  Low: 'text-amber-300',
  Medium: 'text-sky-300',
  High: 'text-emerald-300',
  Verified: 'text-emerald-200',
};

export function OverviewCommandLayer() {
  const { prefill, property, domain } = useCalculatorPrefill();
  const profile = useCommercialDealState(s => s.profile);
  const assumptions = useMasterAssumptionStore(s => s.assumptions);
  const readiness = useGlobalReadiness();

  const records = useMemo(() => Object.values(assumptions), [assumptions]);

  // Data completeness — based on master store coverage across all 8 tabs
  const allExpectedKeys = useMemo(() => {
    const keys = new Set<string>();
    READINESS_TABS.forEach(t =>
      Object.values(CASCADE_REGISTRY[t] ?? {}).forEach(d => keys.add(d.key)),
    );
    return Array.from(keys);
  }, []);
  const completeness = allExpectedKeys.length
    ? Math.round((allExpectedKeys.filter(k => assumptions[k] != null && assumptions[k].value != null).length / allExpectedKeys.length) * 100)
    : 0;

  const missingAssumptions = allExpectedKeys.filter(k => !assumptions[k] || assumptions[k].value == null).length;

  const aiMetadata = profile.aiEstimateMetadata ?? {};
  const aiPending = Object.values(aiMetadata).filter((e: any) => !e?.accepted).length;
  const aiAccepted = Object.values(aiMetadata).filter((e: any) => e?.accepted).length;

  const tabReadiness = useMemo(
    () => READINESS_TABS.map(t => computeTabReadiness(t, records)),
    [records],
  );

  const borrowing = profile.borrowingOutputs;
  const keyOutputs = [
    { label: 'Purchase price', value: fmt((profile.propertyValuation as any)?.purchasePrice) },
    { label: 'Market value', value: fmt((profile.propertyValuation as any)?.estimatedMarketValue) },
    { label: 'Stabilised NOI', value: fmt(borrowing?.noi?.stabilisedNoi ?? (profile.noiOutputs as any)?.stabilisedNoi) },
    { label: 'Max risk-adj. loan', value: fmt(borrowing?.finalRiskAdjustedLoan) },
    { label: 'Implied LVR', value: borrowing?.impliedLvr != null ? `${(borrowing.impliedLvr * 100).toFixed(1)}%` : 'Pending' },
    { label: 'ICR / DSCR', value: borrowing ? `${borrowing.icr?.toFixed?.(2) ?? '–'}x / ${borrowing.dscr?.toFixed?.(2) ?? '–'}x` : 'Pending' },
  ];

  // Next best action — derived
  const nextBestAction = useMemo(() => {
    if (!prefill) return { title: 'Link a property to begin', action: 'Add property', tab: 'overview' as const };
    if (aiPending > 0) return { title: `${aiPending} AI estimate${aiPending === 1 ? '' : 's'} awaiting review`, action: 'Open AI Review', tab: 'overview' as const };
    if (readiness.counts.critical > 0) return { title: 'Resolve critical warnings', action: 'Open first warning', tab: readiness.topWarnings[0]?.tab ?? 'overview' };
    if (missingAssumptions > 0) return { title: `${missingAssumptions} assumption${missingAssumptions === 1 ? '' : 's'} still missing`, action: 'Run AI estimates', tab: 'overview' as const };
    if (readiness.status === 'Calculators Ready' || readiness.status === 'Report Ready') return { title: 'Generate the client report', action: 'Generate Report', tab: 'overview' as const };
    return { title: 'Review and verify assumptions', action: 'Open Assumption Status', tab: 'overview' as const };
  }, [prefill, aiPending, readiness, missingAssumptions]);

  const reportReady = readiness.status === 'Report Ready'
    || readiness.status === 'Report Generated'
    || readiness.status === 'Verified'
    || readiness.status === 'Calculators Ready';

  return (
    <div className="space-y-4">
      {/* ─── Header: active property + primary CTAs ───────────────────────── */}
      <Card className="border-primary/30 bg-card/95">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Calculator Command Layer
                <Badge variant="outline" className={READINESS_BADGE_CLASS[readiness.status]}>
                  {readiness.status}
                </Badge>
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-primary/30 bg-primary/5">
                  <Building2 className="mr-1 h-3 w-3" />
                  {prefill?.address ?? 'No property linked'}
                </Badge>
                <Badge variant="outline">Domain: {domain === 'industrial' ? 'Industrial' : 'Commercial'}</Badge>
                {prefill?.assetSubtype && <Badge variant="outline">{String(prefill.assetSubtype).replace(/_/g, ' ')}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!prefill}
                onClick={() => dispatchSuite('commercial-calculators-run-ai-estimates')}
              >
                <Sparkles className="mr-1 h-4 w-4" /> Run AI Estimates
              </Button>
              <Button
                size="sm"
                disabled={!prefill}
                onClick={() => dispatchSuite('commercial-calculators-generate-calculations')}
              >
                <Calculator className="mr-1 h-4 w-4" /> Generate Calculations
              </Button>
              <Button
                size="sm"
                variant={reportReady ? 'default' : 'secondary'}
                disabled={!reportReady}
                onClick={() => dispatchSuite('commercial-calculators-generate-report')}
              >
                <FileText className="mr-1 h-4 w-4" /> Generate Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Data completeness</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">{completeness}%</span>
              <span className="text-xs text-muted-foreground">across 8 calculators</span>
            </div>
            <Progress value={completeness} className="mt-2 h-1.5" />
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Missing assumptions</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">{missingAssumptions}</span>
              <span className="text-xs text-muted-foreground">of {allExpectedKeys.length} expected keys</span>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">{records.length} captured</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">AI estimates</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-amber-300">{aiPending}</span>
              <span className="text-xs text-muted-foreground">awaiting review</span>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">{aiAccepted} accepted</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Report readiness</div>
            <div className="mt-1">
              <Badge variant="outline" className={READINESS_BADGE_CLASS[readiness.status]}>{readiness.status}</Badge>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {reportReady ? 'PDF can be generated.' : 'Resolve gaps before generating.'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Next best action + critical warnings ─────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <Card className="bg-card/95">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ArrowRight className="h-4 w-4 text-primary" /> Next best action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{nextBestAction.title}</p>
            <Button size="sm" className="mt-3" onClick={() => openTab(nextBestAction.tab)}>
              {nextBestAction.action}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card/95">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Critical warnings
              <Badge variant="outline" className="ml-1">{readiness.counts.critical} critical · {readiness.counts.caution} caution</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.topWarnings.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> No active warnings.
              </p>
            ) : (
              readiness.topWarnings.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-start justify-between gap-3 rounded-md border bg-background/40 p-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={SEVERITY_BADGE_CLASS[w.severity]}>{w.severity}</Badge>
                      <span className="font-medium text-foreground">{w.title}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{w.nextAction}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => openTab(w.tab)}>Open</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Calculator readiness cards ──────────────────────────────────── */}
      <Card className="bg-card/95">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Calculator readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tabReadiness.map(tr => {
              const pct = Math.round((tr.filled / tr.expected) * 100);
              return (
                <div key={tr.tab} className="rounded-lg border bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{tr.label}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {tr.filled}/{tr.expected} fields · {tr.missing} missing
                      </div>
                    </div>
                    <Badge variant="outline" className={STATUS_TONE[tr.status]}>{tr.status}</Badge>
                  </div>
                  <Progress value={pct} className="mt-2 h-1.5" />
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className={CONF_TONE[tr.confidence]}>{tr.confidence}</span>
                    <span className="text-muted-foreground">{relTime(tr.lastUpdated)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 h-7 w-full justify-between px-2"
                    onClick={() => openTab(tr.tab)}
                  >
                    Open tab <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Key outputs ─────────────────────────────────────────────────── */}
      <Card className="bg-card/95">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Key outputs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {keyOutputs.map(o => (
              <div key={o.label} className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{o.label}</span>
                <span className="font-medium text-foreground">{o.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
