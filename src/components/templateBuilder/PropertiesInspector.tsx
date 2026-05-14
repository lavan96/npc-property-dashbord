/**
 * PropertiesInspector — right rail. Edits the currently-selected overlay,
 * or page-level settings if none is selected.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Sparkles, Copy, Upload, Loader2, AlertTriangle, X, Maximize2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';
import type { Overlay, Page, ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import {
  buildSuggestions,
  validateBindable,
  type BindingIssue,
} from '@/lib/reportTemplate/bindingValidation';
import { secureStorageUpload } from '@/hooks/useSecureStorage';

interface Props {
  template: ReportTemplate;
  templateId?: string;
  page: Page | null;
  overlay: Overlay | null;
  onUpdateOverlay: (next: Overlay) => void;
  onDeleteOverlay: (id: string) => void;
  onDuplicateOverlay: (id: string) => void;
  onUpdatePage: (next: Page) => void;
}

export function PropertiesInspector({
  template,
  templateId,
  page,
  overlay,
  onUpdateOverlay,
  onDeleteOverlay,
  onDuplicateOverlay,
  onUpdatePage,
}: Props) {
  if (!overlay && !page) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an element on the canvas to edit its properties.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        {overlay ? (
          <OverlayEditor
            template={template}
            templateId={templateId}
            overlay={overlay}
            onChange={onUpdateOverlay}
            onDelete={() => onDeleteOverlay(overlay.id)}
            onDuplicate={() => onDuplicateOverlay(overlay.id)}
          />
        ) : (
          page && <PageEditor template={template} page={page} onChange={onUpdatePage} />
        )}
      </div>
    </ScrollArea>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OverlayEditor({
  template,
  templateId,
  overlay,
  onChange,
  onDelete,
  onDuplicate,
}: {
  template: ReportTemplate;
  templateId?: string;
  overlay: Overlay;
  onChange: (n: Overlay) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const patch = (p: Partial<Overlay>) => onChange({ ...overlay, ...(p as any) });
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold capitalize">{overlay.type} overlay</h3>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{overlay.id}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDuplicate} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setShowDelete(true)} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete overlay?</AlertDialogTitle>
            <AlertDialogDescription>
              This overlay will be removed from the page. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDelete(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setShowDelete(false); onDelete(); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Position / size */}
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={overlay.x} onChange={(v) => patch({ x: v })} />
        <NumField label="Y" value={overlay.y} onChange={(v) => patch({ y: v })} />
        <NumField label="W" value={overlay.width} onChange={(v) => patch({ width: v })} />
        <NumField label="H" value={overlay.height} onChange={(v) => patch({ height: v })} />
        <NumField label="Rotation" value={overlay.rotation || 0} onChange={(v) => patch({ rotation: v })} />
        <NumField
          label="Opacity"
          value={overlay.opacity ?? 1}
          step={0.05}
          min={0}
          max={1}
          onChange={(v) => patch({ opacity: v })}
        />
      </div>

      <Separator />

      {/* Type-specific */}
      {overlay.type === 'text' && (
        <div className="space-y-3">
          <BindableField
            label="Content"
            value={String(overlay.content ?? '')}
            onChange={(v) => patch({ content: v } as any)}
            template={template}
            multiline
          />
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Size (pt)"
              value={Number(overlay.fontSize) || 12}
              onChange={(v) => patch({ fontSize: v } as any)}
            />
            <div>
              <Label className="text-xs">Weight</Label>
              <Select value={overlay.fontWeight} onValueChange={(v) => patch({ fontWeight: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Align</Label>
              <Select value={overlay.align} onValueChange={(v) => patch({ align: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Family</Label>
              <Select
                value={String(overlay.fontFamily || 'Helvetica')}
                onValueChange={(v) => patch({ fontFamily: v } as any)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Helvetica">Helvetica</SelectItem>
                  <SelectItem value="Times">Times</SelectItem>
                  <SelectItem value="Courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ColorField
            label="Color"
            value={String(overlay.color || '#000000')}
            template={template}
            onChange={(v) => patch({ color: v } as any)}
          />
        </div>
      )}

      {overlay.type === 'shape' && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Shape</Label>
            <Select value={overlay.shape} onValueChange={(v) => patch({ shape: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rect">Rectangle</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
                <SelectItem value="line">Line</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ColorField label="Fill" template={template} value={String(overlay.fill || '')} allowEmpty onChange={(v) => patch({ fill: v || undefined } as any)} />
          <ColorField label="Stroke" template={template} value={String(overlay.stroke || '')} allowEmpty onChange={(v) => patch({ stroke: v || undefined } as any)} />
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Stroke W" value={overlay.strokeWidth || 0} onChange={(v) => patch({ strokeWidth: v } as any)} />
            <NumField label="Radius" value={overlay.borderRadius || 0} onChange={(v) => patch({ borderRadius: v } as any)} />
          </div>
        </div>
      )}

      {overlay.type === 'image' && (
        <div className="space-y-3">
          <BindableField
            label="Source (URL or binding)"
            value={String(overlay.src ?? '')}
            onChange={(v) => patch({ src: v } as any)}
            template={template}
          />
          <ImageUploadField
            templateId={templateId}
            overlay={overlay}
            onPatch={(p) => onChange({ ...overlay, ...(p as any) })}
          />
          <div>
            <Label className="text-xs">Fit</Label>
            <Select value={overlay.fit} onValueChange={(v) => patch({ fit: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover (crop to fill)</SelectItem>
                <SelectItem value="contain">Contain (letterbox)</SelectItem>
                <SelectItem value="fill">Fill (stretch)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CropControls
            crop={(overlay as any).crop}
            onChange={(c) => patch({ crop: c } as any)}
          />
        </div>
      )}

      <Separator />
      <div>
        <Label className="text-xs">Conditional (e.g. <code>tier === 'compass'</code>)</Label>
        <Input
          value={overlay.conditional ?? ''}
          onChange={(e) => patch({ conditional: e.target.value || undefined } as any)}
          placeholder="Always shown if blank"
          className="text-xs font-mono"
        />
      </div>
    </div>
  );
}

function PageEditor({
  template,
  page,
  onChange,
}: {
  template: ReportTemplate;
  page: Page;
  onChange: (n: Page) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Page settings</h3>
      <div>
        <Label className="text-xs">Name</Label>
        <Input value={page.name} onChange={(e) => onChange({ ...page, name: e.target.value })} className="text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Width" value={page.size.width} onChange={(v) => onChange({ ...page, size: { ...page.size, width: v } })} />
        <NumField label="Height" value={page.size.height} onChange={(v) => onChange({ ...page, size: { ...page.size, height: v } })} />
      </div>
      <ColorField
        label="Background"
        template={template}
        value={page.background?.color || ''}
        allowEmpty
        onChange={(v) => onChange({ ...page, background: { ...(page.background || {}), color: v || undefined } })}
      />
      <div>
        <Label className="text-xs">Conditional</Label>
        <Input
          value={page.conditional ?? ''}
          onChange={(e) => onChange({ ...page, conditional: e.target.value || undefined })}
          className="text-xs font-mono"
        />
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function NumField({
  label, value, onChange, step = 1, min, max,
}: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}

function ColorField({
  label, value, onChange, allowEmpty, template,
}: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean; template: ReportTemplate }) {
  const isHex = value?.startsWith('#');
  const issues = validateBindable(value, template);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        {isHex && (
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 rounded cursor-pointer bg-transparent border"
          />
        )}
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowEmpty ? 'none / #hex / token:primary' : '#hex or token:primary'}
          className={`h-8 text-xs font-mono ${issues.length ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      </div>
      <BindingIssues issues={issues} />
    </div>
  );
}

/**
 * Reusable bindable text input with validation chip + autocomplete popover.
 */
function BindableField({
  label,
  value,
  onChange,
  template,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  template: ReportTemplate;
  multiline?: boolean;
}) {
  const issues = useMemo(() => validateBindable(value, template), [value, template]);
  const invalid = issues.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <BindingPicker template={template} onPick={(b) => onChange(`${value || ''}${b}`)} />
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={`font-mono text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`text-xs ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      )}
      <BindingIssues issues={issues} />
    </div>
  );
}

function BindingIssues({ issues }: { issues: BindingIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, idx) => (
        <li key={idx} className="text-[10px] text-destructive flex items-start gap-1">
          <AlertTriangle className="h-2.5 w-2.5 mt-[2px] flex-shrink-0" />
          <span className="font-mono">{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

function BindingPicker({
  template,
  onPick,
}: {
  template: ReportTemplate;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => buildSuggestions(template), [template]);

  const groups = useMemo(() => {
    const g: Record<string, typeof suggestions> = {};
    for (const s of suggestions) (g[s.group] ||= []).push(s);
    return g;
  }, [suggestions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary inline-flex items-center gap-1"
          type="button"
        >
          <Sparkles className="h-2.5 w-2.5" /> Insert binding
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="end">
        <Command>
          <CommandInput placeholder="Search bindings…" className="h-9" />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            {Object.entries(groups).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((s) => (
                  <CommandItem
                    key={s.label}
                    value={`${s.group} ${s.label} ${s.detail ?? ''}`}
                    onSelect={() => {
                      onPick(s.insert);
                      setOpen(false);
                    }}
                    className="text-xs font-mono"
                  >
                    <span className="flex-1">{s.label}</span>
                    {s.detail && <span className="text-[10px] text-muted-foreground ml-2">{s.detail}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ImageWarning {
  level: 'warning' | 'info';
  message: string;
}

type ImageOverlay = Overlay & { src?: string; fit?: 'cover' | 'contain' | 'fill' };

function ImageUploadField({
  templateId,
  overlay,
  onPatch,
}: {
  templateId?: string;
  overlay: ImageOverlay;
  onPatch: (p: Partial<ImageOverlay>) => void;
}) {
  const overlayId = overlay.id;
  const currentSrc = String(overlay.src ?? '');
  const overlayWidthPt = overlay.width;
  const overlayHeightPt = overlay.height;
  const fit = overlay.fit ?? 'cover';

  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [warnings, setWarnings] = useState<ImageWarning[]>([]);
  const [imgDims, setImgDims] = useState<{ width: number; height: number } | null>(null);
  const [autoMatch, setAutoMatch] = useState<boolean>(() => {
    try { return localStorage.getItem('tb.autoMatchAspect') === '1'; } catch { return false; }
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? '';

  const toggleAutoMatch = (next: boolean) => {
    setAutoMatch(next);
    try { localStorage.setItem('tb.autoMatchAspect', next ? '1' : '0'); } catch { /* noop */ }
  };

  const hasImage = !!currentSrc && /^https?:\/\//i.test(currentSrc);

  // Load intrinsic dims of currentSrc for the live preview / fit ratio chips.
  useEffect(() => {
    if (!hasImage) { setImgDims(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setImgDims({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { if (alive) setImgDims(null); };
    img.src = currentSrc;
    return () => { alive = false; };
  }, [currentSrc, hasImage]);

  /** Read intrinsic image dimensions client-side. */
  const readImageDims = (file: File): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const dims = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(dims);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image dimensions'));
      };
      img.src = url;
    });

  const checkDimensions = (px: { width: number; height: number }): ImageWarning[] => {
    const issues: ImageWarning[] = [];
    const minPxW = Math.round(overlayWidthPt);
    const minPxH = Math.round(overlayHeightPt);
    if (px.width < minPxW || px.height < minPxH) {
      issues.push({
        level: 'warning',
        message: `Image is ${px.width}×${px.height}px — smaller than the overlay (${minPxW}×${minPxH}pt) and will look blurry.`,
      });
    }
    const overlayRatio = overlayWidthPt / Math.max(overlayHeightPt, 1);
    const imageRatio = px.width / Math.max(px.height, 1);
    const drift = Math.abs(overlayRatio - imageRatio) / overlayRatio;
    if (drift > 0.15) {
      issues.push({
        level: 'warning',
        message: `Aspect ratio mismatch — image ${imageRatio.toFixed(2)}:1 vs overlay ${overlayRatio.toFixed(2)}:1.`,
      });
    }
    return issues;
  };

  /** Show an "Undo" sonner that restores the previous src. */
  const offerUndo = (prevSrc: string, label: string) => {
    if (!prevSrc) return;
    toast(label, {
      duration: 7000,
      action: {
        label: 'Undo',
        onClick: () => {
          onPatch({ src: prevSrc } as Partial<ImageOverlay>);
          toast.success('Image restored');
        },
      },
    });
  };

  const performUpload = async (file: File) => {
    const prevSrc = currentSrc;
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const folder = templateId ?? 'unassigned';
      const path = `${folder}/${overlayId}-${Date.now()}.${ext}`;
      const result = await secureStorageUpload('report-templates', path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (!result.success) {
        toast.error(`Upload failed: ${result.error ?? 'unknown error'}`);
        return;
      }
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/report-templates/${result.path ?? path}`;

      // Optionally compute fresh aspect ratio and apply it together with src.
      let nextPatch: Partial<ImageOverlay> = { src: publicUrl } as Partial<ImageOverlay>;
      if (autoMatch) {
        try {
          const dims = await readImageDims(file);
          const ratio = dims.width / Math.max(dims.height, 1);
          (nextPatch as any).height = Math.round((overlayWidthPt / ratio) * 100) / 100;
        } catch { /* ignore — keep current height */ }
      }
      onPatch(nextPatch);

      if (prevSrc && /^https?:\/\//i.test(prevSrc)) {
        offerUndo(prevSrc, autoMatch ? 'Image replaced & overlay resized' : 'Image replaced');
      } else {
        toast.success(autoMatch ? 'Image uploaded & overlay resized' : 'Image uploaded');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!supported.includes(file.type)) {
      toast.error('Unsupported format. Use PNG, JPEG, WEBP or GIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    let dimWarnings: ImageWarning[] = [];
    try {
      const dims = await readImageDims(file);
      dimWarnings = checkDimensions(dims);
    } catch {
      dimWarnings = [{ level: 'warning', message: 'Could not read image dimensions.' }];
    }
    setWarnings(dimWarnings);

    if (hasImage) {
      setPendingFile(file);
      setConfirmReplaceOpen(true);
      return;
    }
    await performUpload(file);
  };

  const handleRemove = () => {
    const prevSrc = currentSrc;
    onPatch({ src: '' } as Partial<ImageOverlay>);
    setWarnings([]);
    offerUndo(prevSrc, 'Image removed');
  };

  const matchOverlayToImage = () => {
    if (!imgDims) return;
    const ratio = imgDims.width / Math.max(imgDims.height, 1);
    const nextHeight = Math.round((overlayWidthPt / ratio) * 100) / 100;
    onPatch({ height: nextHeight } as Partial<ImageOverlay>);
    toast.success(`Overlay resized to match image (${ratio.toFixed(2)}:1)`);
  };

  // ── Drag & drop handlers ────────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  // Preview: render the overlay box at its true aspect, with the image positioned per fit.
  const overlayRatio = overlayWidthPt / Math.max(overlayHeightPt, 1);
  const imageRatio = imgDims ? imgDims.width / Math.max(imgDims.height, 1) : null;
  const ratioMismatch = imageRatio != null && Math.abs(imageRatio - overlayRatio) / overlayRatio > 0.02;
  const fitObjectClass =
    fit === 'cover' ? 'object-cover' : fit === 'contain' ? 'object-contain' : 'object-fill';
  const crop = (overlay as any).crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const hasCrop = crop.left || crop.right || crop.top || crop.bottom;
  const dimsLoading = hasImage && !imgDims;

  return (
    <div className="space-y-2">
      {hasImage && (
        <div className="space-y-1">
          <div
            className="relative rounded-md overflow-hidden border bg-[repeating-conic-gradient(theme(colors.muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
            style={{ aspectRatio: `${overlayRatio}` }}
          >
            {dimsLoading && (
              <div className="absolute inset-0 animate-pulse bg-muted/60" aria-hidden />
            )}
            <img
              src={currentSrc}
              alt="Overlay preview"
              className={`absolute inset-0 w-full h-full ${fitObjectClass} ${dimsLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
            />
            {hasCrop && !dimsLoading && (
              <>
                {/* Translucent strips show what manual crop will trim. */}
                <div className="absolute top-0 left-0 right-0 bg-destructive/40" style={{ height: `${crop.top}%` }} />
                <div className="absolute bottom-0 left-0 right-0 bg-destructive/40" style={{ height: `${crop.bottom}%` }} />
                <div className="absolute top-0 bottom-0 left-0 bg-destructive/40" style={{ width: `${crop.left}%` }} />
                <div className="absolute top-0 bottom-0 right-0 bg-destructive/40" style={{ width: `${crop.right}%` }} />
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {dimsLoading ? 'Loading dimensions…' : imgDims ? `${imgDims.width}×${imgDims.height}px` : '—'} ·
              overlay {Math.round(overlayWidthPt)}×{Math.round(overlayHeightPt)}pt · fit: {fit}
            </span>
            {ratioMismatch && (
              <button
                type="button"
                onClick={matchOverlayToImage}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                title="Resize overlay height to match image aspect"
              >
                <Maximize2 className="h-2.5 w-2.5" /> Match aspect
              </button>
            )}
          </div>
          {ratioMismatch && (
            <p className="text-[10px] text-muted-foreground">
              {fit === 'cover' && 'Cover will crop the image to fill the overlay.'}
              {fit === 'contain' && 'Contain will letterbox the image inside the overlay.'}
              {fit === 'fill' && 'Fill will stretch the image to the overlay box.'}
            </p>
          )}
        </div>
      )}

      {/* Drag-and-drop zone + click-to-upload */}
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`border-2 border-dashed rounded-md p-3 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:border-primary/50 hover:bg-muted/30 text-muted-foreground'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = '';
          }}
        />
        {busy ? (
          <span className="text-xs inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </span>
        ) : (
          <span className="text-xs inline-flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" />
            {hasImage ? 'Drop to replace, or click' : 'Drop image, or click to upload'}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoMatch}
          onChange={(e) => toggleAutoMatch(e.target.checked)}
          className="h-3 w-3 accent-primary"
        />
        Auto-match overlay aspect to image on upload
      </label>

      {warnings.length > 0 && (
        <ul className="space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-[10px] text-warning flex items-start gap-1">
              <AlertTriangle className="h-2.5 w-2.5 mt-[2px] flex-shrink-0" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      {hasImage && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmRemoveOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove image
        </Button>
      )}

      {/* Remove confirmation */}
      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove image?</AlertDialogTitle>
            <AlertDialogDescription>
              The overlay's image source will be cleared. You can undo this from the toast for a few seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmRemoveOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmRemoveOpen(false); handleRemove(); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace confirmation */}
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current image?</AlertDialogTitle>
            <AlertDialogDescription>
              The existing image will be overwritten by <strong>{pendingFile?.name ?? 'the new file'}</strong>.
              You'll be able to undo from the toast for a few seconds.
              {warnings.length > 0 && (
                <span className="block mt-2 text-warning">
                  Heads up: {warnings.length} warning{warnings.length === 1 ? '' : 's'} on the new image.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmReplaceOpen(false); setPendingFile(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const f = pendingFile;
                setConfirmReplaceOpen(false);
                setPendingFile(null);
                if (f) await performUpload(f);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Crop controls ───────────────────────────────────────────────────────────
type CropValue = { left: number; right: number; top: number; bottom: number };

function CropControls({
  crop,
  onChange,
}: {
  crop: CropValue | undefined;
  onChange: (next: CropValue | undefined) => void;
}) {
  const c: CropValue = crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const total = c.left + c.right + c.top + c.bottom;
  const set = (k: keyof CropValue, v: number) => {
    const clamped = Math.max(0, Math.min(95, Number.isFinite(v) ? v : 0));
    const next = { ...c, [k]: clamped };
    // Guard against opposite edges summing >= 100% (would zero the visible area).
    if (next.left + next.right >= 100) next[k === 'left' ? 'right' : k === 'right' ? 'left' : k] = c[k === 'left' ? 'right' : 'left'];
    if (next.top + next.bottom >= 100) next[k === 'top' ? 'bottom' : k === 'bottom' ? 'top' : k] = c[k === 'top' ? 'bottom' : 'top'];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Manual crop (%)</Label>
        {total > 0 && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            Reset
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CropField label="Left" value={c.left} onChange={(v) => set('left', v)} />
        <CropField label="Right" value={c.right} onChange={(v) => set('right', v)} />
        <CropField label="Top" value={c.top} onChange={(v) => set('top', v)} />
        <CropField label="Bottom" value={c.bottom} onChange={(v) => set('bottom', v)} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Trims the source image from each edge. Red strips in the preview show what is removed.
      </p>
    </div>
  );
}

function CropField({
  label,
  value,
  onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        max={95}
        step={1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-8 text-xs"
      />
    </div>
  );
}
