import { describe, expect, it } from 'vitest';
import {
  buildBackgroundFirstImportPlan,
  buildVisualDiffRepairReportFromRgba,
  createImageImportAsset,
} from '../ingestion/reconciliation';

const hasBrowserCanvas = typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';

describe.skipIf(!hasBrowserCanvas)('Template import reconciliation browser E2E', () => {
  it('captures real canvas pixels and produces a visual-diff repair report', () => {
    const width = 8;
    const height = 8;
    const sourceCanvas = document.createElement('canvas');
    const renderedCanvas = document.createElement('canvas');
    sourceCanvas.width = renderedCanvas.width = width;
    sourceCanvas.height = renderedCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    const renderedCtx = renderedCanvas.getContext('2d');
    expect(sourceCtx).toBeTruthy();
    expect(renderedCtx).toBeTruthy();
    if (!sourceCtx || !renderedCtx) throw new Error('2D canvas context unavailable.');

    sourceCtx.fillStyle = '#102030';
    sourceCtx.fillRect(0, 0, width, height);
    renderedCtx.fillStyle = '#102030';
    renderedCtx.fillRect(0, 0, width, height);
    renderedCtx.fillStyle = '#ffffff';
    renderedCtx.fillRect(4, 4, 4, 4);

    const asset = createImageImportAsset({
      dataUrl: sourceCanvas.toDataURL('image/png'),
      imageWidth: width,
      imageHeight: height,
      fileId: 'browser_e2e_asset',
    });
    const plan = buildBackgroundFirstImportPlan(asset);
    const report = buildVisualDiffRepairReportFromRgba({
      plan,
      pageId: plan.pages[0].id,
      sourceRgba: sourceCtx.getImageData(0, 0, width, height).data,
      renderedRgba: renderedCtx.getImageData(0, 0, width, height).data,
      width,
      height,
      fidelityOptions: { rows: 2, cols: 2 },
    });

    expect(report.pageId).toBe(plan.pages[0].id);
    expect(report.diffScore).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.issue.includes('visual delta'))).toBe(true);
  });
});
