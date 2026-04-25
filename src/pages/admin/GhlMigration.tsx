import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ShieldAlert, RefreshCw, Eye, ArrowLeftRight, Database, Users,
  TrendingUp, MessageSquare, StickyNote, GitBranch, MapPin, AlertCircle, CheckCircle2, Lock,
} from 'lucide-react';

type Account = 'legacy' | 'new';
type Domain = 'location' | 'contacts' | 'opportunities' | 'conversations' | 'notes' | 'pipelines';

interface DomainResult {
  domain: Domain;
  count: number | null;
  sample: any[];
  error?: string;
  meta?: Record<string, any>;
}

interface PreviewResponse {
  success: boolean;
  account: Account;
  location_id: string;
  fetched_at: string;
  results: DomainResult[];
  error?: string;
  mode: string;
}

const DOMAIN_META: Record<Domain, { label: string; icon: any; description: string }> = {
  location:      { label: 'Location',      icon: MapPin,         description: 'GHL account identity & timezone' },
  contacts:      { label: 'Contacts',      icon: Users,          description: 'Total contacts in the account' },
  opportunities: { label: 'Opportunities', icon: TrendingUp,     description: 'Open deals across all pipelines' },
  conversations: { label: 'Conversations', icon: MessageSquare,  description: 'SMS/email/IG threads' },
  notes:         { label: 'Notes',         icon: StickyNote,     description: 'Per-contact notes (preview not enumerable)' },
  pipelines:     { label: 'Pipelines',     icon: GitBranch,      description: 'Pipelines & their stage layouts' },
};

const ALL_DOMAINS: Domain[] = ['location', 'contacts', 'pipelines', 'opportunities', 'conversations', 'notes'];

function fmtCount(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

function PreviewCard({
  result,
  account,
}: {
  result: DomainResult | undefined;
  account: Account;
}) {
  const meta = result ? DOMAIN_META[result.domain] : null;
  if (!meta || !result) return null;
  const Icon = meta.icon;

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`rounded-md p-2 ${account === 'new' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription className="text-xs">{meta.description}</CardDescription>
            </div>
          </div>
          {result.error ? (
            <Badge variant="destructive" className="text-[10px]">ERROR</Badge>
          ) : (
            <Badge variant={account === 'new' ? 'default' : 'secondary'} className="text-[10px] uppercase">
              {account}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{fmtCount(result.count)}</span>
          {result.count !== null && <span className="text-xs text-muted-foreground">records</span>}
        </div>

        {result.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-all">{result.error}</span>
            </div>
          </div>
        )}

        {result.meta?.info && (
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            {result.meta.info}
          </div>
        )}

        {result.sample.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Sample ({result.sample.length})
            </summary>
            <div className="mt-2 space-y-1.5 rounded-md bg-muted/30 p-2 font-mono text-[10px]">
              {result.sample.map((s: any, i: number) => (
                <div key={i} className="border-b border-border/30 pb-1.5 last:border-0">
                  {Object.entries(s).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default function GhlMigration() {
  const { isSuperadmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [account, setAccount] = useState<Account>('new');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [legacyData, setLegacyData] = useState<PreviewResponse | null>(null);
  const [view, setView] = useState<'single' | 'compare'>('single');

  useEffect(() => {
    if (!authLoading && !isSuperadmin) {
      toast.error('Superadmin access required');
      navigate('/', { replace: true });
    }
  }, [authLoading, isSuperadmin, navigate]);

  const runPreview = async (acct: Account): Promise<PreviewResponse | null> => {
    const res = await invokeSecureFunction<PreviewResponse>('ghl-account-preview', {
      account: acct,
      domains: ALL_DOMAINS,
    }, { timeoutMs: 90000 });
    if (res.error) {
      toast.error(`${acct.toUpperCase()} preview failed: ${res.error.message}`);
      return null;
    }
    if (res.data && !res.data.success) {
      toast.error(`${acct.toUpperCase()}: ${res.data.error || 'Preview failed'}`);
      return res.data;
    }
    return res.data;
  };

  const handleFetch = async () => {
    setLoading(true);
    try {
      if (view === 'compare') {
        const [newD, legD] = await Promise.all([runPreview('new'), runPreview('legacy')]);
        setData(newD);
        setLegacyData(legD);
        if (newD?.success && legD?.success) toast.success('Both accounts loaded');
      } else {
        const d = await runPreview(account);
        if (account === 'new') setData(d); else setLegacyData(d);
        if (d?.success) toast.success(`${account.toUpperCase()} account loaded`);
      }
    } finally {
      setLoading(false);
    }
  };

  const activeData = view === 'compare' ? data : (account === 'new' ? data : legacyData);
  const activeLegacy = view === 'compare' ? legacyData : null;

  if (authLoading) return <div className="p-8"><Skeleton className="h-32" /></div>;
  if (!isSuperadmin) return null;

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">GHL Account Migration</h1>
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              Superadmin
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Phase 2A — Read-only preview of legacy and new GoHighLevel accounts. No writes will occur.
          </p>
        </div>
      </div>

      {/* Read-only banner */}
      <Alert className="border-warning/40 bg-warning/5">
        <ShieldAlert className="h-4 w-4 text-warning" />
        <AlertTitle className="text-warning">READ-ONLY MODE</AlertTitle>
        <AlertDescription className="text-xs text-warning/80">
          This page only fetches counts and small samples directly from GoHighLevel.
          No data is written to either GHL account or to the dashboard database.
          Existing webhooks and syncs against the legacy account remain unchanged.
        </AlertDescription>
      </Alert>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={view} onValueChange={(v) => setView(v as any)} className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <TabsList>
                <TabsTrigger value="single" className="gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Single account
                </TabsTrigger>
                <TabsTrigger value="compare" className="gap-2">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Side-by-side
                </TabsTrigger>
              </TabsList>

              <div className="flex items-end gap-3">
                {view === 'single' && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Account</label>
                    <Select value={account} onValueChange={(v) => setAccount(v as Account)}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="h-4 px-1 text-[10px]">NEW</Badge>
                            <span>New GHL account</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="legacy">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">LEGACY</Badge>
                            <span>Legacy GHL account</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={handleFetch} disabled={loading} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Fetching…' : view === 'compare' ? 'Fetch both' : 'Fetch preview'}
                </Button>
              </div>
            </div>

            <TabsContent value="single" className="mt-0">
              {!activeData && !loading && (
                <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  Select an account and click <span className="font-medium">Fetch preview</span> to see read-only counts & samples.
                </div>
              )}

              {loading && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {ALL_DOMAINS.map((d) => <Skeleton key={d} className="h-44" />)}
                </div>
              )}

              {activeData && !loading && (
                <>
                  <AccountSummary data={activeData} />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {ALL_DOMAINS.map((d) => (
                      <PreviewCard
                        key={d}
                        result={activeData.results.find((r) => r.domain === d)}
                        account={activeData.account}
                      />
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="compare" className="mt-0 space-y-4">
              {!data && !legacyData && !loading && (
                <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  Click <span className="font-medium">Fetch both</span> to load Legacy and New side-by-side.
                </div>
              )}

              {loading && <Skeleton className="h-96" />}

              {(data || legacyData) && !loading && (
                <CompareTable newData={data} legacyData={legacyData} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Phase 2B preview */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />
            What happens next (Phase 2B)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="ml-4 list-disc space-y-1">
            <li>Worker edge functions to mirror Contacts → New (with ID mapping in <code>ghl_id_mapping</code>)</li>
            <li>Recreate Opportunities into the New account using exact stage-name matching</li>
            <li>Backfill Notes against newly mirrored contacts</li>
            <li>Re-pull Conversations against the chosen account into <code>ghl_conversations</code></li>
            <li>All writes gated by typed <code>MIGRATE</code> confirmation and audited via a <code>migration_jobs</code> table</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountSummary({ data }: { data: PreviewResponse }) {
  const loc = data.results.find((r) => r.domain === 'location');
  const accountName = (loc?.sample[0] as any)?.name || loc?.meta?.account_name;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
      <CheckCircle2 className="h-4 w-4 text-success" />
      <div>
        <span className="text-muted-foreground">Account:</span>{' '}
        <Badge variant={data.account === 'new' ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px] uppercase">
          {data.account}
        </Badge>
      </div>
      {accountName && (
        <div>
          <span className="text-muted-foreground">Name:</span> <span className="font-medium">{accountName}</span>
        </div>
      )}
      <div>
        <span className="text-muted-foreground">Location ID:</span>{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{data.location_id}</code>
      </div>
      <div className="ml-auto text-muted-foreground">
        Fetched {new Date(data.fetched_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function CompareTable({
  newData,
  legacyData,
}: {
  newData: PreviewResponse | null;
  legacyData: PreviewResponse | null;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-3 text-left font-medium">Domain</th>
            <th className="p-3 text-right font-medium">
              <Badge variant="secondary" className="text-[10px]">LEGACY</Badge>
            </th>
            <th className="p-3 text-right font-medium">
              <Badge variant="default" className="text-[10px]">NEW</Badge>
            </th>
            <th className="p-3 text-right font-medium">Δ Gap</th>
          </tr>
        </thead>
        <tbody>
          {ALL_DOMAINS.map((d) => {
            const meta = DOMAIN_META[d];
            const Icon = meta.icon;
            const lc = legacyData?.results.find((r) => r.domain === d)?.count;
            const nc = newData?.results.find((r) => r.domain === d)?.count;
            const gap = (lc !== null && lc !== undefined && nc !== null && nc !== undefined) ? lc - nc : null;
            return (
              <tr key={d} className="border-t border-border/40">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{meta.label}</span>
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums">{fmtCount(lc ?? null)}</td>
                <td className="p-3 text-right tabular-nums">{fmtCount(nc ?? null)}</td>
                <td className="p-3 text-right tabular-nums">
                  {gap === null ? '—' : (
                    <span className={gap > 0 ? 'text-warning' : gap < 0 ? 'text-success' : 'text-muted-foreground'}>
                      {gap > 0 ? '+' : ''}{gap.toLocaleString()}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border/40 bg-muted/20 p-2 text-[11px] text-muted-foreground">
        Δ Gap = LEGACY − NEW. Positive = records still to migrate. Counts of <code>—</code> mean the API didn't return a total (e.g. notes).
      </div>
    </div>
  );
}
