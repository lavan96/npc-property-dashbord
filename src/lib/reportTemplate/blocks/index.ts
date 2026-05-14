/**
 * Block registry: each block type knows how to draw itself with jsPDF.
 *
 * To add a new block type:
 *   1. Create a new file in this folder exporting a `BlockRenderer`.
 *   2. Register it in BLOCK_RENDERERS below.
 *   3. (Phase 2+) Add an editor preview component in the editor's block library.
 */
import type { jsPDF } from 'jspdf';
import type { Block } from '../templateSchema';
import type { ResolveContext } from '../bindingResolver';
import { drawDisclaimerBlock } from './disclaimer';

export interface BlockRenderContext extends ResolveContext {
  doc: jsPDF;
  page: { width: number; height: number };
}

export type BlockRenderer = (block: Block, ctx: BlockRenderContext) => void;

export const BLOCK_RENDERERS: Record<string, BlockRenderer> = {
  disclaimer: drawDisclaimerBlock,
  // 'hero':       drawHeroBlock,        // Phase 3
  // 'kpi-grid':   drawKpiGridBlock,
  // 'data-table': drawDataTableBlock,
  // 'free':       () => {},             // overlays-only
};

export function getBlockRenderer(type: string): BlockRenderer | null {
  return BLOCK_RENDERERS[type] ?? null;
}
