/**
 * TemplateCanvas — embeds tldraw and binds it to a single template Page.
 *
 * Props:
 *   page         the active Page from the template schema
 *   onPageChange called when the canvas mutates overlays (move/resize/edit)
 *   onSelect     called with the currently-selected overlay id (or null)
 *
 * The page background is rendered as a locked dashed rectangle so designers
 * see the actual PDF page bounds inside the infinite tldraw canvas.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import type { Page, Overlay } from '@/lib/reportTemplate/templateSchema';
import {
  syncOverlaysToEditor,
  readShapesBackToOverlays,
  getSelectedOverlayId,
} from '@/lib/reportTemplate/canvasSync';

interface Props {
  page: Page;
  onOverlaysChange: (overlays: Overlay[]) => void;
  onSelectOverlay: (overlayId: string | null) => void;
}

export function TemplateCanvas({ page, onOverlaysChange, onSelectOverlay }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const lastPageIdRef = useRef<string | null>(null);
  const pendingWriteRef = useRef<number | null>(null);
  const overlaysRef = useRef<Overlay[]>(page.blocks.flatMap((b) => b.overlays));

  // Recompute the flat overlay list when the page changes (block ordering preserved by index).
  useEffect(() => {
    overlaysRef.current = page.blocks.flatMap((b) => b.overlays);
  }, [page]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      // Initial sync
      syncOverlaysToEditor(editor, overlaysRef.current, { width: page.size.width ?? 595, height: page.size.height ?? 842 });
      lastPageIdRef.current = page.id;
      // Centre the page on screen
      try {
        editor.zoomToFit({ animation: { duration: 0 } });
      } catch { /* noop */ }

      // Selection listener
      editor.store.listen(
        () => {
          onSelectOverlay(getSelectedOverlayId(editor));
        },
        { source: 'user', scope: 'session' },
      );

      // Document change listener (debounced write-back)
      editor.store.listen(
        () => {
          if (pendingWriteRef.current) window.clearTimeout(pendingWriteRef.current);
          pendingWriteRef.current = window.setTimeout(() => {
            const next = readShapesBackToOverlays(editor, overlaysRef.current);
            // Only emit if something actually changed
            if (JSON.stringify(next) !== JSON.stringify(overlaysRef.current)) {
              overlaysRef.current = next;
              onOverlaysChange(next);
            }
          }, 250);
        },
        { source: 'user', scope: 'document' },
      );
    },
    [onOverlaysChange, onSelectOverlay, page.id, page.size],
  );

  // When the active page changes (different page id), re-sync.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (lastPageIdRef.current !== page.id) {
      syncOverlaysToEditor(editor, overlaysRef.current, { width: page.size.width ?? 595, height: page.size.height ?? 842 });
      lastPageIdRef.current = page.id;
      try {
        editor.zoomToFit({ animation: { duration: 0 } });
      } catch { /* noop */ }
    }
  }, [page.id, page.size]);

  return (
    <div className="absolute inset-0">
      <Tldraw onMount={handleMount} hideUi={false} />
    </div>
  );
}
