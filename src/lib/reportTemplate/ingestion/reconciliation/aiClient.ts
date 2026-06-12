import type { TemplateImportPatch, TemplateImportPlan, ReconciliationRequest } from './types';
import { buildBackgroundFirstImportPlan } from './planBuilder';
import { assertValidTemplateImportPlan } from './validatePlan';

export interface RepairRequest {
  plan: TemplateImportPlan;
  diffReport: unknown;
  maxOperations?: number;
}

export interface ReconciliationAiClient {
  reconcile(input: ReconciliationRequest): Promise<TemplateImportPlan>;
  repair(input: RepairRequest): Promise<TemplateImportPatch[]>;
}

/**
 * Deterministic local client used as a safe fallback and in tests. It encodes
 * the architectural guarantee that an import can always open as a background-
 * first template even when an AI provider is unavailable or returns bad JSON.
 */
export class BackgroundFirstReconciliationClient implements ReconciliationAiClient {
  async reconcile(input: ReconciliationRequest): Promise<TemplateImportPlan> {
    return assertValidTemplateImportPlan(buildBackgroundFirstImportPlan(input.importAsset, { importId: input.importAsset.fileId }));
  }

  async repair(): Promise<TemplateImportPatch[]> {
    return [];
  }
}
