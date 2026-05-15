/**
 * Print-safety linter for ReportTemplate.
 *
 * Surfaces issues that would break the printed PDF:
 *   - bleed: overlay extends outside page bounds
 *   - missing-font: fontFamily not in jsPDF's bundled set
 *   - low-contrast: text color vs page background luminance ratio < 4.5
 *   - missing-slot: slot block references a slotKey that doesn't exist
 *
 * This complements `bindingValidation.ts` (which catches data-binding typos).
 */
import type { ReportTemplate } from './templateSchema';

export type LintSeverity = 'warning' | 'error';

export interface LintIssue {
  severity: LintSeverity;
  code: 'bleed' | 'missing-font' | 'low-contrast' | 'missing-slot' | 'tiny-text' | 'overlap-edge';
  message: string;
  where: string;
  pageId?: string;
  blockId?: string;
  overlayId?: string;
}

const JSPDF_FONTS = new Set(['helvetica', 'times', 'courier']);

function looksLikeBinding(s: unknown): boolean {
  return typeof s === 'string' && /\{\{|^token:/.test(s);
}

function parseHex(input: unknown): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function lintTemplate(template: ReportTemplate): LintIssue[] {
  const issues: LintIssue[] = [];
  const slotKeys = new Set(Object.keys(template.slots ?? {}));

  template.pages.forEach((page, pi) => {
    const pageW = page.size?.width ?? 595;
    const pageH = page.size?.height ?? 842;
    const pageBg = parseHex(page.background?.color) ?? { r: 255, g: 255, b: 255 };

    page.blocks.forEach((block, bi) => {
      // Slot reference integrity
      if (block.type === 'slot') {
        const key = String(block.props?.slotKey ?? '');
        if (key && !slotKeys.has(key) && !looksLikeBinding(key)) {
          issues.push({
            severity: 'error',
            code: 'missing-slot',
            message: `Slot "${key}" is not defined`,
            where: `Page ${pi + 1} → block ${bi + 1}`,
            pageId: page.id,
            blockId: block.id,
          });
        }
      }

      block.overlays.forEach((o, oi) => {
        const tag = `Page ${pi + 1} → block ${bi + 1} → overlay ${oi + 1}`;
        const ctx = { pageId: page.id, blockId: block.id, overlayId: o.id };

        // Bleed: any side outside [0, pageSize]
        if (o.x < 0 || o.y < 0 || o.x + o.width > pageW || o.y + o.height > pageH) {
          issues.push({
            severity: 'warning',
            code: 'bleed',
            message: `Overlay extends outside page bounds (${pageW}×${pageH}pt)`,
            where: tag,
            ...ctx,
          });
        }
        // Tight to edge (< 12pt margin) — gentle hint
        if (o.x >= 0 && o.x < 12) {
          issues.push({
            severity: 'warning',
            code: 'overlap-edge',
            message: 'Overlay sits within 12pt of the left edge — increase margin for print safety',
            where: tag,
            ...ctx,
          });
        }

        if (o.type === 'text') {
          // Missing font (jsPDF only bundles Helvetica/Times/Courier)
          if (typeof o.fontFamily === 'string' && !looksLikeBinding(o.fontFamily)) {
            const f = o.fontFamily.toLowerCase();
            const mapped = f.includes('times') || f.includes('courier') || f.includes('mono') || f.includes('helvetica') || f.includes('arial') || f.includes('sans');
            if (!mapped && !JSPDF_FONTS.has(f)) {
              issues.push({
                severity: 'warning',
                code: 'missing-font',
                message: `Font "${o.fontFamily}" is not bundled with jsPDF — will fall back to Helvetica`,
                where: tag,
                ...ctx,
              });
            }
          }
          // Tiny text
          if (typeof o.fontSize === 'number' && o.fontSize < 7) {
            issues.push({
              severity: 'warning',
              code: 'tiny-text',
              message: `Font size ${o.fontSize}pt may be unreadable — minimum 7pt recommended`,
              where: tag,
              ...ctx,
            });
          }
          // Contrast vs page background
          const fg = parseHex(o.color);
          if (fg) {
            const ratio = contrastRatio(fg, pageBg);
            if (ratio < 4.5) {
              issues.push({
                severity: 'warning',
                code: 'low-contrast',
                message: `Text contrast is ${ratio.toFixed(2)}:1 — WCAG AA needs 4.5:1`,
                where: tag,
                ...ctx,
              });
            }
          }
        }
      });
    });
  });

  return issues;
}
