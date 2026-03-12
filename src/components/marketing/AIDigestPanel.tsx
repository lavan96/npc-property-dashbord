import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { AgentMessageRenderer } from '@/components/agent/AgentMessageRenderer';

interface AIDigestPanelProps {
  digest: string;
  loading?: boolean;
  error?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export function AIDigestPanel({ digest, loading, error, onRegenerate, regenerating }: AIDigestPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Performance Digest
            <Badge variant="secondary" className="text-[10px] animate-pulse">Generating...</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-4/5 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">AI Performance Digest</span>
              <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">Gemini 3 Flash</Badge>
            </CardTitle>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {onRegenerate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="h-7 px-2 text-xs"
                >
                  {regenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin sm:mr-1" />
                  ) : (
                    <RefreshCw className="h-3 w-3 sm:mr-1" />
                  )}
                  <span className="hidden sm:inline">Regenerate</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="h-7 w-7 p-0"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {error ? (
            <div className="text-center py-4">
              <p className="text-sm text-destructive">{error}</p>
              {onRegenerate && (
                <Button variant="outline" size="sm" className="mt-2" onClick={onRegenerate}>
                  Try Again
                </Button>
              )}
            </div>
          ) : !digest ? (
            <div className="text-center py-4 text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No digest available yet</p>
              <p className="text-xs mt-1">Click "Regenerate" to generate an AI analysis</p>
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden">
              <AgentMessageRenderer content={digest} />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
