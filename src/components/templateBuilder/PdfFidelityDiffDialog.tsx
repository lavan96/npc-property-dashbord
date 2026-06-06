/**
 * PdfFidelityDiffDialog — side-by-side fidelity comparison.
 *
 * The designer uploads the original source PDF. We rasterise both:
 *   - Left  : the uploaded PDF page (pdfjs render at 144 DPI)
 *   - Right : the current template rendered via `renderTemplateToHtml`,
 *             snapshotted page-by-page with html2canvas.
 *
 * Pages can be flipped through with a slider; an optional "difference" toggle
 * overlays the right pane with `mix-blend-mode: difference` so visual deltas
 * pop instantly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Loader2, FileText, GitCompareArrows } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import { renderTemplateToHtml } from '@/lib/reportTemplate/htmlRenderer';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: ReportTemplate;
  sampleData: Record<string, any>;
  customCss?: string;
}

export function PdfFidelityDiffDialog({ open, onOpenChange, template, sampleData, customCss }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);  // data URLs (source)
  const [htmlPages, setHtmlPages] = useState<string[]>([]); // data URLs (rendered template)
  const [pageIndex, setPageIndex] = useState(0);
  const [diffMode, setDiffMode] = useState(false);
  const [opacity, setOpacity] = useState(100);

  const reset = () => { setPdfPages([]); setHtmlPages([]); setPageIndex(0); setDiffMode(false); setOpacity(100); };

  useEffect(() => { if (!open) reset(); }, [open]);

  const rasterizeTemplate = useCallback(async (): Promise<string[]> => {
    const { default: html2canvas } = await import('html2canvas');
    const { html } = renderTemplateToHtml(template, { data: sampleData, title: 'Diff', customCss });
    // Render in a hidden offscreen iframe so screen styles don't bleed.
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-100000px';
    iframe.style.top = '0';
    iframe.style.width = '900px';
    iframe.style.height = '1200px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    // Allow images/fonts to settle
    await new Promise((r) => setTimeout(r, 800));
    const pages = Array.from(doc.querySelectorAll<HTMLElement>('[data-page-id], .pdf-page, .page'));
    const targets = pages.length > 0 ? pages : Array.from(doc.body.children) as HTMLElement[];
    const out: string[] = [];
    for (const el of targets) {
      try {
        const canvas = await html2canvas(el, { useCORS: true, backgroundColor: '#ffffff', scale: 1.5 });
        out.push(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        console.warn('[diff] page raster failed', err);
      }
    }
    document.body.removeChild(iframe);
    return out;
  }, [template, sampleData, customCss]);

  const onFile = useCallback(async (f: File | null) => {
    if (!f || !/\.pdf$/i.test(f.name)) { toast.error('Choose a PDF.'); return; }
    setBusy(true);
    const t = toast.loading('Reading PDF…');
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf, useSystemFonts: true }).promise;
      const sourceImgs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        toast.loading(`Rasterising source page ${i}/${pdf.numPages}…`, { id: t });
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp } as any).promise;
        sourceImgs.push(canvas.toDataURL('image/jpeg', 0.85));
        canvas.width = 0; canvas.height = 0;
      }
      setPdfPages(sourceImgs);

      toast.loading('Rendering current template…', { id: t });
      const tplImgs = await rasterizeTemplate();
      setHtmlPages(tplImgs);
      toast.success('Comparison ready', { id: t });
    } catch (err) {
      toast.error(`Diff failed: ${(err as Error).message}`, { id: t });
    } finally {
      setBusy(false);
    }
  }, [rasterizeTemplate]);

  const total = Math.max(pdfPages.length, htmlPages.length);
  const left = pdfPages[pageIndex];
  const right = htmlPages[pageIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" /> Side-by-side fidelity diff
          </DialogTitle>
          <DialogDescription>
            Compare the source PDF against the current template render to spot drift.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6 py-3 flex flex-col gap-3">
          {total === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="m-auto w-full max-w-md border-2 border-dashed rounded-lg p-10 text-center hover:border-primary/50 transition-colors disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-10 w-10 mx-auto animate-spin text-muted-foreground mb-2" />
                    : <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />}
              <div className="text-sm text-muted-foreground">
                {busy ? 'Working…' : 'Drop or select the source PDF to compare'}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Page</Label>
                  <div className="w-48"><Slider min={0} max={Math.max(0, total - 1)} step={1} value={[pageIndex]} onValueChange={(v) => setPageIndex(v[0] ?? 0)} /></div>
                  <span className="text-xs font-mono">{pageIndex + 1} / {total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="diff" className="text-xs">Difference overlay</Label>
                  <Switch id="diff" checked={diffMode} onCheckedChange={setDiffMode} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Right pane opacity</Label>
                  <div className="w-32"><Slider min={0} max={100} step={1} value={[opacity]} onValueChange={(v) => setOpacity(v[0] ?? 100)} /></div>
                  <span className="text-xs font-mono w-10 text-right">{opacity}%</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Replace source…</Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
                <Card className="overflow-auto p-2 bg-muted/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Source PDF</div>
                  {left ? <img src={left} className="w-full h-auto block" alt="source" /> : <div className="text-xs text-muted-foreground p-4">No page</div>}
                </Card>
                <Card className="overflow-auto p-2 bg-muted/30 relative">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Template render</div>
                  {right ? (
                    <img
                      src={right}
                      className="w-full h-auto block"
                      alt="render"
                      style={{
                        opacity: opacity / 100,
                        mixBlendMode: diffMode ? 'difference' as any : 'normal',
                      }}
                    />
                  ) : <div className="text-xs text-muted-foreground p-4">No render for this page</div>}
                </Card>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 pb-6 pt-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
