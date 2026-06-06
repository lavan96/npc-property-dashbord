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
  const lastSyncedSigRef = useRef<string>('');

  const sigOf = (ov: Overlay[]) => JSON.stringify(ov);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      const initial = page.blocks.flatMap((b) => b.overlays);
      overlaysRef.current = initial;
      syncOverlaysToEditor(editor, initial, { width: page.size.width ?? 595, height: page.size.height ?? 842 });
      lastPageIdRef.current = page.id;
      lastSyncedSigRef.current = sigOf(initial);
      try { editor.zoomToFit({ animation: { duration: 0 } }); } catch { /* noop */ }

      // Selection listener
      editor.store.listen(
        () => { onSelectOverlay(getSelectedOverlayId(editor)); },
        { source: 'user', scope: 'session' },
      );

      // Document change listener (debounced write-back, user-driven only)
      editor.store.listen(
        () => {
          if (pendingWriteRef.current) window.clearTimeout(pendingWriteRef.current);
          pendingWriteRef.current = window.setTimeout(() => {
            const next = readShapesBackToOverlays(editor, overlaysRef.current);
            const nextSig = sigOf(next);
            if (nextSig !== sigOf(overlaysRef.current)) {
              overlaysRef.current = next;
              lastSyncedSigRef.current = nextSig;
              onOverlaysChange(next);
            }
          }, 250);
        },
        { source: 'user', scope: 'document' },
      );
    },
    [onOverlaysChange, onSelectOverlay, page.id, page.size],
  );

  // Re-sync the editor whenever the page or its overlays change externally
  // (page swap OR setTemplate from Design Agent / AI Author / programmatic edits).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const overlays = page.blocks.flatMap((b) => b.overlays);
    const pageChanged = lastPageIdRef.current !== page.id;
    const sig = sigOf(overlays);
    const overlaysChanged = sig !== lastSyncedSigRef.current;
    if (!pageChanged && !overlaysChanged) return;

    overlaysRef.current = overlays;
    syncOverlaysToEditor(editor, overlays, { width: page.size.width ?? 595, height: page.size.height ?? 842 });
    lastSyncedSigRef.current = sig;
    if (pageChanged) {
      lastPageIdRef.current = page.id;
      try { editor.zoomToFit({ animation: { duration: 0 } }); } catch { /* noop */ }
    }
  }, [page]);

  return (
    <div className="absolute inset-0">
      <Tldraw onMount={handleMount} hideUi={false} />
    </div>
  );
}
