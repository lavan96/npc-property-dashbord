/**
 * PropertiesInspector — right rail. Edits the currently-selected overlay,
 * or page-level settings if none is selected.
 *
 * Phase 2 supports text overlays in detail (content, font size/weight, alignment,
 * color, position/size). Shape & image overlays show their core props too.
 */
import { Trash2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { Overlay, Page } from '@/lib/reportTemplate/templateSchema';

interface Props {
  page: Page | null;
  overlay: Overlay | null;
  onUpdateOverlay: (next: Overlay) => void;
  onDeleteOverlay: (id: string) => void;
  onUpdatePage: (next: Page) => void;
}

const BINDING_HINTS = [
  '{{property.address}}',
  '{{financials.weeklyRent | currency}}',
  '{{financials.purchasePrice | currency}}',
  '{{client.name}}',
  '{{tier | upper}}',
];

export function PropertiesInspector({
  page,
  overlay,
  onUpdateOverlay,
  onDeleteOverlay,
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
            overlay={overlay}
            onChange={onUpdateOverlay}
            onDelete={() => onDeleteOverlay(overlay.id)}
          />
        ) : (
          page && <PageEditor page={page} onChange={onUpdatePage} />
        )}
      </div>
    </ScrollArea>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OverlayEditor({
  overlay,
  onChange,
  onDelete,
}: {
  overlay: Overlay;
  onChange: (n: Overlay) => void;
  onDelete: () => void;
}) {
  const patch = (p: Partial<Overlay>) => onChange({ ...overlay, ...(p as any) });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold capitalize">{overlay.type} overlay</h3>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{overlay.id}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
          <div>
            <Label className="text-xs">Content</Label>
            <Textarea
              value={String(overlay.content ?? '')}
              onChange={(e) => patch({ content: e.target.value } as any)}
              className="font-mono text-xs"
              rows={3}
            />
            <BindingHelper onPick={(b) => patch({ content: `${overlay.content ?? ''}${b}` } as any)} />
          </div>
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
          <ColorField label="Color" value={String(overlay.color || '#000000')} onChange={(v) => patch({ color: v } as any)} />
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
          <ColorField label="Fill" value={String(overlay.fill || '')} allowEmpty onChange={(v) => patch({ fill: v || undefined } as any)} />
          <ColorField label="Stroke" value={String(overlay.stroke || '')} allowEmpty onChange={(v) => patch({ stroke: v || undefined } as any)} />
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Stroke W" value={overlay.strokeWidth || 0} onChange={(v) => patch({ strokeWidth: v } as any)} />
            <NumField label="Radius" value={overlay.borderRadius || 0} onChange={(v) => patch({ borderRadius: v } as any)} />
          </div>
        </div>
      )}

      {overlay.type === 'image' && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Source (URL or binding)</Label>
            <Input value={String(overlay.src ?? '')} onChange={(e) => patch({ src: e.target.value } as any)} className="text-xs" />
            <BindingHelper onPick={(b) => patch({ src: b } as any)} />
          </div>
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

function PageEditor({ page, onChange }: { page: Page; onChange: (n: Page) => void }) {
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
  label, value, onChange, allowEmpty,
}: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const isHex = value?.startsWith('#');
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
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  );
}

function BindingHelper({ onPick }: { onPick: (b: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
        <Sparkles className="h-2.5 w-2.5" /> bind:
      </span>
      {BINDING_HINTS.map((b) => (
        <button
          key={b}
          onClick={() => onPick(b)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary font-mono"
        >
          {b}
        </button>
      ))}
    </div>
  );
}
