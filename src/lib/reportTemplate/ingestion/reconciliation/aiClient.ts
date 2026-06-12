import type { TemplateImportPatch, TemplateImportPlan, ReconciliationRequest } from './types';
import { buildBackgroundFirstImportPlan } from './planBuilder';
import { assertValidTemplateImportPlan } from './validatePlan';
import { buildReconciliationPrompt } from './prompt';
import { parseTemplateImportPlanResponse } from './responseParser';

export interface RepairRequest {
  plan: TemplateImportPlan;
  diffReport: unknown;
  maxOperations?: number;
}

export interface ReconciliationAiClient {
  reconcile(input: ReconciliationRequest): Promise<TemplateImportPlan>;
  repair(input: RepairRequest): Promise<TemplateImportPatch[]>;
}

export type ReconciliationInvoke = (
  name: string,
  body?: Record<string, unknown>,
  options?: { timeoutMs?: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

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

export class StaticPlanReconciliationClient implements ReconciliationAiClient {
  constructor(private readonly plan: TemplateImportPlan) {}

  async reconcile(): Promise<TemplateImportPlan> {
    return assertValidTemplateImportPlan(this.plan);
  }

  async repair(): Promise<TemplateImportPatch[]> {
    return [];
  }
}

function extractPlanCandidate(data: unknown): unknown {
  const d = data as any;
  return d?.templateImportPlan ?? d?.plan ?? d?.reconciliationPlan ?? d?.json ?? d?.text ?? d?.content ?? d;
}

function extractPatchesCandidate(data: unknown): unknown {
  const d = data as any;
  return d?.patches ?? d?.operations ?? d;
}

export class TemplateDesignAgentReconciliationClient implements ReconciliationAiClient {
  constructor(private readonly invoke: ReconciliationInvoke) {}

  async reconcile(input: ReconciliationRequest): Promise<TemplateImportPlan> {
    const prompt = buildReconciliationPrompt(input);
    const primaryImageDataUrl = input.importAsset.pages[0]?.referenceImageUrl;
    const { data, error } = await this.invoke('template-design-agent', {
      mode: 'layout_reconciliation',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      instruction: `${prompt.system}\n\n${prompt.user}`,
      schemaSummary: prompt.schemaSummary,
      importAsset: input.importAsset,
      manifests: input.manifests,
      vision: input.vision ?? [],
      constraints: input.constraints ?? {},
      existingTemplate: input.existingTemplate,
      imageDataUrl: primaryImageDataUrl,
    }, { timeoutMs: 180000 });

    if (error) throw new Error(error.message);
    return parseTemplateImportPlanResponse(extractPlanCandidate(data));
  }

  async repair(input: RepairRequest): Promise<TemplateImportPatch[]> {
    const { data, error } = await this.invoke('template-design-agent', {
      mode: 'layout_reconciliation_repair',
      plan: input.plan,
      diffReport: input.diffReport,
      maxOperations: input.maxOperations ?? 20,
      instruction: 'Return TemplateImportPatch[] JSON only. Do not rewrite the full template.',
    }, { timeoutMs: 120000 });
    if (error) throw new Error(error.message);
    const patches = extractPatchesCandidate(data);
    if (!Array.isArray(patches)) throw new Error('Repair response did not contain a patch array.');
    return patches as TemplateImportPatch[];
  }
}

export async function reconcileWithFallback(
  client: ReconciliationAiClient,
  request: ReconciliationRequest,
  fallbackPlan: TemplateImportPlan,
  onWarning?: (message: string) => void,
): Promise<TemplateImportPlan> {
  try {
    return assertValidTemplateImportPlan(await client.reconcile(request));
  } catch (error) {
    onWarning?.((error as Error)?.message ?? 'AI reconciliation failed.');
    return assertValidTemplateImportPlan(fallbackPlan);
  }
}
