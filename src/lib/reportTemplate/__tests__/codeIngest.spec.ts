/**
 * Raw-codebase ingestion orchestrator contract (plan WS1 §3.2).
 *
 * Locks `renderAndGroundCode`: input validation, the render-source call shape,
 * error propagation, data:URL normalisation, and grounding wire-through — all via
 * a stubbed invoke (no Supabase, no browser).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderAndGroundCode, type InvokeFn } from '../ingestion/codeIngest';
import type { DomBoxTree } from '../codeGrounding';

const BOX_TREE: DomBoxTree = {
  pageWidthPx: 1280,
  pageHeightPx: 1600,
  textBoxes: [{ text: 'Headline', x: 100, y: 100, width: 300, height: 50, fontSizePx: 40 }],
};

const ok = (data: any): InvokeFn => vi.fn().mockResolvedValue({ data, error: null });

describe('renderAndGroundCode', () => {
  it('requires a url or html', async () => {
    await expect(renderAndGroundCode({}, ok({}))).rejects.toThrow(/URL or HTML/);
  });

  it('calls render-source with the rendered input and grounds the box tree', async () => {
    const invoke = ok({ raster: 'AAAA', boxTree: BOX_TREE });
    const res = await renderAndGroundCode({ url: 'https://example.com' }, invoke);

    expect(invoke).toHaveBeenCalledWith('render-source', expect.objectContaining({
      url: 'https://example.com', width: 1280, height: 1600,
    }));
    expect(res.rasterDataUrl).toBe('data:image/png;base64,AAAA');
    expect(res.grounded.elements).toHaveLength(1);
    expect(res.grounded.elements[0].text).toBe('Headline');
    expect(res.pageWidth).toBe(res.grounded.pageWidth);
  });

  it('passes through an existing data: raster unchanged', async () => {
    const res = await renderAndGroundCode(
      { html: '<h1>Hi</h1>' },
      ok({ raster: 'data:image/png;base64,ZZZZ', boxTree: BOX_TREE }),
    );
    expect(res.rasterDataUrl).toBe('data:image/png;base64,ZZZZ');
  });

  it('propagates invoke errors', async () => {
    const invoke: InvokeFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'render-source not configured' } });
    await expect(renderAndGroundCode({ url: 'https://x' }, invoke)).rejects.toThrow(/not configured/);
  });

  it('propagates a data-level error', async () => {
    await expect(renderAndGroundCode({ url: 'https://x' }, ok({ error: 'boom' }))).rejects.toThrow(/boom/);
  });

  it('errors when the render is incomplete', async () => {
    await expect(renderAndGroundCode({ url: 'https://x' }, ok({ raster: 'AAAA' }))).rejects.toThrow(/no render/);
  });
});
