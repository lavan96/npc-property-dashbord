import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { industrialBenchmarkConfig } from './industrialMetricBenchmarks';
import { parseMetricNumber, type IndustrialMetricSource } from './industrialMetricCascade';

export type IndustrialMetricsReadinessStatus =
  | 'Awaiting Industrial Inputs'
  | 'Preliminary Industrial Metrics'
  | 'Industrial Metrics Ready'
  | 'Benchmark Review Required'
  | 'Report Ready'
  | 'Verified';

type WarningCategory = 'Property Area' | 'Rent' | 'Outgoings' | 'Price' | 'Site Cover' | 'Hardstand' | 'Office Ratio' | 'Benchmark' | 'Data Source' | 'Verification';
type WarningSeverity = 'Critical' | 'Required' | 'Recommended';

interface WarningItem { category: WarningCategory; severity: WarningSeverity; message: string; nextAction: string }
interface FieldState { value: string; source: IndustrialMetricSource }
type FieldKey = 'baseRent' | 'outgoings' | 'gla' | 'siteArea' | 'hardstand' | 'officePct' | 'price';

interface ContextValue {
  updateField: (key: FieldKey, value: string, source: IndustrialMetricSource) => void;
}

const Ctx = createContext<ContextValue | undefined>(undefined);

export function IndustrialMetricsReadinessProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<Partial<Record<FieldKey, FieldState>>>({});
  const updateField = useCallback((key: FieldKey, value: string, source: IndustrialMetricSource) => {
    setFields((current) => {
      const previous = current[key];
      if (previous?.value === value && previous.source === source) return current;
      return { ...current, [key]: { value, source } };
    });
  }, []);

  return <Ctx.Provider value={{ updateField }}><IndustrialMetricsReadinessPanel fields={fields} />{children}</Ctx.Provider>;
}

export function useIndustrialMetricsReadiness() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useIndustrialMetricsReadiness must be used inside IndustrialMetricsReadinessProvider');
  return value;
}

function IndustrialMetricsReadinessPanel({ fields }: { fields: Partial<Record<FieldKey, FieldState>> }) {
  const { prefill } = useCalculatorPrefill();
  const assessment = useMemo(() => assessReadiness(fields, Boolean(prefill)), [fields, prefill]);
  const visibleWarnings = assessment.warnings.slice(0, 3);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Industrial Metrics Status</h3>
            <StatusBadge status={assessment.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{assessment.nextAction}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{assessment.requiredComplete ? 'Required complete' : 'Required incomplete'}</Badge>
          <Badge variant="outline">{assessment.recommendedMissing} recommended missing</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {visibleWarnings.map((warning) => <WarningCard key={`${warning.category}-${warning.message}`} warning={warning} />)}
        {visibleWarnings.length === 0 && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200"><CheckCircle2 className="mr-1 inline h-4 w-4" />Industrial metrics are ready for report inclusion.</div>}
      </div>

      {assessment.warnings.length > 3 && (
        <details className="mt-3 rounded-md border border-border/60 bg-background/30 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">View all assumptions and warnings</summary>
          <div className="mt-2 space-y-2">
            {assessment.warnings.map((warning) => <WarningCard key={`${warning.category}-${warning.severity}-${warning.message}`} warning={warning} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function assessReadiness(fields: Partial<Record<FieldKey, FieldState>>, hasLinkedProperty: boolean) {
  const parsed = {
    baseRent: parseMetricNumber(fields.baseRent?.value ?? ''),
    outgoings: parseMetricNumber(fields.outgoings?.value ?? ''),
    gla: parseMetricNumber(fields.gla?.value ?? ''),
    siteArea: parseMetricNumber(fields.siteArea?.value ?? ''),
    hardstand: parseMetricNumber(fields.hardstand?.value ?? ''),
    officePct: parseMetricNumber(fields.officePct?.value ?? ''),
    price: parseMetricNumber(fields.price?.value ?? ''),
  };
  const warnings: WarningItem[] = [];
  const add = (warning: WarningItem) => warnings.push(warning);

  if (!hasLinkedProperty) add({ category: 'Data Source', severity: 'Recommended', message: 'No property is linked.', nextAction: 'Import property area data to calculate rent and site benchmarks.' });
  if (parsed.gla === null) add({ category: 'Property Area', severity: 'Required', message: 'GLA is missing.', nextAction: 'Import property area data to calculate rent and site benchmarks.' });
  if (parsed.siteArea === null) add({ category: 'Property Area', severity: 'Required', message: 'Site area is missing.', nextAction: 'Confirm GLA and site area before relying on site cover.' });
  if (parsed.price === null) add({ category: 'Price', severity: 'Required', message: 'Price is missing.', nextAction: 'Add purchase price to calculate pricing benchmarks.' });
  if (parsed.baseRent === null) add({ category: 'Rent', severity: 'Required', message: 'Base rent is missing.', nextAction: 'Import NOI rent or enter base rent manually.' });
  if (parsed.outgoings === null) add({ category: 'Outgoings', severity: 'Recommended', message: 'Outgoings are missing.', nextAction: 'Import recovered outgoings to calculate gross rent per m².' });
  if (parsed.gla !== null && parsed.siteArea !== null && parsed.gla > parsed.siteArea) add({ category: 'Property Area', severity: 'Critical', message: 'GLA exceeds site area.', nextAction: 'Confirm GLA and site area before relying on site cover.' });
  if (parsed.gla !== null && parsed.siteArea !== null && parsed.siteArea > 0 && (parsed.gla / parsed.siteArea) * 100 > 100) add({ category: 'Site Cover', severity: 'Critical', message: 'Site cover is above 100%.', nextAction: 'Confirm GLA and site area before relying on site cover.' });
  if (parsed.hardstand !== null && parsed.siteArea !== null && parsed.hardstand > parsed.siteArea) add({ category: 'Hardstand', severity: 'Critical', message: 'Hardstand exceeds site area.', nextAction: 'Verify hardstand against plan or inspection.' });
  if (parsed.officePct !== null && parsed.officePct > 100) add({ category: 'Office Ratio', severity: 'Critical', message: 'Office ratio is above 100%.', nextAction: 'Confirm office component percentage before relying on usability benchmarks.' });

  if (parsed.baseRent !== null && parsed.gla !== null && parsed.gla > 0) {
    const rentPerSqm = parsed.baseRent / parsed.gla;
    if (rentPerSqm < industrialBenchmarkConfig.rentPerSqmGla.min || rentPerSqm > industrialBenchmarkConfig.rentPerSqmGla.max) add({ category: 'Benchmark', severity: 'Recommended', message: 'Rent per m² is materially outside benchmark range.', nextAction: 'Review industrial rent comparables.' });
  }
  if (parsed.price !== null && parsed.gla !== null && parsed.gla > 0) {
    const pricePerGla = parsed.price / parsed.gla;
    if (pricePerGla < industrialBenchmarkConfig.pricePerSqmGla.min || pricePerGla > industrialBenchmarkConfig.pricePerSqmGla.max) add({ category: 'Benchmark', severity: 'Recommended', message: 'Price per m² GLA is materially outside benchmark range.', nextAction: 'Price per m² is outside benchmark range. Review comparables.' });
  }
  if (parsed.price !== null && parsed.siteArea !== null && parsed.siteArea > 0) {
    const pricePerSite = parsed.price / parsed.siteArea;
    if (pricePerSite < industrialBenchmarkConfig.pricePerSqmSite.min || pricePerSite > industrialBenchmarkConfig.pricePerSqmSite.max) add({ category: 'Benchmark', severity: 'Recommended', message: 'Price per m² site is materially outside benchmark range.', nextAction: 'Price per m² is outside benchmark range. Review comparables.' });
  }

  Object.entries(fields).forEach(([key, field]) => {
    if (field?.source === 'AI Estimate') add({ category: 'Verification', severity: 'Recommended', message: `${labelForField(key)} is AI-estimated and unverified.`, nextAction: `${labelForField(key)} estimate is AI-generated. Verify against plan or inspection.` });
    if (field?.source === 'User Override') add({ category: 'Data Source', severity: 'Recommended', message: `${labelForField(key)} is manually overridden.`, nextAction: 'Review the override against source documents before report inclusion.' });
  });

  if (![fields.baseRent, fields.outgoings, fields.gla, fields.siteArea, fields.hardstand, fields.officePct, fields.price].some((field) => field?.source === 'Research Engine' || field?.source === 'AI Estimate' || field?.source === 'Verified')) add({ category: 'Benchmark', severity: 'Recommended', message: 'Benchmark source is missing.', nextAction: 'Add research/comparable support for benchmark interpretation.' });

  const preliminary = (parsed.baseRent !== null || parsed.price !== null) && (parsed.gla !== null || parsed.siteArea !== null);
  const requiredComplete = parsed.baseRent !== null && parsed.gla !== null && parsed.siteArea !== null && parsed.price !== null;
  const recommendedMissing = [parsed.outgoings, parsed.hardstand, parsed.officePct].filter((value) => value === null).length;
  const allVerified = requiredComplete && [fields.baseRent, fields.gla, fields.siteArea, fields.price].every((field) => field?.source === 'Verified');
  const hasCritical = warnings.some((warning) => warning.severity === 'Critical');
  const hasBenchmarkReview = warnings.some((warning) => warning.category === 'Benchmark' && warning.message.includes('outside benchmark'));
  const hasRequired = warnings.some((warning) => warning.severity === 'Required');

  let status: IndustrialMetricsReadinessStatus = 'Awaiting Industrial Inputs';
  if (allVerified && !hasCritical) status = 'Verified';
  else if (requiredComplete && !hasCritical && !hasRequired && recommendedMissing === 0 && !hasBenchmarkReview) status = 'Report Ready';
  else if (requiredComplete && hasBenchmarkReview) status = 'Benchmark Review Required';
  else if (requiredComplete) status = 'Industrial Metrics Ready';
  else if (preliminary) status = 'Preliminary Industrial Metrics';

  return {
    status,
    requiredComplete,
    recommendedMissing,
    warnings: orderWarnings(warnings),
    nextAction: nextActionForStatus(status, warnings),
  };
}

function orderWarnings(warnings: WarningItem[]) {
  const severityOrder: Record<WarningSeverity, number> = { Critical: 0, Required: 1, Recommended: 2 };
  return [...warnings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function labelForField(key: string) {
  const labels: Record<string, string> = { baseRent: 'Base rent', outgoings: 'Outgoings', gla: 'GLA', siteArea: 'Site area', hardstand: 'Hardstand', officePct: 'Office ratio', price: 'Price' };
  return labels[key] ?? key;
}

function nextActionForStatus(status: IndustrialMetricsReadinessStatus, warnings: WarningItem[]) {
  if (status === 'Report Ready' || status === 'Verified') return 'Industrial metrics are ready for report inclusion.';
  return warnings[0]?.nextAction ?? 'Import property area data to calculate rent and site benchmarks.';
}

function StatusBadge({ status }: { status: IndustrialMetricsReadinessStatus }) {
  const className = status === 'Verified' || status === 'Report Ready'
    ? 'border-green-500/30 bg-green-500/10 text-green-200'
    : status === 'Benchmark Review Required'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-primary/30 bg-primary/5 text-primary';
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

function WarningCard({ warning }: { warning: WarningItem }) {
  const className = warning.severity === 'Critical'
    ? 'border-red-500/30 bg-red-500/10'
    : warning.severity === 'Required'
      ? 'border-amber-500/30 bg-amber-500/10'
      : 'border-border/60 bg-background/30';
  return (
    <div className={`rounded-lg border p-3 text-sm ${className}`}>
      <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground"><AlertTriangle className="mr-1 inline h-4 w-4" />{warning.category}</span><Badge variant="outline" className="text-[10px]">{warning.severity}</Badge></div>
      <p className="mt-1 text-muted-foreground">{warning.message}</p>
      <p className="mt-1 text-xs text-muted-foreground">{warning.nextAction}</p>
    </div>
  );
}
