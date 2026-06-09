/**
 * Build the data + tokens context used by `resolveBindable` and
 * `evalConditional` when rendering a template against a real report.
 *
 * Phase 7 moved report-specific data loading into adapters. This module keeps
 * the historical investment-report helper name as a backwards-compatible shim.
 */
import { investmentReportAdapter } from '@/lib/reportTemplate/adapters/investmentReportAdapter';
import type { TemplateBindingContext } from '@/lib/reportTemplate/adapters/types';
export type { TemplateBindingContext } from '@/lib/reportTemplate/adapters/types';

export async function buildTemplateBindingContext(
  reportId: string,
  brand?: { tokens?: any; logoUrl?: string | null } | null,
): Promise<TemplateBindingContext | null> {
  return investmentReportAdapter.buildBindingContext({ reportId, brand });
}
