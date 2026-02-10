import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Bot, User, Wrench, ChevronRight, Clock } from 'lucide-react';

interface ArtifactMessage {
  role: string;
  message?: string;
  content?: string;
  time?: number;
  endTime?: number;
  duration?: number;
  name?: string;
  assistantId?: string;
  assistantName?: string;
  toolCalls?: Array<{
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
  toolCallId?: string;
  result?: string;
  [key: string]: unknown;
}

interface CallTranscriptChatProps {
  artifactMessages: ArtifactMessage[] | null;
  plainTranscript: string | null;
}

export const CallTranscriptChat = ({ artifactMessages, plainTranscript }: CallTranscriptChatProps) => {
  // Fallback to plain transcript if no artifact messages
  if (!artifactMessages || artifactMessages.length === 0) {
    if (plainTranscript) {
      return (
        <Card>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted p-4 rounded-lg">
              {plainTranscript}
            </pre>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No transcript available</p>
        </CardContent>
      </Card>
    );
  }

  // Build a result map for tool calls
  const resultMap = new Map<string, ArtifactMessage>();
  for (const msg of artifactMessages) {
    if ((msg.role === 'tool_call_result' || msg.role === 'tool') && msg.toolCallId) {
      resultMap.set(msg.toolCallId, msg);
    }
  }

  // Filter out system messages and tool results (they'll be shown inline with tool_calls)
  const visibleMessages = artifactMessages.filter(
    msg => msg.role !== 'system' && msg.role !== 'tool_call_result' && msg.role !== 'tool'
  );

  const formatTime = (time: number | undefined) => {
    if (!time) return null;
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  let toolCallCounter = 0;

  return (
    <div className="space-y-3">
      {visibleMessages.map((msg, idx) => {
        const isBot = msg.role === 'bot' || msg.role === 'assistant';
        const isUser = msg.role === 'user';
        const content = msg.message || msg.content;
        const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

        // Skip empty messages without tool calls
        if (!content && !hasToolCalls) return null;

        return (
          <div key={idx}>
            {/* Chat bubble */}
            {content && (
              <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{content}</p>
                  {msg.time && (
                    <p className={`text-[10px] mt-1 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground/60'}`}>
                      {formatTime(msg.time)}
                    </p>
                  )}
                  {isBot && msg.assistantName && (
                    <p className={`text-[10px] mt-0.5 text-muted-foreground/60`}>
                      {msg.assistantName}
                    </p>
                  )}
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            )}

            {/* Inline tool calls */}
            {hasToolCalls && (
              <div className="my-2 mx-8">
                <Accordion type="multiple">
                  {msg.toolCalls!.map((tc, tcIdx) => {
                    toolCallCounter++;
                    const tcId = tc.id || `inline-tc-${idx}-${tcIdx}`;
                    const resultMsg = tc.id ? resultMap.get(tc.id) : undefined;

                    let args: unknown = tc.function?.arguments || '{}';
                    try { if (typeof args === 'string') args = JSON.parse(args as string); } catch { /* keep */ }

                    let result: unknown = null;
                    let success = true;
                    if (resultMsg) {
                      const raw = resultMsg.result || resultMsg.content || resultMsg.message;
                      if (raw) {
                        try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { result = raw; }
                      }
                      if (typeof result === 'object' && result !== null) {
                        const r = result as Record<string, unknown>;
                        if (r.error || r.success === false) success = false;
                      }
                    }

                    return (
                      <AccordionItem key={tcId} value={tcId} className="border border-dashed border-muted-foreground/30 rounded-lg my-1 px-1 overflow-hidden">
                        <AccordionTrigger className="hover:no-underline py-2 text-xs">
                          <div className="flex items-center gap-2 text-left">
                            <Wrench className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-muted-foreground">{tc.function?.name || 'tool_call'}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 text-xs pb-1 overflow-hidden">
                            <div>
                              <p className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <ChevronRight className="w-3 h-3" /> Request
                              </p>
                              <pre className="whitespace-pre-wrap break-all font-mono bg-background p-2 rounded-md overflow-auto max-h-40 text-[11px] w-full max-w-full">
                                {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <ChevronRight className="w-3 h-3" /> Response
                              </p>
                              <pre className="whitespace-pre-wrap break-all font-mono bg-background p-2 rounded-md overflow-auto max-h-40 text-[11px] w-full max-w-full">
                                {result ? (typeof result === 'string' ? result : JSON.stringify(result, null, 2)) : 'No response'}
                              </pre>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
