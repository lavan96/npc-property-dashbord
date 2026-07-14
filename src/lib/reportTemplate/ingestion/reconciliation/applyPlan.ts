import { parseTemplate, type Page, type ReportTemplate } from '../../templateSchema';
import type { TemplateImportPlan } from './types';

export interface ApplyImportPlanOptions {
  templateName?: string;
  baseTemplate?: ReportTemplate;
  activePageId?: string | null;
}

function freeBlockId(pageId: string): string {
  return `${pageId}_free`;
}

function importMeta(plan: TemplateImportPlan, title?: string, baseMeta?: ReportTemplate['meta']): ReportTemplate['meta'] {
  return {
    ...(baseMeta ?? {}),
    ...(title ? { title } : {}),
    creator: 'template-import-reconciliation-engine',
    subject: `Import ${plan.importId} · ${plan.importSummary.visualFidelityMode} · confidence ${Math.round(plan.confidenceScore * 100)}%`,
    keywords: [
      'template-import',
      plan.importSummary.visualFidelityMode,
      `${plan.importSummary.editableElementsCreated}-editable-elements`,
    ].join(', '),
  };
}

function planPageToTemplatePage(page: TemplateImportPlan['pages'][number], plan: TemplateImportPlan, override?: Pick<Page, 'id' | 'name'>): Page {
  const pageId = override?.id ?? page.id;
  return {
    id: pageId,
    name: override?.name ?? page.name,
    size: { width: page.width, height: page.height },
    background: {
      ...(page.background.color ? { color: page.background.color } : {}),
      imageUrl: page.background.imageUrl,
      ...(page.background.imageFit ? { imageFit: page.background.imageFit } : {}),
      ...(page.background.opacity !== undefined ? { opacity: page.background.opacity } : {}),
      ...(page.background.underlay !== undefined ? { underlay: page.background.underlay } : {}),
    },
    blocks: [{
      id: freeBlockId(pageId),
      type: 'free',
      props: {},
      overlays: page.overlays,
      locked: false,
      name: 'Editable import overlays',
    }],
    notes: [
      `Imported by Template Import Reconciliation Engine (${plan.importSummary.visualFidelityMode}).`,
      `Source page: ${page.sourcePageId}.`,
      `Warnings: ${page.warnings.length}.`,
    ].join(' '),
  };
}

/** Convert a validated TemplateImportPlan into the editor's deterministic schema. */
export function applyTemplateImportPlan(
  plan: TemplateImportPlan,
  options: ApplyImportPlanOptions = {},
): ReportTemplate {
  const importedPages = plan.pages.map((page) => planPageToTemplatePage(page, plan));

  if (options.baseTemplate?.pages?.length && options.activePageId && plan.pages.length === 1) {
    return parseTemplate({
      ...options.baseTemplate,
      pages: options.baseTemplate.pages.map((page) => page.id === options.activePageId
        ? planPageToTemplatePage(plan.pages[0], plan, { id: page.id, name: page.name })
        : page),
      meta: importMeta(plan, options.baseTemplate.meta?.title, options.baseTemplate.meta),
    });
  }

  return parseTemplate({
    version: 1,
    tokens: options.baseTemplate?.tokens ?? { colors: {}, fonts: {}, spacing: {} },
    pages: importedPages,
    slots: options.baseTemplate?.slots ?? {},
    meta: importMeta(plan, options.templateName ?? options.baseTemplate?.meta?.title ?? 'Imported template', options.baseTemplate?.meta),
  });
}
