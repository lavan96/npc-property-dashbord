/**
 * PagesPanel — left rail. Shows pages (selectable, add/duplicate/delete) and
 * a block library to insert known blocks onto the active page.
 */
import { Plus, Copy, Trash2, FileText, Layers, Quote, Image as ImageIcon, Square, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { Block, Overlay, Page, ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import { cn } from '@/lib/utils';

interface Props {
  template: ReportTemplate;
  activePageId: string | null;
  onSelectPage: (id: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onAddBlock: (block: Block) => void;
  onAddOverlay: (overlay: Overlay) => void;
}

const PALETTE: Array<{
  label: string;
  icon: typeof Type;
  build: () => Block | { kind: 'overlay'; overlay: Overlay };
}> = [
  {
    label: 'Disclaimer',
    icon: Quote,
    build: () => ({
      id: crypto.randomUUID(),
      type: 'disclaimer',
      props: {
        companyName: 'Property Consulting',
        website: 'example.com.au',
        email: 'hello@example.com.au',
        phone: '+61 0 0000 0000',
        address: 'Sydney, NSW 2000',
        abn: '00 000 000 000',
        disclaimerText:
          'This document is general information only and does not constitute financial advice.',
      },
      overlays: [],
    }),
  },
  {
    label: 'Free / overlays',
    icon: Layers,
    build: () => ({
      id: crypto.randomUUID(),
      type: 'free',
      props: {},
      overlays: [],
    }),
  },
  {
    label: 'Text',
    icon: Type,
    build: () => ({
      kind: 'overlay',
      overlay: {
        id: crypto.randomUUID(),
        type: 'text',
        x: 60, y: 60, width: 300, height: 40, rotation: 0, opacity: 1,
        content: 'New text',
        fontFamily: 'Helvetica',
        fontSize: 18,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#000000',
        align: 'left',
        lineHeight: 1.3,
        letterSpacing: 0,
      } as Overlay,
    }),
  },
  {
    label: 'Rectangle',
    icon: Square,
    build: () => ({
      kind: 'overlay',
      overlay: {
        id: crypto.randomUUID(),
        type: 'shape',
        shape: 'rect',
        x: 60, y: 120, width: 200, height: 120, rotation: 0, opacity: 1,
        fill: 'token:primary',
        strokeWidth: 0,
        borderRadius: 6,
      } as Overlay,
    }),
  },
  {
    label: 'Image',
    icon: ImageIcon,
    build: () => ({
      kind: 'overlay',
      overlay: {
        id: crypto.randomUUID(),
        type: 'image',
        x: 60, y: 260, width: 200, height: 140, rotation: 0, opacity: 1,
        src: '{{property.imageUrl}}',
        fit: 'cover',
      } as Overlay,
    }),
  },
];

export function PagesPanel({
  template,
  activePageId,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onAddBlock,
  onAddOverlay,
}: Props) {
  return (
    <div className="flex flex-col h-full border-r bg-muted/20">
      {/* Pages */}
      <div className="p-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pages</h3>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onAddPage} title="Add page">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1 max-h-[40%]">
        <div className="px-2 pb-2 space-y-1">
          {template.pages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No pages yet</p>
          )}
          {template.pages.map((page, i) => (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className={cn(
                'w-full text-left rounded-md px-2 py-2 text-xs flex items-center gap-2 group transition-colors',
                activePageId === page.id
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'hover:bg-muted',
              )}
            >
              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">
                {i + 1}. {page.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {page.blocks.reduce((acc, b) => acc + b.overlays.length, 0)}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicatePage(page.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-foreground"
                title="Duplicate"
              >
                <Copy className="h-3 w-3" />
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete page "${page.name}"?`)) onDeletePage(page.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Block library */}
      <div className="p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Insert
        </h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-3 grid grid-cols-2 gap-2">
          {PALETTE.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => {
                  const built = item.build();
                  if ('kind' in built && built.kind === 'overlay') {
                    onAddOverlay(built.overlay);
                  } else {
                    onAddBlock(built as Block);
                  }
                }}
                className="flex flex-col items-center gap-1.5 rounded-md border bg-card hover:border-primary/50 hover:bg-muted/40 transition-colors p-3 text-xs"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="leading-tight text-center">{item.label}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
