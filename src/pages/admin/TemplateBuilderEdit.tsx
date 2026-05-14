/**
 * Template Builder — Editor (Phase 2).
 *
 * Layout: [PagesPanel] [TemplateCanvas (tldraw)] [PropertiesInspector]
 *                                              + collapsible Live PDF preview
 *
 * The template JSON remains the single source of truth. The canvas only edits
 * overlays (position, size, text content); blocks and bindings are edited in
 * the inspector / page panel. Live PDF regenerates on a 500ms debounce.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Eye, Loader2, History, Code2, Layout, PanelRightOpen, PanelRightClose,
  Download, Copy as CopyIcon, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  useReportTemplate,
  useReportTemplateMutations,
  useReportTemplateVersions,
} from '@/hooks/useReportTemplates';
import {
  parseTemplate,
  type Block,
  type Overlay,
  type Page,
  type ReportTemplate,
  makeBlankTemplate,
} from '@/lib/reportTemplate/templateSchema';
import { renderTemplateToBlob } from '@/lib/reportTemplate/pdfRenderer';
import { preloadImages } from '@/lib/reportTemplate/imagePreloader';
import { collectTemplateIssues } from '@/lib/reportTemplate/bindingValidation';
import { TemplateCanvas } from '@/components/templateBuilder/TemplateCanvas';
import { PagesPanel } from '@/components/templateBuilder/PagesPanel';
import { PropertiesInspector } from '@/components/templateBuilder/PropertiesInspector';

const SAMPLE_DATA = {
  property: { address: '123 Sample Street, Sydney NSW 2000', suburb: 'Sydney', imageUrl: '' },
  financials: { weeklyRent: 850, purchasePrice: 950000 },
  client: { name: 'Sample Client' },
  tier: 'compass',
};

export default function TemplateBuilderEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tplRow, isLoading } = useReportTemplate(id);
  const { update, create } = useReportTemplateMutations();
  const { data: versions = [] } = useReportTemplateVersions(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState('');
  const [tier, setTier] = useState('');
  const [template, setTemplate] = useState<ReportTemplate>(makeBlankTemplate());
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Hydrate from server
  useEffect(() => {
    if (!tplRow) return;
    setName(tplRow.name || '');
    setDescription(tplRow.description || '');
    setReportType(tplRow.report_type || '');
    setTier(tplRow.tier || '');
    const parsed = parseTemplate(tplRow.schema);
    setTemplate(parsed);
    setActivePageId(parsed.pages[0]?.id ?? null);
  }, [tplRow]);

  const activePage = useMemo<Page | null>(
    () => template.pages.find((p) => p.id === activePageId) ?? null,
    [template, activePageId],
  );

  const selectedOverlay = useMemo<Overlay | null>(() => {
    if (!activePage || !selectedOverlayId) return null;
    for (const b of activePage.blocks) {
      const found = b.overlays.find((o) => o.id === selectedOverlayId);
      if (found) return found;
    }
    return null;
  }, [activePage, selectedOverlayId]);

  // ── Mutators ────────────────────────────────────────────────────────────────
  const updatePage = (next: Page) => {
    setTemplate((t) => ({ ...t, pages: t.pages.map((p) => (p.id === next.id ? next : p)) }));
  };
  const setActivePageOverlays = (overlays: Overlay[]) => {
    if (!activePage) return;
    // Distribute back into blocks by index, keeping per-block ordering.
    let cursor = 0;
    const nextBlocks = activePage.blocks.map((b) => {
      const slice = overlays.slice(cursor, cursor + b.overlays.length);
      cursor += b.overlays.length;
      return { ...b, overlays: slice };
    });
    updatePage({ ...activePage, blocks: nextBlocks });
  };
  const updateOverlay = (next: Overlay) => {
    if (!activePage) return;
    updatePage({
      ...activePage,
      blocks: activePage.blocks.map((b) => ({
        ...b,
        overlays: b.overlays.map((o) => (o.id === next.id ? next : o)),
      })),
    });
  };
  const deleteOverlay = (oid: string) => {
    if (!activePage) return;
    // Snapshot the page so the user can undo within a few seconds.
    const pageSnapshot: Page = JSON.parse(JSON.stringify(activePage));
    const pageId = activePage.id;
    updatePage({
      ...activePage,
      blocks: activePage.blocks.map((b) => ({
        ...b,
        overlays: b.overlays.filter((o) => o.id !== oid),
      })),
    });
    setSelectedOverlayId(null);
    toast('Overlay deleted', {
      description: 'You can restore it within 8 seconds.',
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          setTemplate((t) => ({
            ...t,
            pages: t.pages.map((p) => (p.id === pageId ? pageSnapshot : p)),
          }));
          setSelectedOverlayId(oid);
          toast.success('Overlay restored');
        },
      },
    });
  };
  const duplicateOverlay = (oid: string) => {
    if (!activePage) return;
    let newId: string | null = null;
    const blocks = activePage.blocks.map((b) => {
      const idx = b.overlays.findIndex((o) => o.id === oid);
      if (idx < 0) return b;
      const original = b.overlays[idx];
      const copy = JSON.parse(JSON.stringify(original));
      copy.id = crypto.randomUUID();
      copy.x = (original.x || 0) + 16;
      copy.y = (original.y || 0) + 16;
      newId = copy.id;
      const next = [...b.overlays];
      next.splice(idx + 1, 0, copy);
      return { ...b, overlays: next };
    });
    updatePage({ ...activePage, blocks });
    if (newId) setSelectedOverlayId(newId);
  };
  const addOverlayToActivePage = (overlay: Overlay) => {
    if (!activePage) return;
    const blocks = [...activePage.blocks];
    let target = blocks.find((b) => b.type === 'free');
    if (!target) {
      target = { id: crypto.randomUUID(), type: 'free', props: {}, overlays: [] };
      blocks.push(target);
    }
    target.overlays = [...target.overlays, overlay];
    updatePage({ ...activePage, blocks });
    setSelectedOverlayId(overlay.id);
  };
  const addBlockToActivePage = (block: Block) => {
    if (!activePage) return;
    updatePage({ ...activePage, blocks: [...activePage.blocks, block] });
    setSelectedBlockId(block.id);
    setSelectedOverlayId(null);
  };
  const updateBlock = (next: Block) => {
    if (!activePage) return;
    updatePage({
      ...activePage,
      blocks: activePage.blocks.map((b) => (b.id === next.id ? next : b)),
    });
  };
  const deleteBlock = (bid: string) => {
    if (!activePage) return;
    const snapshot: Page = JSON.parse(JSON.stringify(activePage));
    const pageId = activePage.id;
    updatePage({ ...activePage, blocks: activePage.blocks.filter((b) => b.id !== bid) });
    if (selectedBlockId === bid) setSelectedBlockId(null);
    toast('Block deleted', {
      description: 'You can restore it within 8 seconds.',
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          setTemplate((t) => ({
            ...t,
            pages: t.pages.map((p) => (p.id === pageId ? snapshot : p)),
          }));
          toast.success('Block restored');
        },
      },
    });
  };
  const duplicateBlock = (bid: string) => {
    if (!activePage) return;
    const idx = activePage.blocks.findIndex((b) => b.id === bid);
    if (idx < 0) return;
    const original = activePage.blocks[idx];
    const copy: Block = JSON.parse(JSON.stringify(original));
    copy.id = crypto.randomUUID();
    copy.overlays = copy.overlays.map((o) => ({ ...o, id: crypto.randomUUID() }));
    const next = [...activePage.blocks];
    next.splice(idx + 1, 0, copy);
    updatePage({ ...activePage, blocks: next });
    setSelectedBlockId(copy.id);
  };
  const moveBlock = (bid: string, dir: -1 | 1) => {
    if (!activePage) return;
    const idx = activePage.blocks.findIndex((b) => b.id === bid);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= activePage.blocks.length) return;
    const next = [...activePage.blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    updatePage({ ...activePage, blocks: next });
  };

  const addPage = () => {
    const p: Page = {
      id: crypto.randomUUID(),
      name: `Page ${template.pages.length + 1}`,
      size: { width: 595, height: 842 },
      background: {},
      blocks: [],
    };
    setTemplate((t) => ({ ...t, pages: [...t.pages, p] }));
    setActivePageId(p.id);
  };
  const duplicatePage = (pid: string) => {
    const idx = template.pages.findIndex((p) => p.id === pid);
    if (idx < 0) return;
    const original = template.pages[idx];
    const copy: Page = JSON.parse(JSON.stringify(original));
    copy.id = crypto.randomUUID();
    copy.name = `${original.name} copy`;
    copy.blocks = copy.blocks.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
      overlays: b.overlays.map((o) => ({ ...o, id: crypto.randomUUID() })),
    }));
    const next = [...template.pages];
    next.splice(idx + 1, 0, copy);
    setTemplate((t) => ({ ...t, pages: next }));
    setActivePageId(copy.id);
  };
  const deletePage = (pid: string) => {
    setTemplate((t) => ({ ...t, pages: t.pages.filter((p) => p.id !== pid) }));
    if (activePageId === pid) {
      const remaining = template.pages.filter((p) => p.id !== pid);
      setActivePageId(remaining[0]?.id ?? null);
    }
  };

  // ── Binding validation (live) ───────────────────────────────────────────────
  const bindingIssues = useMemo(() => collectTemplateIssues(template), [template]);

  // ── Live PDF preview ────────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showPreview) return;
    setPreviewing(true);
    setPreviewError(null);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const prepared = await preloadImages(template);
        if (cancelled) return;
        const blob = renderTemplateToBlob(prepared, { data: SAMPLE_DATA });
        const url = URL.createObjectURL(blob);
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = url;
        setPreviewUrl(url);
      } catch (e: any) {
        if (!cancelled) setPreviewError(e?.message ?? 'Render failed');
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [template, showPreview]);

  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = (snapshot = false) => {
    if (!id) return;
    update.mutate(
      {
        id,
        snapshot,
        patch: {
          name,
          description,
          report_type: reportType || null,
          tier: tier || null,
          schema: template,
        } as any,
      },
      { onSuccess: () => toast.success(snapshot ? 'Saved as new version' : 'Saved') },
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-6" />
        <Skeleton className="h-[80vh] w-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/template-builder')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-base font-semibold border-0 bg-transparent focus-visible:bg-muted/30 focus-visible:ring-1 max-w-xs"
            placeholder="Template name"
          />
        </div>
        <div className="flex items-center gap-2">
          {bindingIssues.length > 0 ? (
            <span
              className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30"
              title={bindingIssues.map((i) => `${i.where}: ${i.message}`).join('\n')}
            >
              ⚠ {bindingIssues.length} binding {bindingIssues.length === 1 ? 'issue' : 'issues'}
            </span>
          ) : (
            <span className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 text-success border border-success/30">
              <CheckCircle2 className="h-2.5 w-2.5" /> Bindings OK
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
                toast.success('Template JSON copied');
              } catch { toast.error('Copy failed'); }
            }}
          >
            <CopyIcon className="h-4 w-4 mr-1" /> Copy JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!previewUrl}
            onClick={() => {
              if (!previewUrl) return;
              const a = document.createElement('a');
              a.href = previewUrl;
              a.download = `${name || 'template'}.pdf`;
              a.click();
            }}
          >
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? <PanelRightClose className="h-4 w-4 mr-1" /> : <PanelRightOpen className="h-4 w-4 mr-1" />}
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={update.isPending}>
            <History className="h-4 w-4 mr-1" /> Save version
          </Button>
          <Button size="sm" onClick={() => handleSave(false)} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visual" className="flex-1 flex flex-col min-h-0">
        <TabsList className="self-start mx-3 mt-2">
          <TabsTrigger value="visual"><Layout className="h-3.5 w-3.5 mr-1" /> Visual</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="json"><Code2 className="h-3.5 w-3.5 mr-1" /> JSON</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
        </TabsList>

        {/* Visual editor */}
        <TabsContent value="visual" className="flex-1 min-h-0 mt-2">
          <div
            className="grid h-full gap-0"
            style={{
              gridTemplateColumns: showPreview
                ? '220px minmax(0, 1fr) 320px 360px'
                : '220px minmax(0, 1fr) 320px',
            }}
          >
            <PagesPanel
              template={template}
              activePageId={activePageId}
              onSelectPage={(pid) => { setActivePageId(pid); setSelectedOverlayId(null); setSelectedBlockId(null); }}
              onAddPage={addPage}
              onDuplicatePage={duplicatePage}
              onDeletePage={deletePage}
              onAddBlock={addBlockToActivePage}
              onAddOverlay={addOverlayToActivePage}
            />

            <div className="relative bg-muted/30 min-h-0">
              {activePage ? (
                <TemplateCanvas
                  key={activePage.id}
                  page={activePage}
                  onOverlaysChange={setActivePageOverlays}
                  onSelectOverlay={(oid) => { setSelectedOverlayId(oid); if (oid) setSelectedBlockId(null); }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No page selected. Add one from the left rail.
                </div>
              )}
            </div>

            <div className="border-l bg-background min-h-0">
              <PropertiesInspector
                template={template}
                templateId={id}
                page={activePage}
                overlay={selectedOverlay}
                selectedBlockId={selectedBlockId}
                onUpdateOverlay={updateOverlay}
                onDeleteOverlay={deleteOverlay}
                onDuplicateOverlay={duplicateOverlay}
                onUpdatePage={updatePage}
                onSelectBlock={setSelectedBlockId}
                onUpdateBlock={updateBlock}
                onDeleteBlock={deleteBlock}
                onDuplicateBlock={duplicateBlock}
                onMoveBlock={moveBlock}
              />
            </div>

            {showPreview && (
              <div className="border-l bg-background flex flex-col min-h-0">
                <div className="px-3 py-2 border-b flex items-center gap-2 text-xs">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">PDF preview</span>
                  {previewing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex-1 p-2">
                  {previewError ? (
                    <div className="h-full flex items-center justify-center text-xs text-destructive border-2 border-dashed border-destructive/30 rounded-md p-3 text-center">
                      {previewError}
                    </div>
                  ) : previewUrl ? (
                    <iframe
                      key={previewUrl}
                      src={previewUrl}
                      title="PDF preview"
                      className="w-full h-full rounded-md bg-white"
                    />
                  ) : (
                    <Skeleton className="w-full h-full" />
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Metadata */}
        <TabsContent value="settings" className="px-6 py-4 max-w-3xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Report type</Label>
              <Input value={reportType} onChange={(e) => setReportType(e.target.value)} placeholder="e.g. investment" />
            </div>
            <div>
              <Label className="text-xs">Tier</Label>
              <Input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="e.g. compass" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
        </TabsContent>

        {/* Raw JSON fallback (still editable) */}
        <TabsContent value="json" className="flex-1 min-h-0 px-3 pb-3">
          <Textarea
            value={JSON.stringify(template, null, 2)}
            onChange={(e) => {
              try {
                setTemplate(parseTemplate(JSON.parse(e.target.value)));
              } catch { /* keep typing */ }
            }}
            spellCheck={false}
            className="font-mono text-xs h-[80vh] resize-none"
          />
        </TabsContent>

        {/* Version history */}
        <TabsContent value="versions" className="px-4 py-4 max-w-2xl">
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No saved versions yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v, i) => {
                const parsed = parseTemplate(v.schema);
                const pageCount = parsed.pages.length;
                const blockCount = parsed.pages.reduce((a, p) => a + p.blocks.length, 0);
                const overlayCount = parsed.pages.reduce(
                  (a, p) => a + p.blocks.reduce((b, x) => b + x.overlays.length, 0), 0);
                const prev = versions[i + 1] ? parseTemplate(versions[i + 1].schema) : null;
                const prevBlocks = prev ? prev.pages.reduce((a, p) => a + p.blocks.length, 0) : null;
                const blockDiff = prevBlocks != null ? blockCount - prevBlocks : null;
                return (
                <li key={v.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm gap-2">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      v{v.version}
                      {blockDiff != null && blockDiff !== 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${blockDiff > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                          {blockDiff > 0 ? '+' : ''}{blockDiff} blocks
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('en-AU')}
                      {v.note && ` — ${v.note}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {pageCount} page{pageCount === 1 ? '' : 's'} · {blockCount} block{blockCount === 1 ? '' : 's'} · {overlayCount} overlay{overlayCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTemplate(parseTemplate(v.schema));
                        toast.info(`Loaded v${v.version} into editor. Click Save to apply.`);
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!id || update.isPending}
                      onClick={() => {
                        if (!id) return;
                        if (!confirm(`Restore v${v.version}? This will overwrite the current template (a snapshot of the current version is saved first).`)) return;
                        const restored = parseTemplate(v.schema);
                        setTemplate(restored);
                        update.mutate(
                          { id, snapshot: true, note: `Restored from v${v.version}`, patch: { schema: restored } as any },
                          { onSuccess: () => toast.success(`Restored v${v.version}`) },
                        );
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={create.isPending}
                      onClick={() => {
                        const cloned = parseTemplate(v.schema);
                        create.mutate(
                          {
                            name: `${name || 'Template'} — v${v.version} clone`,
                            description: `Cloned from v${v.version}`,
                            report_type: reportType || null,
                            tier: tier || null,
                            schema: cloned,
                          } as any,
                          {
                            onSuccess: (row: any) => {
                              if (row?.id) navigate(`/admin/template-builder/${row.id}`);
                            },
                          },
                        );
                      }}
                    >
                      Clone as new
                    </Button>
                  </div>
                </li>
                </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
