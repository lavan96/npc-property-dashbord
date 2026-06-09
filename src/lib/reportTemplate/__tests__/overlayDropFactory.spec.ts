import { describe, it, expect, beforeEach } from 'vitest';
import {
  screenToPagePoint,
  makeOverlayForKind,
  draggableKindForOverlayType,
} from '../overlayDropFactory';

let n = 0;
const makeId = () => `id${++n}`;

describe('screenToPagePoint', () => {
  const rect = { left: 100, top: 50 };

  it('subtracts the stage origin and divides by zoom', () => {
    expect(screenToPagePoint({ clientX: 160, clientY: 110, rect, zoom: 1 })).toEqual({ x: 60, y: 60 });
    expect(screenToPagePoint({ clientX: 200, clientY: 150, rect, zoom: 2 })).toEqual({ x: 50, y: 50 });
  });

  it('clamps to the page origin and rounds', () => {
    expect(screenToPagePoint({ clientX: 0, clientY: 0, rect, zoom: 1 })).toEqual({ x: 0, y: 0 });
    expect(screenToPagePoint({ clientX: 101.4, clientY: 50.6, rect, zoom: 1 })).toEqual({ x: 1, y: 1 });
  });

  it('treats a zero/undefined zoom as 1', () => {
    expect(screenToPagePoint({ clientX: 160, clientY: 110, rect, zoom: 0 })).toEqual({ x: 60, y: 60 });
  });
});

describe('draggableKindForOverlayType', () => {
  it('maps palette overlay types to draggable kinds', () => {
    expect(draggableKindForOverlayType('text')).toBe('text');
    expect(draggableKindForOverlayType('shape')).toBe('rect');
    expect(draggableKindForOverlayType('image')).toBe('image');
  });
  it('returns null for non-draggable / unknown types', () => {
    expect(draggableKindForOverlayType('table')).toBeNull();
    expect(draggableKindForOverlayType('textOnPath')).toBeNull();
    expect(draggableKindForOverlayType(undefined)).toBeNull();
  });
});

describe('makeOverlayForKind', () => {
  beforeEach(() => { n = 0; });

  it('centres a text overlay on the drop point with palette defaults', () => {
    const o = makeOverlayForKind('text', { x: 200, y: 120 }, makeId) as any;
    expect(o.type).toBe('text');
    expect(o.content).toBe('New text'); // uses schema field `content`, not `text`
    expect(o.width).toBe(300);
    expect(o.height).toBe(40);
    expect(o.x).toBe(50); // 200 - 300/2
    expect(o.y).toBe(100); // 120 - 40/2
    expect(o.id).toBe('id1');
  });

  it('builds a rectangle shape overlay', () => {
    const o = makeOverlayForKind('rect', { x: 100, y: 100 }, makeId) as any;
    expect(o.type).toBe('shape');
    expect(o.shape).toBe('rect');
    expect(o.fill).toBe('token:primary');
    expect(o.x).toBe(0); // clamped: 100 - 200/2 = 0
  });

  it('builds an image overlay', () => {
    const o = makeOverlayForKind('image', { x: 300, y: 300 }, makeId) as any;
    expect(o.type).toBe('image');
    expect(o.fit).toBe('cover');
    expect(o.width).toBe(200);
    expect(o.height).toBe(140);
  });
});
