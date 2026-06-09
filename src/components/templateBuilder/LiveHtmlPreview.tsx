/**
 * LiveHtmlPreview — real-time HTML render of the active template inside an
 * iframe. Bidirectional selection: clicking a block in the preview selects it
 * in the inspector, and selecting in the canvas scrolls + highlights it here.
 *
 * Uses srcdoc so we re-render on every template change without object URL
 * thrash. The injected runtime in `renderTemplateToHtml({ editorMode: true })`
 * posts `select` messages back via window.postMessage.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderTemplateToHtml } from '@/lib/reportTemplate/htmlRenderer';
import { makePreviewKey } from '@/lib/reportTemplate/previewCache';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import { Button } from '@/components/ui/button';
import { Eye, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface SelectPayload {
  blockId: string | null;
  pageId: string | null;
  pageIndex: number | null;
  blockType?: string | null;
}

interface Props {
  template: ReportTemplate;
  sampleData: Record<string, any>;
  customCss?: string;
  activePageId: string | null;
  selectedBlockId: string | null;
  onSelect: (payload: SelectPayload) => void;
  /** Show only the active page, or the whole document. */
  scope?: 'page' | 'document';
  onScopeChange?: (s: 'page' | 'document') => void;
}

export function LiveHtmlPreview({
  template,
  sampleData,
  customCss,
  activePageId,
  selectedBlockId,
  onSelect,
  scope = 'page',
  onScopeChange,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Optionally restrict render to active page only
  const visible = useMemo<ReportTemplate>(() => {
    if (scope === 'document') return template;
    const page = template.pages.find((p) => p.id === activePageId);
    if (!page) return template;
    return { ...template, pages: [page] };
  }, [template, scope, activePageId]);

  // Re-render only when the rendered *content* actually changes. `visible`,
  // `sampleData` and `customCss` change reference on every edit (even when their
  // bytes are identical — e.g. editing a different page), so keying on a content
  // signature avoids needless renderer runs and iframe srcDoc churn.
  const renderKey = useMemo(
    () => makePreviewKey(visible, sampleData, customCss),
    [visible, sampleData, customCss],
  );
  const html = useMemo(() => {
    try {
      const { html } = renderTemplateToHtml(visible, {
        data: sampleData,
        customCss,
        editorMode: true,
      });
      return html;
    } catch (e) {
      return `<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#b91c1c">Preview error: ${String((e as any)?.message ?? e)}</body></html>`;
    }
    // `visible`/`sampleData`/`customCss` are fully encoded in `renderKey`; depend
    // on it alone so identical content reuses the cached HTML string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  // Listen for selection messages from inside the iframe
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const m: any = ev.data;
      if (!m || m.source !== 'tpl-preview') return;
      if (m.type === 'ready') { setReady(true); return; }
      if (m.type === 'select') {
        onSelect({
          blockId: m.blockId ?? null,
          pageId: m.pageId ?? null,
          pageIndex: m.pageIndex ?? null,
          blockType: m.blockType ?? null,
        });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onSelect]);

  // Push selection highlight into the iframe
  useEffect(() => {
    if (!ready) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { source: 'tpl-preview-host', type: 'select', blockId: selectedBlockId, scroll: true },
      '*',
    );
  }, [selectedBlockId, ready, html]);

  // When iframe srcdoc replaced, ready resets
  useEffect(() => { setReady(false); }, [html]);

  return (
    <div className="flex flex-col h-full bg-muted/40">
      <div className="px-3 py-2 border-b flex items-center gap-2 text-xs bg-background">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Live preview</span>
        <div className="ml-2 flex items-center rounded border bg-muted/40">
          <button
            type="button"
            onClick={() => onScopeChange?.('page')}
            className={`px-2 py-0.5 text-[10px] ${scope === 'page' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            Page
          </button>
          <button
            type="button"
            onClick={() => onScopeChange?.('document')}
            className={`px-2 py-0.5 text-[10px] ${scope === 'document' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            All pages
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} title="Zoom out">
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-[10px] tabular-nums w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom((z) => Math.min(3, z + 0.1))} title="Zoom in">
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(1)} title="Reset zoom">
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            width: '100%',
            height: '100%',
          }}
        >
          <iframe
            ref={iframeRef}
            title="Live HTML preview"
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full bg-white border-0"
          />
        </div>
      </div>
      <div className="px-3 py-1 border-t bg-background text-[10px] text-muted-foreground flex items-center gap-2">
        <span>Click any block to select · hover to outline · changes appear instantly</span>
      </div>
    </div>
  );
}
