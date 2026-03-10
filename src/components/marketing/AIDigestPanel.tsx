import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Performance Digest
            <Badge variant="secondary" className="text-[10px]">Gemini 3 Flash</Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={regenerating}
                className="h-7 px-2 text-xs"
              >
                {regenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Regenerate
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
            <ScrollArea className="max-h-[400px]">
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-p:text-sm prose-p:leading-relaxed prose-p:my-1.5
                prose-strong:text-foreground
                prose-li:text-sm prose-li:my-0.5
                prose-headings:text-foreground prose-headings:font-semibold
                prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1
                prose-ul:my-1.5 prose-ol:my-1.5">
                <ReactMarkdown>{digest}</ReactMarkdown>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}
