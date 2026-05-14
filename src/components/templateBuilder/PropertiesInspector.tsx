/**
 * PropertiesInspector — right rail. Edits the currently-selected overlay,
 * or page-level settings if none is selected.
 */
import { useMemo, useRef, useState } from 'react';
import { Trash2, Sparkles, Copy, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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
            overlayId={overlay.id}
            onUploaded={(url) => patch({ src: url } as any)}
          />
          <div>
            <Label className="text-xs">Fit</Label>
            <Select value={overlay.fit} onValueChange={(v) => patch({ fit: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="fill">Fill</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

function ImageUploadField({
  templateId,
  overlayId,
  onUploaded,
}: {
  templateId?: string;
  overlayId: string;
  onUploaded: (publicUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? '';

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
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
      onUploaded(publicUrl);
      toast.success('Image uploaded');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = '';
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full text-xs"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
        {busy ? 'Uploading…' : 'Upload image'}
      </Button>
    </div>
  );
}
