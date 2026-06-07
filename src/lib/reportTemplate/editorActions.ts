/**
 * Pure, side-effect-free editor actions for the Template Builder (Phase 4.2).
 *
 * These mirror the schema transformations that used to live inline in
 * `TemplateBuilderEdit.tsx`. Extracting them makes page/block/overlay editing
 * unit-testable without rendering the 3k-line editor, while the page keeps
 * ownership of React state, selection, undo history and toasts.
 *
 * Conventions:
 *   - Functions are pure: `(value, …args) => newValue`. They never mutate input.
 *   - New ids come from an injectable `makeId` (defaults to `crypto.randomUUID`)
 *     so tests can be deterministic.
 *   - No-op move/reorder operations return the SAME reference, so callers can
 *     skip a history entry via `if (next !== prev) commit(next)`.
 */
import { type ReportTemplate, type Page, type Block, type Overlay } from './templateSchema';

const defaultMakeId = (): string => crypto.randomUUID();

// ─── Template-scoped page operations ────────────────────────────────────────

/** Replace a page in the template, matched by id. */
export function replacePage(template: ReportTemplate, page: Page): ReportTemplate {
  return { ...template, pages: template.pages.map((p) => (p.id === page.id ? page : p)) };
}

/** Build a blank A4 page. `pageCount` is the current page count (for naming). */
export function makeNewPage(pageCount: number, makeId: () => string = defaultMakeId): Page {
  return {
    id: makeId(),
    name: `Page ${pageCount + 1}`,
    size: { width: 595, height: 842 },
    background: {},
    blocks: [],
  } as Page;
}

export function appendPage(template: ReportTemplate, page: Page): ReportTemplate {
  return { ...template, pages: [...template.pages, page] };
}

/**
 * Deep-clone a page (re-assigning fresh ids to the page, its blocks and their
 * overlays) and splice it directly after the original. Returns the new pages
 * array plus the new page id, or `null` if the page id was not found.
 */
export function duplicatePage(
  template: ReportTemplate,
  pageId: string,
  makeId: () => string = defaultMakeId,
): { pages: Page[]; newPageId: string } | null {
  const idx = template.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return null;
  const original = template.pages[idx];
  const copy: Page = JSON.parse(JSON.stringify(original));
  copy.id = makeId();
  copy.name = `${original.name} copy`;
  copy.blocks = copy.blocks.map((b) => ({
    ...b,
    id: makeId(),
    overlays: b.overlays.map((o) => ({ ...o, id: makeId() })),
  }));
  const pages = [...template.pages];
  pages.splice(idx + 1, 0, copy);
  return { pages, newPageId: copy.id };
}

export function removePage(template: ReportTemplate, pageId: string): ReportTemplate {
  return { ...template, pages: template.pages.filter((p) => p.id !== pageId) };
}

/** Swap a page with its neighbour. Returns the same reference if out of range. */
export function movePage(template: ReportTemplate, pageId: string, dir: -1 | 1): ReportTemplate {
  const idx = template.pages.findIndex((p) => p.id === pageId);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= template.pages.length) return template;
  const pages = [...template.pages];
  [pages[idx], pages[j]] = [pages[j], pages[idx]];
  return { ...template, pages };
}

// ─── Page-scoped block operations ───────────────────────────────────────────

export function appendBlock(page: Page, block: Block): Page {
  return { ...page, blocks: [...page.blocks, block] };
}

export function updateBlock(page: Page, block: Block): Page {
  return { ...page, blocks: page.blocks.map((b) => (b.id === block.id ? block : b)) };
}

export function removeBlock(page: Page, blockId: string): Page {
  return { ...page, blocks: page.blocks.filter((b) => b.id !== blockId) };
}

/**
 * Deep-clone a block (with fresh overlay ids) and splice it directly after the
 * original. Returns the new page + new block id, or `null` if not found.
 */
export function duplicateBlock(
  page: Page,
  blockId: string,
  makeId: () => string = defaultMakeId,
): { page: Page; newBlockId: string } | null {
  const idx = page.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return null;
  const original = page.blocks[idx];
  const copy: Block = JSON.parse(JSON.stringify(original));
  copy.id = makeId();
  copy.overlays = copy.overlays.map((o) => ({ ...o, id: makeId() }));
  const blocks = [...page.blocks];
  blocks.splice(idx + 1, 0, copy);
  return { page: { ...page, blocks }, newBlockId: copy.id };
}

/** Swap a block with its neighbour. Returns the same reference if out of range. */
export function moveBlock(page: Page, blockId: string, dir: -1 | 1): Page {
  const idx = page.blocks.findIndex((b) => b.id === blockId);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= page.blocks.length) return page;
  const blocks = [...page.blocks];
  [blocks[idx], blocks[j]] = [blocks[j], blocks[idx]];
  return { ...page, blocks };
}

/** Move a block from one index to another. Returns the same reference on no-op. */
export function reorderBlocks(page: Page, from: number, to: number): Page {
  if (from === to || from < 0 || to < 0) return page;
  if (from >= page.blocks.length || to >= page.blocks.length) return page;
  const blocks = [...page.blocks];
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...page, blocks };
}

// ─── Page-scoped overlay operations ─────────────────────────────────────────

/**
 * Append an overlay to the page's `free` block, creating one if none exists.
 * (Overlays are anchored to a free-form block in the editor model.)
 */
export function addOverlay(page: Page, overlay: Overlay, makeId: () => string = defaultMakeId): Page {
  const targetIdx = page.blocks.findIndex((b) => b.type === 'free');
  if (targetIdx < 0) {
    const freeBlock: Block = { id: makeId(), type: 'free', props: {}, overlays: [overlay] } as Block;
    return { ...page, blocks: [...page.blocks, freeBlock] };
  }
  const blocks = page.blocks.map((b, i) =>
    i === targetIdx ? { ...b, overlays: [...b.overlays, overlay] } : b,
  );
  return { ...page, blocks };
}

export function updateOverlay(page: Page, overlay: Overlay): Page {
  return {
    ...page,
    blocks: page.blocks.map((b) => ({
      ...b,
      overlays: b.overlays.map((o) => (o.id === overlay.id ? overlay : o)),
    })),
  };
}

export function removeOverlay(page: Page, overlayId: string): Page {
  return {
    ...page,
    blocks: page.blocks.map((b) => ({
      ...b,
      overlays: b.overlays.filter((o) => o.id !== overlayId),
    })),
  };
}

/**
 * Deep-clone an overlay, offset it by (16, 16) and splice it directly after the
 * original within its block. `newOverlayId` is `null` when the overlay id was
 * not found (the returned page is structurally unchanged in that case).
 */
export function duplicateOverlay(
  page: Page,
  overlayId: string,
  makeId: () => string = defaultMakeId,
): { page: Page; newOverlayId: string | null } {
  let newOverlayId: string | null = null;
  const blocks = page.blocks.map((b) => {
    const idx = b.overlays.findIndex((o) => o.id === overlayId);
    if (idx < 0) return b;
    const original = b.overlays[idx];
    const copy: Overlay = JSON.parse(JSON.stringify(original));
    copy.id = makeId();
    copy.x = (original.x || 0) + 16;
    copy.y = (original.y || 0) + 16;
    newOverlayId = copy.id;
    const overlays = [...b.overlays];
    overlays.splice(idx + 1, 0, copy);
    return { ...b, overlays };
  });
  return { page: { ...page, blocks }, newOverlayId };
}

/**
 * Distribute a flat overlay list back into the page's blocks, preserving each
 * block's overlay count and ordering. Used by bulk overlay editing.
 */
export function distributeOverlays(page: Page, overlays: Overlay[]): Page {
  let cursor = 0;
  const blocks = page.blocks.map((b) => {
    const slice = overlays.slice(cursor, cursor + b.overlays.length);
    cursor += b.overlays.length;
    return { ...b, overlays: slice };
  });
  return { ...page, blocks };
}
