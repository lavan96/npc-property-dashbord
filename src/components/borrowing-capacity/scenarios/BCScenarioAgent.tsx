import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Bot, Send, ChevronDown, ChevronUp, Sparkles, Loader2,
  TrendingUp, CheckCircle2, Zap,
} from 'lucide-react';
import { VoiceToTextButton } from '@/components/ui/VoiceToTextButton';
import ReactMarkdown from 'react-markdown';
import type { BorrowingCapacityInput, BorrowingCapacityResult } from '@/utils/borrowingCapacityCalculations';
import type { LiabilityItem, PropertyItem } from './StrategyScenarioModeling';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────

interface ScenarioAdjustments {
  consolidatedLiabilityIds: string[];
  refinancedToIOPropertyIds: string[];
  rateAdjustment: number;
  incomeGrowthPercent: number;
  expenseReductionPercent: number;
  equityRelease?: { propertyId: string; targetLVR: number } | null;
}

export interface AIScenario {
  name: string;
  reasoning: string;
  adjustments: ScenarioAdjustments;
  estimatedImpact: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BCScenarioAgentProps {
  baseInputs: BorrowingCapacityInput;
  baseResult: BorrowingCapacityResult;
  liabilities: LiabilityItem[];
  properties: PropertyItem[];
  onApplyScenario: (scenario: AIScenario) => void;
}

// ── Component ──────────────────────────────────────────

export function BCScenarioAgent({
  baseInputs,
  baseResult,
  liabilities,
  properties,
  onApplyScenario,
}: BCScenarioAgentProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scenarios, setScenarios] = useState<AIScenario[]>([]);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const sessionToken = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bc-scenario-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
          },
          credentials: 'omit',
          body: JSON.stringify({
            session_token: sessionToken,
            messages: updatedMessages,
            clientContext: { baseInputs, baseResult, liabilities, properties },
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      // Stream SSE
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let toolCallArgs = '';
      let hasToolCall = false;

      const updateAssistant = (text: string) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: text } : m);
          }
          return [...prev, { role: 'assistant', content: text }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            // Text content
            if (delta?.content) {
              assistantText += delta.content;
              updateAssistant(assistantText);
            }

            // Tool call accumulation
            if (delta?.tool_calls) {
              hasToolCall = true;
              for (const tc of delta.tool_calls) {
                if (tc.function?.arguments) {
                  toolCallArgs += tc.function.arguments;
                }
              }
            }
          } catch {
            // Partial JSON, skip
          }
        }
      }

      // Parse tool call result for scenarios
      if (hasToolCall && toolCallArgs) {
        try {
          const parsed = JSON.parse(toolCallArgs);
          if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
            setScenarios(parsed.scenarios);
            setAppliedIndex(null);
            // Add a summary message if the assistant didn't say anything
            if (!assistantText.trim()) {
              const summaryText = `I've generated **3 scenarios** based on your requirements. Review them below and click **"Apply"** on any scenario to load it into the strategy modelling section.`;
              updateAssistant(summaryText);
            }
          }
        } catch (e) {
          console.error('[BCScenarioAgent] Failed to parse tool call:', e);
        }
      }
    } catch (err: any) {
      console.error('[BCScenarioAgent] Error:', err);
      toast.error(err.message || 'Failed to get AI response');
      // Remove loading state but keep messages
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, baseInputs, baseResult, liabilities, properties]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleApply = (scenario: AIScenario, index: number) => {
    setAppliedIndex(index);
    onApplyScenario(scenario);
    toast.success(`"${scenario.name}" applied to strategy levers`);
  };

  const suggestedPrompts = [
    "My client wants to buy a $650k investment property. What strategies can maximise their capacity?",
    "Which debts should we pay off first to get the biggest capacity boost?",
    "Can we improve capacity by refinancing investment loans to Interest-Only?",
  ];

  return (
    <div className="mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 h-auto"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Strategy Advisor</p>
                <p className="text-xs text-muted-foreground">AI-powered scenario generation</p>
              </div>
            </div>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2 border rounded-lg overflow-hidden bg-card">
            {/* Chat messages */}
            <div ref={scrollRef} className="max-h-[300px] overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <Sparkles className="h-8 w-8 text-primary/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Describe your client's goals and I'll generate 3 tailored scenarios
                  </p>
                  <div className="flex flex-col gap-2">
                    {suggestedPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                        className="text-xs text-left px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>ul]:mb-1">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t p-3 flex gap-2 items-end">
              <VoiceToTextButton
                onTranscript={(text) => setInput(prev => prev ? `${prev} ${text}` : text)}
                disabled={isLoading}
                size="sm"
              />
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what the client needs..."
                className="min-h-[40px] max-h-[80px] resize-none text-sm"
                rows={1}
                disabled={isLoading}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scenario Cards */}
          {scenarios.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {scenarios.map((scenario, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 transition-all ${
                    appliedIndex === i
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-semibold leading-tight">{scenario.name}</h4>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {scenario.estimatedImpact}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3 line-clamp-3">
                    {scenario.reasoning}
                  </p>

                  {/* Adjustment badges */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {scenario.adjustments.consolidatedLiabilityIds?.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Pay off {scenario.adjustments.consolidatedLiabilityIds.length} debt{scenario.adjustments.consolidatedLiabilityIds.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {scenario.adjustments.refinancedToIOPropertyIds?.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        IO refinance
                      </Badge>
                    )}
                    {scenario.adjustments.rateAdjustment !== 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Rate {scenario.adjustments.rateAdjustment > 0 ? '+' : ''}{scenario.adjustments.rateAdjustment}%
                      </Badge>
                    )}
                    {scenario.adjustments.incomeGrowthPercent > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Income +{scenario.adjustments.incomeGrowthPercent}%
                      </Badge>
                    )}
                    {scenario.adjustments.expenseReductionPercent > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Expenses -{scenario.adjustments.expenseReductionPercent}%
                      </Badge>
                    )}
                    {scenario.adjustments.equityRelease && (
                      <Badge variant="secondary" className="text-[10px]">
                        Equity release
                      </Badge>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={appliedIndex === i ? 'default' : 'outline'}
                    className="w-full text-xs h-8"
                    onClick={() => handleApply(scenario, i)}
                  >
                    {appliedIndex === i ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Applied
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3 mr-1" />
                        Apply Scenario
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
