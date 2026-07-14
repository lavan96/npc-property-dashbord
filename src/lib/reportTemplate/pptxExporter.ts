/**
 * pptxExporter — converts each template page into a PPTX slide.
 * Overlays are positioned absolutely in inches (PDF points → inches at 72 dpi).
 * Text/image/shape overlays supported; complex blocks render as a flattened
 * background only for the cover page in this v1.
 */
import PptxGenJS from 'pptxgenjs';
import { parseTemplate, type ReportTemplate } from './templateSchema';
import {
  resolveBindable, resolveBindableNumber, resolveBindableColor, type ResolveContext,
} from './bindingResolver';

interface PptxOptions {
  data?: Record<string, any>;
  title?: string;
}

const PT_TO_IN = 1 / 72;
const hex = (c: string) => (c || '').replace('#', '').slice(0, 6) || '000000';

export async function exportTemplateAsPptxBlob(
  raw: ReportTemplate | unknown,
  opts: PptxOptions = {},
): Promise<Blob> {
  const tpl = parseTemplate(raw);
  const ctx: ResolveContext = { data: opts.data ?? {}, tokens: tpl.tokens };

  const pptx = new PptxGenJS();
  pptx.title = opts.title ?? 'Report';
  pptx.layout = 'CUSTOM';
  const first = tpl.pages[0];
  const w = (first?.size.width ?? 595) * PT_TO_IN;
  const h = (first?.size.height ?? 842) * PT_TO_IN;
  pptx.defineLayout({ name: 'TPL', width: w, height: h });
  pptx.layout = 'TPL';

  for (const page of tpl.pages) {
    const slide = pptx.addSlide();
    if (page.background?.color) {
      slide.background = { color: hex(resolveBindableColor(page.background.color, ctx, '#FFFFFF')) };
    }
    // Skip PDF-import reference underlays — they are editor-only alignment
    // aids; exporting them would double-render the page content.
    if (page.background?.imageUrl && !(page.background as any)?.underlay) {
      try {
        slide.addImage({
          data: String(page.background.imageUrl),
          x: 0, y: 0, w, h,
        } as any);
      } catch { /* ignore */ }
    }
    for (const block of page.blocks ?? []) {
      for (const ov of block.overlays ?? []) {
        const x = ov.x * PT_TO_IN;
        const y = ov.y * PT_TO_IN;
        const ow = (ov.width ?? 100) * PT_TO_IN;
        const oh = (ov.height ?? 40) * PT_TO_IN;
        if (ov.type === 'text') {
          const text = resolveBindable(ov.content, ctx);
          if (!text) continue;
          const size = Math.round(resolveBindableNumber(ov.fontSize, ctx, 12));
          const color = hex(resolveBindableColor(ov.color, ctx, '#000000'));
          slide.addText(String(text), {
            x, y, w: ow, h: oh,
            fontSize: size,
            color,
            bold: ov.fontWeight === 'bold',
            align: (ov.align as any) ?? 'left',
            valign: 'top',
            fontFace: resolveBindable(ov.fontFamily, ctx) || 'Helvetica',
          });
        } else if (ov.type === 'image') {
          const src = resolveBindable(ov.src, ctx);
          if (!src) continue;
          try { slide.addImage({ data: src, x, y, w: ow, h: oh } as any); } catch { /* ignore */ }
        } else if (ov.type === 'shape') {
          const fill = ov.fill ? hex(resolveBindableColor(ov.fill, ctx, '#000000')) : undefined;
          const line = ov.stroke ? { color: hex(resolveBindableColor(ov.stroke, ctx, '#000000')), width: ov.strokeWidth || 1 } : undefined;
          slide.addShape(
            ov.shape === 'ellipse' ? pptx.ShapeType.ellipse :
            ov.shape === 'line'    ? pptx.ShapeType.line    : pptx.ShapeType.rect,
            { x, y, w: ow, h: oh, fill: fill ? { color: fill } : undefined, line: line as any },
          );
        }
      }
    }
  }

  // pptxgenjs returns a Promise<Blob> when writing in browser
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export async function downloadTemplateAsPptx(
  template: ReportTemplate,
  filename: string,
  opts: PptxOptions = {},
): Promise<void> {
  const blob = await exportTemplateAsPptxBlob(template, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pptx') ? filename : `${filename}.pptx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
