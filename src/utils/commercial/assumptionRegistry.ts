export type AssumptionConfidenceTag =
  | 'Verified'
  | 'Manual Estimate'
  | 'AI Estimate'
  | 'Unknown'
  | 'Overridden'
  | 'Specialist Review Required'
  | 'Calculated';

export interface AssumptionProvenance {
  fieldKey: string;
  label: string;
  confidenceTag: AssumptionConfidenceTag;
  sourceBasis?: string[];
  requiredDocuments?: string[];
  verificationRequired?: boolean;
  notes?: string;
}

export const CONFIDENCE_BADGE_CLASS: Record<AssumptionConfidenceTag, string> = {
  Verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  'Manual Estimate': 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  'AI Estimate': 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  Unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  Overridden: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
  'Specialist Review Required': 'bg-red-500/15 text-red-300 border-red-500/40',
  Calculated: 'bg-primary/15 text-primary border-primary/40',
};

export function deriveCalculatedConfidence(tags: AssumptionConfidenceTag[]): AssumptionConfidenceTag {
  if (tags.includes('Specialist Review Required')) return 'Specialist Review Required';
  if (tags.includes('Unknown')) return 'Unknown';
  if (tags.includes('Overridden')) return 'Overridden';
  if (tags.includes('AI Estimate')) return 'AI Estimate';
  if (tags.includes('Manual Estimate')) return 'Manual Estimate';
  if (tags.length && tags.every(t => t === 'Verified')) return 'Verified';
  return 'Calculated';
}

export function confidenceLabel(tag: AssumptionConfidenceTag): string {
  return tag === 'Calculated' ? 'Calculated from verified + estimated inputs' : tag;
}
