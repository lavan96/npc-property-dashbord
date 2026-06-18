import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CalculatorPrefill } from '@/contexts/CalculatorPrefillContext';

export type IndustrialMetricSource =
  | 'Blank'
  | 'Property Profile'
  | 'Scraped'
  | 'Lease Extracted'
  | 'NOI Tab'
  | 'Cap Rate Tab'
  | 'GST Tab'
  | 'Borrowing Capacity'
  | 'DCF Tab'
  | 'Research Engine'
  | 'AI Estimate'
  | 'Manual'
  | 'User Override'
  | 'Verified';

export interface SourceCandidate {
  value: number | null | undefined;
  source: IndustrialMetricSource;
}

export interface AssumptionHistoryEntry {
  value: string;
  source: IndustrialMetricSource;
  replacedBy: IndustrialMetricSource;
  changedAt: string;
}

interface CascadedFieldState {
  value: string;
  source: IndustrialMetricSource;
  originalValue?: string;
  originalSource?: IndustrialMetricSource;
  pendingSource?: { value: string; source: IndustrialMetricSource };
  history: AssumptionHistoryEntry[];
}

const sourceLabels: Record<IndustrialMetricSource, string> = {
  Blank: 'Blank',
  'Property Profile': 'From Property',
  Scraped: 'Scraped',
  'Lease Extracted': 'From Lease',
  'NOI Tab': 'From NOI',
  'Cap Rate Tab': 'From Cap Rate',
  'GST Tab': 'From GST',
  'Borrowing Capacity': 'From Borrowing',
  'DCF Tab': 'From DCF',
  'Research Engine': 'Research',
  'AI Estimate': 'AI Estimate',
  Manual: 'Manual',
  'User Override': 'Override',
  Verified: 'Verified',
};

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function pickFirstSource(candidates: SourceCandidate[]): { value: string; source: IndustrialMetricSource } | null {
  const selected = candidates.find((candidate) => hasNumber(candidate.value));
  return selected ? { value: String(selected.value), source: selected.source } : null;
}

export function prefillValue(prefill: CalculatorPrefill | null, key: string): number | null | undefined {
  return prefill ? (prefill as unknown as Record<string, number | null | undefined>)[key] : undefined;
}

export function useCascadedIndustrialField(
  prefill: CalculatorPrefill | null,
  candidates: SourceCandidate[],
) {
  const selectedSource = useMemo(() => pickFirstSource(candidates), [candidates]);
  const [field, setField] = useState<CascadedFieldState>({ value: '', source: 'Blank', history: [] });

  useEffect(() => {
    if (!prefill) {
      setField({ value: '', source: 'Blank', history: [] });
      return;
    }

    setField((current) => {
      if (!selectedSource) {
        return current.source === 'User Override' || current.source === 'Verified' ? { ...current, pendingSource: undefined } : { ...current, value: '', source: 'Blank', pendingSource: undefined };
      }

      if (current.source === 'User Override' || current.source === 'Verified') {
        return current.value !== selectedSource.value ? { ...current, pendingSource: selectedSource } : { ...current, pendingSource: undefined };
      }

      return {
        ...current,
        value: selectedSource.value,
        source: selectedSource.source,
        originalValue: selectedSource.value,
        originalSource: selectedSource.source,
        pendingSource: undefined,
      };
    });
  }, [prefill, selectedSource?.value, selectedSource?.source]);

  const setValue = (value: string) => {
    setField((current) => {
      const source: IndustrialMetricSource = current.source === 'Blank' || current.source === 'Manual' ? 'Manual' : 'User Override';
      const shouldCaptureHistory = source === 'User Override' && current.source !== 'User Override' && current.value !== '';
      return {
        ...current,
        value,
        source,
        originalValue: current.originalValue ?? current.value,
        originalSource: current.originalSource ?? current.source,
        history: shouldCaptureHistory
          ? [...current.history, { value: current.value, source: current.source, replacedBy: source, changedAt: new Date().toISOString() }]
          : current.history,
      };
    });
  };

  const keepOverride = () => setField((current) => ({ ...current, pendingSource: undefined }));

  const useSourceValue = () => setField((current) => {
    if (!current.pendingSource) return current;
    return {
      ...current,
      value: current.pendingSource.value,
      source: current.pendingSource.source,
      originalValue: current.pendingSource.value,
      originalSource: current.pendingSource.source,
      history: [...current.history, { value: current.value, source: current.source, replacedBy: current.pendingSource.source, changedAt: new Date().toISOString() }],
      pendingSource: undefined,
    };
  });

  const markVerified = () => setField((current) => ({ ...current, source: 'Verified' }));

  return { ...field, setValue, keepOverride, useSourceValue, markVerified };
}

export function SourceBadge({ source }: { source: IndustrialMetricSource }) {
  const variant = source === 'User Override' ? 'secondary' : source === 'Verified' ? 'default' : 'outline';
  return <Badge variant={variant} className="whitespace-nowrap text-[10px]">{sourceLabels[source]}</Badge>;
}

export function SourceActions({ field }: { field: ReturnType<typeof useCascadedIndustrialField> }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {field.pendingSource && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <p>New source value available. This field currently uses a saved override.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={field.keepOverride}>Keep override</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={field.useSourceValue}>Use source value</Button>
          </div>
        </div>
      )}
      {field.history.length > 0 && (
        <details>
          <summary className="cursor-pointer">Assumption history</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {field.history.map((entry, index) => (
              <li key={`${entry.changedAt}-${index}`}>{entry.source} value {entry.value} replaced by {entry.replacedBy}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
