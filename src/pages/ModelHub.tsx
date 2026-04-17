import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Sparkles, Zap,
  Brain, Image as ImageIcon, Search, RefreshCw, ShieldCheck, Globe
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ALL_MODELS, PROVIDERS, modelsByRoute, statusBadgeColor, type ModelEntry } from '@/lib/modelCatalog';
import { toast } from 'sonner';

interface AvailabilityResponse {
  success: boolean;
  nativeKeys: Record<'openai' | 'anthropic' | 'gemini' | 'perplexity', boolean>;
  gatewayKey: boolean;
  checkedAt: string;
}

const capabilityIcon: Record<string, React.ReactNode> = {
  text: <Sparkles className="h-3 w-3" />,
  vision: <ImageIcon className="h-3 w-3" />,
  reasoning: <Brain className="h-3 w-3" />,
  'image-gen': <ImageIcon className="h-3 w-3" />,
  'image-edit': <ImageIcon className="h-3 w-3" />,
  search: <Search className="h-3 w-3" />,
  citations: <Search className="h-3 w-3" />,
  audio: <Zap className="h-3 w-3" />,
};

function ModelCard({ model, keyAvailable }: { model: ModelEntry; keyAvailable: boolean }) {
  const provider = PROVIDERS.find((p) => p.id === model.provider)!;
  const effectiveStatus =
    model.route === 'native' && !keyAvailable ? 'unavailable' : model.status;

  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur transition-all hover:border-primary/40 hover:bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className={`text-base ${provider.brandColor}`}>{model.displayName}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs">{model.id}</CardDescription>
          </div>
          <Badge variant="outline" className={statusBadgeColor(effectiveStatus)}>
            {effectiveStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          {model.capabilities.map((cap) => (
            <Badge key={cap} variant="secondary" className="gap-1 bg-muted/50 text-xs font-normal">
              {capabilityIcon[cap]} {cap}
            </Badge>
          ))}
          {model.releaseTier && (
            <Badge variant="outline" className="border-primary/30 text-xs text-primary">
              {model.releaseTier}
            </Badge>
          )}
        </div>

        {model.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed">{model.notes}</p>
        )}

        {model.status === 'deprecated' && model.successor && (
          <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <AlertDescription className="text-xs text-amber-200">
              Recommended upgrade: <span className="font-mono">{model.successor}</span>
            </AlertDescription>
          </Alert>
        )}

        {model.route === 'native' && !keyAvailable && (
          <Alert className="border-rose-500/30 bg-rose-500/10 py-2">
            <KeyRound className="h-3.5 w-3.5 text-rose-400" />
            <AlertDescription className="text-xs text-rose-200">
              Add <span className="font-mono">{provider.envKey}</span> in Edge Function secrets to enable.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderSection({
  providerId, route, keyAvailable,
}: {
  providerId: ModelEntry['provider'];
  route: 'native' | 'gateway';
  keyAvailable: boolean;
}) {
  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const models = modelsByRoute(route).filter((m) => m.provider === providerId);
  if (models.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className={`text-lg font-semibold ${provider.brandColor}`}>{provider.name}</h3>
          {route === 'native' && (
            <Badge
              variant="outline"
              className={keyAvailable ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}
            >
              {keyAvailable ? (
                <><CheckCircle2 className="mr-1 h-3 w-3" /> Key configured</>
              ) : (
                <><KeyRound className="mr-1 h-3 w-3" /> Key missing</>
              )}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer">
            Provider docs <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={`${m.route}-${m.id}`} model={m} keyAvailable={keyAvailable} />
        ))}
      </div>
    </div>
  );
}

export default function ModelHub() {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-model-availability', { body: {} });
      if (error) throw error;
      setAvailability(data as AvailabilityResponse);
    } catch (e) {
      toast.error('Failed to check model availability');
      // graceful fallback so UI still renders
      setAvailability({
        success: false,
        nativeKeys: { openai: false, anthropic: false, gemini: false, perplexity: false },
        gatewayKey: false,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAvailability(); }, []);

  const stats = useMemo(() => {
    const total = ALL_MODELS.length;
    const deprecated = ALL_MODELS.filter((m) => m.status === 'deprecated').length;
    const preview = ALL_MODELS.filter((m) => m.status === 'preview').length;
    return { total, deprecated, preview };
  }, []);

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Model Hub</h1>
          <p className="mt-1 text-muted-foreground">
            LLM availability, capabilities, and upgrade paths across all providers.
          </p>
        </div>
        <Button variant="outline" onClick={fetchAvailability} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh status
        </Button>
      </div>

      {/* Summary chips */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total models</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Sparkles className="h-8 w-8 text-primary/60" />
          </CardContent>
        </Card>
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">In preview</p>
              <p className="text-2xl font-bold text-sky-300">{stats.preview}</p>
            </div>
            <Zap className="h-8 w-8 text-sky-400/60" />
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Deprecated</p>
              <p className="text-2xl font-bold text-amber-300">{stats.deprecated}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-400/60" />
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Gateway</p>
              <p className="text-lg font-semibold text-emerald-300">
                {loading ? '…' : availability?.gatewayKey ? 'Connected' : 'Inactive'}
              </p>
            </div>
            <ShieldCheck className="h-8 w-8 text-emerald-400/60" />
          </CardContent>
        </Card>
      </div>

      {/* Deprecation playbook */}
      <Alert className="border-primary/30 bg-card/40">
        <Brain className="h-4 w-4" />
        <AlertTitle>How to handle a deprecated model</AlertTitle>
        <AlertDescription className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <p>1. Identify the deprecated model in the list below (yellow badge).</p>
          <p>2. Read the suggested successor on the card.</p>
          <p>3. Update the <code className="rounded bg-muted px-1 text-xs">model:</code> field in the affected edge function — or set the matching env override (e.g. <code className="rounded bg-muted px-1 text-xs">BC_AGENT_MODEL</code>).</p>
          <p>4. Deploy. Edge functions with a fallback chain will silently route to the next valid model.</p>
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs defaultValue="gateway" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="gateway" className="gap-2">
            <Globe className="h-4 w-4" /> Gateway APIs
          </TabsTrigger>
          <TabsTrigger value="native" className="gap-2">
            <KeyRound className="h-4 w-4" /> Native Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gateway" className="space-y-8">
          <Alert className="border-emerald-500/30 bg-emerald-500/5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <AlertTitle className="text-emerald-200">Gateway routing active</AlertTitle>
            <AlertDescription className="text-sm text-emerald-100/80">
              All gateway models are billed via your workspace credits. No per-provider keys required.
              Default model: <code className="rounded bg-background/40 px-1 font-mono">google/gemini-3-flash-preview</code>.
            </AlertDescription>
          </Alert>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : (
            <>
              <ProviderSection providerId="gemini" route="gateway" keyAvailable={!!availability?.gatewayKey} />
              <Separator />
              <ProviderSection providerId="openai" route="gateway" keyAvailable={!!availability?.gatewayKey} />
            </>
          )}
        </TabsContent>

        <TabsContent value="native" className="space-y-8">
          <Alert className="border-primary/30 bg-card/40">
            <KeyRound className="h-4 w-4" />
            <AlertTitle>Direct provider keys</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              These models are called directly using your own API keys stored in Edge Function secrets.
              Add or rotate keys in <span className="font-mono">Supabase → Edge Functions → Secrets</span>.
            </AlertDescription>
          </Alert>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : (
            <>
              <ProviderSection providerId="openai" route="native" keyAvailable={!!availability?.nativeKeys.openai} />
              <Separator />
              <ProviderSection providerId="perplexity" route="native" keyAvailable={!!availability?.nativeKeys.perplexity} />
              <Separator />
              <ProviderSection providerId="anthropic" route="native" keyAvailable={!!availability?.nativeKeys.anthropic} />
              <Separator />
              <ProviderSection providerId="gemini" route="native" keyAvailable={!!availability?.nativeKeys.gemini} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {availability?.checkedAt && (
        <p className="text-center text-xs text-muted-foreground">
          Last checked: {new Date(availability.checkedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
