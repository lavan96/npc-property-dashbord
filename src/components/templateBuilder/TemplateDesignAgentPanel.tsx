/**
 * Slide-over chat panel that drives the Template Design Agent.
 *
 * Adds (Tier 1):
 *  - Plan Preview: every turn returns a candidate schema + ops list, user
 *    clicks Apply or Discard. Toggle to auto-apply for fast iteration.
 *  - AI Art Director: one-click "polish this page" pass.
 *  - Screenshot-to-Block: attach an image, the agent recreates the design.
 *  - Multi-turn memory (already), now surfaces a turn counter.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, RotateCcw, Loader2, Wand2, ImagePlus, X, Check, Eye, Palette, Brush,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import ReactMarkdown from 'react-markdown';

type AgentMode = 'design' | 'art_director' | 'screenshot_to_block';

type Pending = {
  reply: string;
  ops: string[];
  warnings: string[];
  previewSchema: ReportTemplate;
};

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  ops?: string[];
  warnings?: string[];
  applied?: boolean;
  attachmentLabel?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: ReportTemplate;
  setTemplate: (next: ReportTemplate) => void;
  activePageId: string | null;
  selectedBlockId: string | null;
  selectedOverlayId: string | null;
}

const PRESETS = [
  'Redesign the cover page in editorial luxury style with a bold serif headline and a gold accent rule.',
  'Add a new "Executive Summary" page with three KPI cards, a section heading, and a short paragraph.',
  'Switch the colour palette to a dark editorial scheme (deep navy bg, ivory text, muted gold accent).',
  'Duplicate page 1, then change its background to white and invert the text colours.',
  'Tighten the typography across every page: heading 32pt, body 11pt, line-height 1.4.',
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function TemplateDesignAgentPanel({
  open,
  onOpenChange,
  template,
  setTemplate,
  activePageId,
  selectedBlockId,
  selectedOverlayId,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, pending]);

  const send = async (opts?: { text?: string; mode?: AgentMode; image?: { name: string; dataUrl: string } | null }) => {
    const instruction = (opts?.text ?? input).trim();
    const image = opts?.image ?? attachedImage;
    const mode: AgentMode = opts?.mode ?? (image ? 'screenshot_to_block' : 'design');
    if (!instruction && !image) return;
    if (busy) return;

    setInput('');
    setAttachedImage(null);
    setPending(null);

    const userMsg: Msg = {
      role: 'user',
      content: instruction || (image ? 'Recreate this design on the active page.' : ''),
      attachmentLabel: image?.name,
    };
    const nextMsgs: Msg[] = [...messages, userMsg];
    setMessages(nextMsgs);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('template-design-agent', {
        body: {
          schema: template,
          messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
          instruction: userMsg.content,
          activePageId,
          selectedBlockId,
          selectedOverlayId,
          mode,
          imageDataUrl: image?.dataUrl,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply: string = data.reply || 'Done.';
      const ops: string[] = data.operations || [];
      const warnings: string[] = data.warnings || [];
      const previewSchema: ReportTemplate = data.schema;

      if (autoApply || ops.length === 0) {
        if (previewSchema && ops.length > 0) setTemplate(previewSchema);
        setMessages((m) => [...m, { role: 'assistant', content: reply, ops, warnings, applied: ops.length > 0 }]);
      } else {
        setPending({ reply, ops, warnings, previewSchema });
        setMessages((m) => [...m, { role: 'assistant', content: reply, ops, warnings, applied: false }]);
      }
      if (warnings.length) toast.warning(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} — see chat.`);
    } catch (e) {
      const msg = (e as Error).message;
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${msg}` }]);
      toast.error(`Agent error: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const applyPending = () => {
    if (!pending) return;
    setTemplate(pending.previewSchema);
    setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, applied: true } : x)));
    setPending(null);
    toast.success(`Applied ${pending.ops.length} change${pending.ops.length === 1 ? '' : 's'}`);
  };
  const discardPending = () => {
    if (!pending) return;
    setMessages((m) => [...m, { role: 'assistant', content: '_(changes discarded)_' }]);
    setPending(null);
  };

  const polishActivePage = () => {
    if (!activePageId) { toast.error('Select a page first'); return; }
    send({
      text: 'Polish this page: refine hierarchy, tighten spacing, harmonise colours, upgrade copy. Be decisive.',
      mode: 'art_director',
    });
  };

  const handleImagePick = async (file: File) => {
    if (file.size > 6 * 1024 * 1024) { toast.error('Image too large (max 6MB)'); return; }
    const dataUrl = await fileToDataUrl(file);
    setAttachedImage({ name: file.name, dataUrl });
    toast.success(`Attached "${file.name}" — describe what you want, then Send.`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Design Agent
            <Badge variant="outline" className="ml-2 text-[10px]">GPT-5.5 · multi-step</Badge>
            {messages.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">turn {Math.ceil(messages.length / 2)}</Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Multi-step instructions, screenshot-to-block, AI Art Director — every change previews before it applies.
          </SheetDescription>
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <Switch id="auto-apply" checked={autoApply} onCheckedChange={setAutoApply} />
              <Label htmlFor="auto-apply" className="text-[11px] text-muted-foreground cursor-pointer">
                Auto-apply (skip preview)
              </Label>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 text-[11px]"
              onClick={polishActivePage}
              disabled={busy || !activePageId}
              title="Run an AI Art Director pass on the active page"
            >
              <Brush className="h-3 w-3" /> Polish page
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-5 py-4 space-y-4" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Try one of these:</p>
                  <div className="grid gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => send({ text: p })}
                        disabled={busy}
                        className="text-left text-sm px-3 py-2 rounded-md border bg-card hover:border-primary/50 hover:bg-accent/30 transition-colors disabled:opacity-60"
                      >
                        <Sparkles className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className="text-left text-sm px-3 py-2 rounded-md border border-dashed bg-card hover:border-primary/50 transition-colors disabled:opacity-60"
                    >
                      <ImagePlus className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                      Drop a screenshot to recreate it as native blocks
                    </button>
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    {m.attachmentLabel && (
                      <div className="text-[10px] opacity-80 mb-1 flex items-center gap-1">
                        <ImagePlus className="h-3 w-3" /> {m.attachmentLabel}
                      </div>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    {!!m.ops?.length && (
                      <details className="mt-2 text-xs opacity-90" open={!m.applied && i === messages.length - 1}>
                        <summary className="cursor-pointer flex items-center gap-1">
                          {m.applied ? <Check className="h-3 w-3 text-success" /> : <Eye className="h-3 w-3" />}
                          {m.ops.length} change{m.ops.length === 1 ? '' : 's'} {m.applied ? 'applied' : 'proposed'}
                        </summary>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                          {m.ops.map((o, k) => <li key={k} className="font-mono text-[10px]">{o}</li>)}
                        </ul>
                      </details>
                    )}
                    {!!m.warnings?.length && (
                      <div className="mt-2 text-xs text-warning">
                        {m.warnings.map((w, k) => <div key={k}>⚠ {w}</div>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5 text-primary" /> Preview ready — {pending.ops.length} change{pending.ops.length === 1 ? '' : 's'}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nothing applied to your template yet. Review the changes above, then Apply or Discard.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={applyPending} className="gap-1">
                      <Check className="h-3.5 w-3.5" /> Apply changes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={discardPending} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Discard
                    </Button>
                  </div>
                </div>
              )}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Designing…
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t p-3 space-y-2">
          {attachedImage && (
            <div className="flex items-center gap-2 text-[11px] rounded-md border bg-muted/40 px-2 py-1">
              <ImagePlus className="h-3 w-3 text-primary" />
              <span className="truncate flex-1">{attachedImage.name}</span>
              <button onClick={() => setAttachedImage(null)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            }}
            placeholder={attachedImage
              ? 'Optionally describe what to keep/change in the screenshot… (Cmd/Ctrl + Enter to send)'
              : 'Describe one or more changes… (Cmd/Ctrl + Enter to send)'}
            className="min-h-[72px] resize-none"
            disabled={busy}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImagePick(f); e.currentTarget.value = ''; }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach a screenshot for the agent to recreate">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setPending(null); }} disabled={busy || (!messages.length && !pending)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> New chat
              </Button>
            </div>
            <Button onClick={() => send()} disabled={busy || (!input.trim() && !attachedImage)}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
