/**
 * Slide-over chat panel that drives the Template Design Agent.
 * Multi-turn conversational editing with full schema context.
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, Loader2, Wand2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string; ops?: string[]; warnings?: string[] };

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const instruction = (text ?? input).trim();
    if (!instruction || busy) return;
    setInput('');
    const nextMsgs: Msg[] = [...messages, { role: 'user', content: instruction }];
    setMessages(nextMsgs);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('template-design-agent', {
        body: {
          schema: template,
          messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
          instruction,
          activePageId,
          selectedBlockId,
          selectedOverlayId,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const reply: string = data.reply || 'Done.';
      const ops: string[] = data.operations || [];
      const warnings: string[] = data.warnings || [];
      if (data.schema) setTemplate(data.schema);
      setMessages((m) => [...m, { role: 'assistant', content: reply, ops, warnings }]);
      if (warnings.length) toast.warning(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} — see chat.`);
    } catch (e) {
      const msg = (e as Error).message;
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${msg}` }]);
      toast.error(`Agent error: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Design Agent
            <Badge variant="outline" className="ml-2 text-[10px]">GPT-5.5 · multi-step</Badge>
          </SheetTitle>
          <SheetDescription>
            Tell the agent what you want — single instruction or a stacked list. It reads the full template, plans, and applies all edits in one go.
          </SheetDescription>
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
                        onClick={() => send(p)}
                        disabled={busy}
                        className="text-left text-sm px-3 py-2 rounded-md border bg-card hover:border-primary/50 hover:bg-accent/30 transition-colors disabled:opacity-60"
                      >
                        <Sparkles className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                        {p}
                      </button>
                    ))}
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
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    {!!m.ops?.length && (
                      <details className="mt-2 text-xs opacity-80">
                        <summary className="cursor-pointer">{m.ops.length} change{m.ops.length === 1 ? '' : 's'} applied</summary>
                        <ul className="mt-1 list-disc pl-4 space-y-0.5">
                          {m.ops.map((o, k) => <li key={k}>{o}</li>)}
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

              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Designing…
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t p-3 space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            }}
            placeholder="Describe one or more changes… (Cmd/Ctrl + Enter to send)"
            className="min-h-[72px] resize-none"
            disabled={busy}
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={busy || !messages.length}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> New chat
            </Button>
            <Button onClick={() => send()} disabled={busy || !input.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
