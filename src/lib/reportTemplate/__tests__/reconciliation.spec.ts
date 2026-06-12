import { describe, expect, it } from 'vitest';
import {
  applyTemplateImportPlan,
  buildBackgroundFirstImportPlan,
  buildRawImportManifest,
  createImageImportAsset,
  extractPaletteFromPixels,
  groundedReferenceToRawBlocks,
  sampleBackgroundColorFromPixels,
  validateTemplateImportPlan,
  buildReconciliationPrompt,
  BackgroundFirstReconciliationClient,
  applyTemplateImportPatches,
  buildHybridImportPlanFromManifests,
  parseTemplateImportPlanResponse,
} from '../ingestion/reconciliation';
import type { GroundedReference } from '../imageGrounding';
import { parseTemplate } from '../templateSchema';

const DATA_URL = 'data:image/png;base64,AAAA';

describe('Template Import Reconciliation Engine foundation', () => {
  it('creates a deterministic background-first plan and applies it as a ReportTemplate', () => {
    const asset = createImageImportAsset({
      dataUrl: DATA_URL,
      imageWidth: 800,
      imageHeight: 600,
      fileName: 'cover.png',
      fileId: 'asset_cover',
      backgroundColor: '#101820',
    });

    const plan = buildBackgroundFirstImportPlan(asset, { importId: 'import_cover' });
    const validation = validateTemplateImportPlan(plan);
    const template = applyTemplateImportPlan(plan, { templateName: 'Imported Cover' });

    expect(validation.ok).toBe(true);
    expect(plan.importSummary.visualFidelityMode).toBe('background-first');
    expect(plan.importSummary.editableElementsCreated).toBe(0);
    expect(template.pages).toHaveLength(1);
    expect(template.pages[0].background.imageUrl).toBe(DATA_URL);
    expect(template.pages[0].background.color).toBe('#101820');
    expect(template.pages[0].blocks[0].type).toBe('free');
    expect(template.pages[0].blocks[0].overlays).toHaveLength(0);
    expect(template.meta?.title).toBe('Imported Cover');
    expect(template.meta?.creator).toBe('template-import-reconciliation-engine');
    expect(template.meta?.subject).toMatch(/background-first/);
  });

  it('preserves the active page id and name when applying a single-page plan into an existing template', () => {
    const base = parseTemplate({
      version: 1,
      tokens: { colors: {}, fonts: {}, spacing: {} },
      pages: [
        { id: 'cover', name: 'Existing Cover', size: { width: 595, height: 842 }, background: {}, blocks: [] },
        { id: 'appendix', name: 'Appendix', size: { width: 595, height: 842 }, background: {}, blocks: [] },
      ],
      slots: {},
    });
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 800, imageHeight: 600, fileId: 'asset_apply' });
    const plan = buildBackgroundFirstImportPlan(asset);

    const template = applyTemplateImportPlan(plan, { baseTemplate: base, activePageId: 'cover' });

    expect(template.pages.map((p) => p.id)).toEqual(['cover', 'appendix']);
    expect(template.pages[0].name).toBe('Existing Cover');
    expect(template.pages[0].background.imageUrl).toBe(DATA_URL);
    expect(template.pages[1].background.imageUrl).toBeUndefined();
  });

  it('derives distinct stable image import asset ids when data URLs differ', () => {
    const a = createImageImportAsset({ dataUrl: 'data:image/png;base64,AAAA', imageWidth: 800, imageHeight: 600, fileName: 'same.png' });
    const b = createImageImportAsset({ dataUrl: 'data:image/png;base64,BBBB', imageWidth: 800, imageHeight: 600, fileName: 'same.png' });

    expect(a.fileId).not.toBe(b.fileId);
    expect(a.pages[0].id).not.toBe(b.pages[0].id);
  });

  it('rejects plans that do not preserve the reference background image', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 400, imageHeight: 400, fileId: 'asset_square' });
    const plan = buildBackgroundFirstImportPlan(asset);
    plan.pages[0].background.imageUrl = '';

    const validation = validateTemplateImportPlan(plan);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/reference background image/i);
  });

  it('builds a raw manifest from grounded OCR elements with source and confidence metadata', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 1000, imageHeight: 1414, fileId: 'asset_ocr' });
    const grounded: GroundedReference = {
      pageWidth: 595,
      pageHeight: 841,
      imageWidth: 1000,
      imageHeight: 1414,
      elements: [{ id: 'w1', text: 'Investment Property Report', x: 72, y: 120, width: 220, height: 32, confidence: 0.93 } as any],
    };

    const rawBlocks = groundedReferenceToRawBlocks(grounded);
    const manifest = buildRawImportManifest({ page: asset.pages[0], grounded, palette: ['#d6a84f'] });

    expect(rawBlocks).toHaveLength(1);
    expect(rawBlocks[0]).toMatchObject({ type: 'text', text: 'Investment Property Report', source: 'ocr', confidence: 0.93 });
    expect(manifest.extractionSummary.hasOcrTextLayer).toBe(true);
    expect(manifest.extractionSummary.textBlockCount).toBe(1);
    expect(manifest.palette).toEqual(['#d6a84f']);
  });

  it('samples palette and background colors deterministically from RGBA pixels', () => {
    // 3x3 image with navy edges/corners and a gold centre accent.
    const px = new Uint8ClampedArray([
      16, 24, 32, 255, 16, 24, 32, 255, 16, 24, 32, 255,
      16, 24, 32, 255, 214, 168, 79, 255, 16, 24, 32, 255,
      16, 24, 32, 255, 16, 24, 32, 255, 16, 24, 32, 255,
    ]);

    expect(sampleBackgroundColorFromPixels({ data: px, width: 3, height: 3 })).toBe('#101820');
    expect(extractPaletteFromPixels({ data: px, width: 3, height: 3 }, 2)).toContain('#d6a84f');
  });

  it('builds a hybrid plan with editable OCR overlays while preserving the locked background', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 1000, imageHeight: 1414, fileId: 'asset_hybrid' });
    const manifest = buildRawImportManifest({
      page: asset.pages[0],
      rawBlocks: [
        {
          id: 'heading',
          type: 'text',
          text: 'Investment Property Report',
          bbox: { x: 72, y: 120, width: 260, height: 36 },
          style: { fontSize: 30, fontWeight: 700, color: '#d6a84f', textAlign: 'left' },
          confidence: 0.92,
          source: 'ocr',
        },
        {
          id: 'noisy',
          type: 'text',
          text: '???',
          bbox: { x: 10, y: 10, width: 30, height: 10 },
          confidence: 0.42,
          source: 'ocr',
        },
      ],
    });

    const plan = buildHybridImportPlanFromManifests(asset, [manifest]);
    const template = applyTemplateImportPlan(plan);
    const overlay: any = template.pages[0].blocks[0].overlays[0];

    expect(plan.importSummary.visualFidelityMode).toBe('hybrid');
    expect(plan.importSummary.editableElementsCreated).toBe(1);
    expect(plan.warnings.some((w) => w.code === 'low_confidence_text_skipped')).toBe(true);
    expect(template.pages[0].background.imageUrl).toBe(DATA_URL);
    expect(overlay.content).toBe('Investment Property Report');
    expect(overlay.locked).toBe(false);
    expect(overlay.color).toBe('#d6a84f');
  });

  it('builds a reconciliation prompt that forbids renderer ownership and HTML output', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 800, imageHeight: 600, fileId: 'asset_prompt' });
    const prompt = buildReconciliationPrompt({ importAsset: asset, manifests: [] });

    expect(prompt.system).toMatch(/not a renderer/i);
    expect(prompt.schemaSummary.hardRules.join(' ')).toMatch(/Do not output HTML/i);
    expect(prompt.user).toMatch(/TemplateImportPlan JSON only/);
  });

  it('parses fenced AI JSON only after validating the TemplateImportPlan contract', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 800, imageHeight: 600, fileId: 'asset_parse' });
    const plan = buildBackgroundFirstImportPlan(asset);
    const fenced = ['```json', JSON.stringify(plan), '```'].join('\n');
    const parsed = parseTemplateImportPlanResponse(fenced);

    expect(parsed.importId).toBe(plan.importId);
    expect(parsed.pages[0].background.imageUrl).toBe(DATA_URL);
    expect(() => parseTemplateImportPlanResponse('{"version":1,"pages":[],"warnings":[],"confidenceScore":1,"importSummary":{"visualFidelityMode":"hybrid","editableElementsCreated":0,"manualReviewRequired":false,"repairPassesApplied":0}}')).toThrow(/at least one page/i);
  });

  it('provides a deterministic background-first AI fallback client', async () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 800, imageHeight: 600, fileId: 'asset_fallback' });
    const client = new BackgroundFirstReconciliationClient();
    const plan = await client.reconcile({ importAsset: asset, manifests: [] });

    expect(plan.importSummary.visualFidelityMode).toBe('background-first');
    expect(plan.pages[0].background.imageUrl).toBe(DATA_URL);
  });

  it('applies bounded patch operations while rejecting background removal', () => {
    const asset = createImageImportAsset({ dataUrl: DATA_URL, imageWidth: 800, imageHeight: 600, fileId: 'asset_patch' });
    const plan = buildBackgroundFirstImportPlan(asset);
    plan.pages[0].overlays.push({
      id: 'heading_1',
      type: 'text',
      x: 40,
      y: 80,
      width: 240,
      height: 40,
      rotation: 0,
      opacity: 1,
      content: 'Original',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#111111',
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      confidence: 0.9,
    });
    const template = applyTemplateImportPlan(plan);
    const blockId = template.pages[0].blocks[0].id;

    const result = applyTemplateImportPatches(template, [
      { operation: 'updateOverlay', pageId: template.pages[0].id, blockId, overlayId: 'heading_1', changes: { y: 96, color: '#d6a84f' } as any },
      { operation: 'updatePageBackground', pageId: template.pages[0].id, changes: { imageUrl: '' } },
    ]);

    const overlay: any = result.template.pages[0].blocks[0].overlays[0];
    expect(result.applied).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(overlay.y).toBe(96);
    expect(overlay.color).toBe('#d6a84f');
    expect(result.template.pages[0].background.imageUrl).toBe(DATA_URL);
  });

});
