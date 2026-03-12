import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  Lightbulb, AlertTriangle, CheckCircle2, Info, Brain,
  ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus,
  BarChart3, Zap, FileDown, Clock
} from 'lucide-react';

// ──────────────────────────────────────────────
// Block types parsed from :::type … ::: fences
// ──────────────────────────────────────────────
interface RichBlock {
  kind: 'markdown' | 'tip' | 'warning' | 'success' | 'note' | 'insight' | 'metric' | 'steps' | 'compare' | 'detail';
  content: string;
  meta?: string; // for :::detail Summary text
}

// ──────────────────────────────────────────────
// Parser: splits raw content into typed blocks
// ──────────────────────────────────────────────
function parseBlocks(raw: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = raw.split('\n');
  let current: RichBlock | null = null;
  let buffer: string[] = [];

  const flushMarkdown = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ kind: 'markdown', content: text });
    buffer = [];
  };

  const validKinds = ['tip', 'warning', 'success', 'note', 'insight', 'metric', 'steps', 'compare', 'detail'] as const;
  type BlockKind = typeof validKinds[number];

  for (const line of lines) {
    // Opening fence: :::type or :::detail Some summary
    const openMatch = line.match(/^:::(tip|warning|success|note|insight|metric|steps|compare|detail)\s*(.*)?$/);
    if (openMatch && !current) {
      flushMarkdown();
      const kind = openMatch[1] as BlockKind;
      const meta = openMatch[2]?.trim() || undefined;
      current = { kind, content: '', meta };
      continue;
    }

    // Closing fence
    if (line.trim() === ':::' && current) {
      current.content = current.content.trim();
      blocks.push(current);
      current = null;
      continue;
    }

    if (current) {
      current.content += (current.content ? '\n' : '') + line;
    } else {
      buffer.push(line);
    }
  }

  // Flush remaining
  if (current) {
    // Unclosed block — treat as markdown
    buffer.push(`:::${current.kind}${current.meta ? ' ' + current.meta : ''}`);
    buffer.push(current.content);
  }
  flushMarkdown();

  return blocks;
}

// ──────────────────────────────────────────────
// Markdown renderer shared across blocks
// ──────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:text-xs [&_th]:py-1 [&_td]:py-1 [&_p]:leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ──────────────────────────────────────────────
// Block renderers
// ──────────────────────────────────────────────

function TipBlock({ content }: { content: string }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-primary bg-primary/5 p-3 flex gap-2.5">
      <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function WarningBlock({ content }: { content: string }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-warning bg-warning/5 p-3 flex gap-2.5">
      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function SuccessBlock({ content }: { content: string }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-success bg-success/5 p-3 flex gap-2.5">
      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function NoteBlock({ content }: { content: string }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-muted-foreground/30 bg-muted/40 p-3 flex gap-2.5">
      <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function InsightBlock({ content }: { content: string }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-primary/60 bg-accent/30 p-3 flex gap-2.5">
      <Brain className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-sm italic text-muted-foreground">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

function MetricBlock({ content }: { content: string }) {
  // Parse key-value lines: Label: ..., Value: ..., Change: ...
  const lines = content.split('\n').filter(l => l.trim());
  const data: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
    if (match) data[match[1].trim().toLowerCase()] = match[2].trim();
  }

  const label = data.label || data.title || 'Metric';
  const value = data.value || data.amount || '—';
  const change = data.change || data.trend || null;
  const isPositive = change ? change.includes('+') || change.toLowerCase().includes('up') : null;
  const isNegative = change ? change.includes('-') || change.toLowerCase().includes('down') : null;

  return (
    <div className="my-2 rounded-lg border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <div className="flex items-end gap-2 mt-0.5">
        <span className="text-xl font-bold text-foreground leading-none">{value}</span>
        {change && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full",
            isPositive && "text-success bg-success/10",
            isNegative && "text-destructive bg-destructive/10",
            !isPositive && !isNegative && "text-muted-foreground bg-muted"
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

function StepsBlock({ content }: { content: string }) {
  const steps = content.split('\n').filter(l => l.trim());

  return (
    <div className="my-2 pl-1">
      <div className="relative border-l-2 border-primary/20 pl-4 space-y-2.5">
        {steps.map((step, i) => {
          // Strip leading numbers/bullets
          const text = step.replace(/^\d+[\.\)]\s*|^[-*]\s*/, '').trim();
          if (!text) return null;
          return (
            <div key={i} className="relative">
              <div className="absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
              <p className="text-sm leading-relaxed">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareBlock({ content }: { content: string }) {
  // Parse "Option A: …" and "Option B: …" style lines
  const options: { title: string; body: string }[] = [];
  const lines = content.split('\n');
  let current: { title: string; body: string } | null = null;

  for (const line of lines) {
    const optMatch = line.match(/^(?:Option\s+\w+|[\w\s]+?):\s*(.+)$/i);
    if (optMatch && !current?.body) {
      if (current) options.push(current);
      const colonIdx = line.indexOf(':');
      current = { title: line.slice(0, colonIdx).trim(), body: line.slice(colonIdx + 1).trim() };
    } else if (current) {
      current.body += '\n' + line;
    } else {
      current = { title: `Option ${options.length + 1}`, body: line.trim() };
    }
  }
  if (current) options.push(current);

  return (
    <div className="my-2 grid grid-cols-1 gap-2">
      {options.map((opt, i) => (
        <div key={i} className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">{opt.title}</p>
          <div className="text-sm">
            <MarkdownContent content={opt.body.trim()} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailBlock({ content, meta }: { content: string; meta?: string }) {
  const [open, setOpen] = useState(false);
  const summary = meta || 'Show details';

  return (
    <div className="my-2 rounded-lg border border-border/30 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {summary}
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm border-t border-border/20 pt-2">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Chart renderer (migrated from AgentChatWidget)
// ──────────────────────────────────────────────
function InlineChart({ content }: { content: string }) {
  const chartMatch = content.match(/```json\s*(\{[\s\S]*?"chart"[\s\S]*?\})\s*```/);
  if (!chartMatch) return null;

  try {
    const chartData = JSON.parse(chartMatch[1]);
    if (!chartData.chart) return null;
    const { type, title, labels, datasets } = chartData.chart;
    const maxVal = Math.max(...(datasets?.[0]?.data || [1]));
    const colors = datasets?.[0]?.backgroundColor || ['hsl(var(--primary))'];

    return (
      <div className="mt-3 p-3 rounded-lg border border-border/30 bg-muted/20">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">{title || 'Chart'}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{type}</span>
        </div>
        {(type === 'bar' || type === 'line') && (
          <div className="space-y-1">
            {labels?.map((label: string, i: number) => (
              <div key={label} className="flex items-center gap-2 text-[10px]">
                <span className="w-20 truncate text-muted-foreground text-right">{label}</span>
                <div className="flex-1 h-4 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${maxVal > 0 ? (datasets[0].data[i] / maxVal) * 100 : 0}%`,
                      backgroundColor: Array.isArray(colors) ? colors[i % colors.length] : colors,
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono font-medium">{datasets[0].data[i]}</span>
              </div>
            ))}
          </div>
        )}
        {(type === 'pie' || type === 'doughnut') && (
          <div className="flex flex-wrap gap-2">
            {labels?.map((label: string, i: number) => {
              const total = datasets[0].data.reduce((a: number, b: number) => a + b, 0);
              const pct = total > 0 ? Math.round((datasets[0].data[i] / total) * 100) : 0;
              return (
                <div key={label} className="flex items-center gap-1 text-[10px]">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: Array.isArray(colors) ? colors[i % colors.length] : colors }}
                  />
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Confidence indicator (migrated)
// ──────────────────────────────────────────────
function ConfidenceIndicator({ content }: { content: string }) {
  const healthMatch = content.match(/health[_ ]score[:\s]*(\d+)/i);
  const confidenceMatch = content.match(/confidence[:\s]*(\d+(?:\.\d+)?)/i);
  const score = healthMatch ? parseInt(healthMatch[1]) : confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
  if (score === null) return null;
  const normalizedScore = score > 1 ? score : score * 100;
  const variant =
    normalizedScore >= 80
      ? 'text-success bg-success/10'
      : normalizedScore >= 50
        ? 'text-warning bg-warning/10'
        : 'text-destructive bg-destructive/10';
  const label = normalizedScore >= 80 ? '🟢 High' : normalizedScore >= 50 ? '🟡 Medium' : '🔴 Low';
  return (
    <div className={cn('mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full', variant)}>
      {label} Confidence ({Math.round(normalizedScore)}%)
    </div>
  );
}

// ──────────────────────────────────────────────
// Contextual badges (migrated)
// ──────────────────────────────────────────────
function ContextualBadges({ content }: { content: string }) {
  const badges: { match: boolean; icon: React.ReactNode; label: string }[] = [
    { match: content.includes('Playbook "'), icon: <Zap className="h-3 w-3" />, label: 'Playbook Executed' },
    { match: content.includes('Weekly Digest'), icon: <TrendingUp className="h-3 w-3" />, label: 'Weekly Digest' },
    { match: (content.includes('Pipeline Summary') || content.includes('export')) && content.includes('| Client'), icon: <FileDown className="h-3 w-3" />, label: 'Exported Data' },
    { match: content.includes('engagement_score'), icon: <Brain className="h-3 w-3" />, label: 'Engagement Analysis' },
    { match: content.includes('Memory saved'), icon: <Brain className="h-3 w-3" />, label: 'Memory Saved' },
    { match: content.includes('Report queued'), icon: <FileDown className="h-3 w-3" />, label: 'Report Queued' },
    { match: content.includes('Scheduled for'), icon: <Clock className="h-3 w-3" />, label: 'Scheduled' },
  ];

  const active = badges.filter(b => b.match);
  if (active.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {active.map((b, i) => (
        <div key={i} className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
          {b.icon} {b.label}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main exported renderer
// ──────────────────────────────────────────────
interface AgentMessageRendererProps {
  content: string;
}

export function AgentMessageRenderer({ content }: AgentMessageRendererProps) {
  const blocks = parseBlocks(content);

  return (
    <div>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'tip':
            return <TipBlock key={i} content={block.content} />;
          case 'warning':
            return <WarningBlock key={i} content={block.content} />;
          case 'success':
            return <SuccessBlock key={i} content={block.content} />;
          case 'note':
            return <NoteBlock key={i} content={block.content} />;
          case 'insight':
            return <InsightBlock key={i} content={block.content} />;
          case 'metric':
            return <MetricBlock key={i} content={block.content} />;
          case 'steps':
            return <StepsBlock key={i} content={block.content} />;
          case 'compare':
            return <CompareBlock key={i} content={block.content} />;
          case 'detail':
            return <DetailBlock key={i} content={block.content} meta={block.meta} />;
          case 'markdown':
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:text-xs [&_th]:py-1 [&_td]:py-1 [&_p]:leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
              </div>
            );
          default:
            return null;
        }
      })}

      {/* Addons that scan full content */}
      <InlineChart content={content} />
      <ConfidenceIndicator content={content} />
      <ContextualBadges content={content} />
    </div>
  );
}
