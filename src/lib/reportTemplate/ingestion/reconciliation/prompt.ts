import type { ReconciliationRequest } from './types';
import { buildTemplateSchemaSummary } from './schemaSummary';

export interface ReconciliationPromptPayload {
  system: string;
  user: string;
  schemaSummary: ReturnType<typeof buildTemplateSchemaSummary>;
}

export function buildReconciliationPrompt(request: ReconciliationRequest): ReconciliationPromptPayload {
  const schemaSummary = buildTemplateSchemaSummary();
  return {
    schemaSummary,
    system: [
      'You are the Template Import Reconciliation Engine.',
      'You are a controlled middleware step, not a renderer and not a creative design generator.',
      'Your only job is to reconcile deterministic extraction + visual analysis into strict TemplateImportPlan JSON.',
      'The editor and PDF renderer are deterministic and own final rendering.',
    ].join('\n'),
    user: JSON.stringify({
      instructions: schemaSummary.hardRules,
      importAsset: request.importAsset,
      manifests: request.manifests,
      vision: request.vision ?? [],
      constraints: request.constraints ?? {},
      requiredOutput: 'TemplateImportPlan JSON only',
    }),
  };
}
