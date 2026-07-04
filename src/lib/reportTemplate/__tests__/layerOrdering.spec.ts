import { describe, expect, it } from 'vitest';
import {
  getLayerRank,
  inferBlockLayerKind,
  sortBlocksForRender,
  type RenderLayerKind,
} from '../rendering/layerOrdering';

describe('layerOrdering', () => {
  it('ranks layer kinds bottom → top', () => {
    expect(getLayerRank('page_background')).toBeLessThan(getLayerRank('source_raster'));
    expect(getLayerRank('source_raster')).toBeLessThan(getLayerRank('image'));
    expect(getLayerRank('image')).toBeLessThan(getLayerRank('shape'));
    expect(getLayerRank('shape')).toBeLessThan(getLayerRank('table'));
    expect(getLayerRank('table')).toBeLessThan(getLayerRank('text'));
    expect(getLayerRank('text')).toBeLessThan(getLayerRank('editor_control'));
  });

  it('keeps unknown below text and editor controls', () => {
    expect(getLayerRank('unknown')).toBeLessThan(getLayerRank('text'));
    expect(getLayerRank('unknown')).toBeLessThan(getLayerRank('editor_control'));
  });

  it('infers kind from block type', () => {
    expect(inferBlockLayerKind({ type: 'text' })).toBe('text');
    expect(inferBlockLayerKind({ type: 'textOnPath' })).toBe('text');
    expect(inferBlockLayerKind({ type: 'image' })).toBe('image');
    expect(inferBlockLayerKind({ type: 'shape' })).toBe('shape');
    expect(inferBlockLayerKind({ type: 'table' })).toBe('table');
    expect(inferBlockLayerKind({ type: 'background' })).toBe('page_background');
  });

  it('detects source rasters structurally and via explicit hints', () => {
    expect(inferBlockLayerKind({ sourceRasterRef: { kind: 'pdf_import_raster_ref' } })).toBe('source_raster');
    expect(inferBlockLayerKind({ isSourceRaster: true })).toBe('source_raster');
    expect(inferBlockLayerKind({ layerKind: 'editor_control' })).toBe('editor_control');
  });

  it('defaults to unknown for unrecognised or malformed input', () => {
    expect(inferBlockLayerKind({ type: 'mystery' })).toBe('unknown');
    expect(inferBlockLayerKind(null)).toBe('unknown');
    expect(inferBlockLayerKind(42)).toBe('unknown');
    expect(inferBlockLayerKind({})).toBe('unknown');
  });

  it('stable-sorts blocks into render order without reshuffling equal ranks', () => {
    const blocks = [
      { id: 'text-a', type: 'text' },
      { id: 'bg', type: 'background' },
      { id: 'img', type: 'image' },
      { id: 'text-b', type: 'text' },
      { id: 'raster', sourceRasterRef: {} },
    ];
    const sorted = sortBlocksForRender(blocks).map((b) => (b as { id: string }).id);
    expect(sorted).toEqual(['bg', 'raster', 'img', 'text-a', 'text-b']);
  });

  it('does not mutate the input array', () => {
    const blocks = [{ type: 'text' }, { type: 'image' }];
    const copy = [...blocks];
    sortBlocksForRender(blocks);
    expect(blocks).toEqual(copy);
  });

  it('exposes a rank for every declared kind', () => {
    const kinds: RenderLayerKind[] = [
      'page_background', 'source_raster', 'image', 'shape', 'table', 'text', 'editor_control', 'unknown',
    ];
    for (const kind of kinds) expect(Number.isFinite(getLayerRank(kind))).toBe(true);
  });
});
