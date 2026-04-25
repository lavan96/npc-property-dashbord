import React, { useEffect, useState } from 'react';
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
  KeyRound, ExternalLink, XCircle, Download, Play, Repeat,
} from 'lucide-react';

interface ScopeProbe {
  scope: string;
  required_for: string[];
  ok: boolean;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  endpoint: string;
  method: string;
}
interface CredentialAudit {
  account: 'legacy' | 'new';
  token_kind: string;
  token_type_hint: string;
  token_format: string;
  has_location_id: boolean;
  location_id_matches_secret: boolean | null;
  expires_at: string | null;
  exchange_attempted: boolean;
  exchange_succeeded: boolean | null;
  exchange_error: string | null;
  scope_probes: ScopeProbe[];
  required_scopes_ok: boolean;
  missing_scopes: string[];
  documentation_url: string;
}

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

      {/* Phase 2B — Migration workers */}
      <MigrationWorkersPanel />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2B: Worker dispatch + job monitor
// ────────────────────────────────────────────────────────────────────────────
function MigrationWorkersPanel() {
  const [domain, setDomain] = useState<'contacts' | 'opportunities' | 'conversations' | 'notes'>('contacts');
  const [source, setSource] = useState<Account>('legacy');
  const [target, setTarget] = useState<Account>('new');
  const [dryRun, setDryRun] = useState(true);
  const [maxItems, setMaxItems] = useState<string>('25');
  const [confirmation, setConfirmation] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [audit, setAudit] = useState<CredentialAudit | null>(null);
  const [testingAudit, setTestingAudit] = useState(false);
  const [auditAccount, setAuditAccount] = useState<Account>('new');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const testCredentials = async (acct: Account) => {
    setTestingAudit(true);
    setAuditAccount(acct);
    try {
      const res = await invokeSecureFunction<{ success: boolean; audit: CredentialAudit; error?: string }>(
        'ghl-test-credentials', { account: acct }, { timeoutMs: 60000 },
      );
      if (res.error || !res.data?.success) {
        toast.error(res.error?.message || res.data?.error || 'Credential test failed');
        setAudit(null);
      } else {
        setAudit(res.data.audit);
        if (res.data.audit.required_scopes_ok) toast.success(`${acct.toUpperCase()} token: all scopes OK`);
        else toast.error(`${acct.toUpperCase()} token missing: ${res.data.audit.missing_scopes.join(', ')}`);
      }
    } finally { setTestingAudit(false); }
  };

  const refreshJobs = async () => {
    setLoadingJobs(true);
    try {
      const res = await invokeSecureFunction<{ success: boolean; jobs: any[] }>(
        'migration-job-status',
        { list: true, limit: 15 },
        { timeoutMs: 15000 },
      );
      if (res.data?.success) setJobs(res.data.jobs);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => { refreshJobs(); }, []);
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'processing');
    if (!hasActive) return;
    const id = setInterval(refreshJobs, 4000);
    return () => clearInterval(id);
  }, [jobs]);

  const dispatch = async () => {
    if (source === target) {
      toast.error('Source and target must differ'); return;
    }
    if (!dryRun && confirmation !== 'MIGRATE-LIVE') {
      toast.error('Type MIGRATE-LIVE to confirm live writes'); return;
    }
    setDispatching(true);
    try {
      const max = parseInt(maxItems, 10);
      const res = await invokeSecureFunction<any>('migration-orchestrator', {
        domain, source_account: source, target_account: target, dry_run: dryRun,
        confirmation: dryRun ? undefined : 'MIGRATE-LIVE',
        payload: max > 0 ? { max_items: max } : {},
      }, { timeoutMs: 30000 });
      if (res.error || !res.data?.success) {
        toast.error(res.error?.message || res.data?.error || 'Dispatch failed');
      } else {
        toast.success(`Job ${res.data.job_id.substring(0, 8)} dispatched`);
        setConfirmation('');
        setTimeout(refreshJobs, 1000);
      }
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Phase 2B — Migration Workers
          <Badge variant="outline" className="ml-2 text-[10px]">DISPATCH & MONITOR</Badge>
        </CardTitle>
        <CardDescription>
          Kick off background workers to mirror Contacts/Opportunities/Notes into the target account,
          or to re-sync Conversations from the chosen account into our local mirror.
          Default is dry-run. Live writes require typing <code className="rounded bg-muted px-1">MIGRATE-LIVE</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Credential audit panel */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Token preflight</h3>
              <Badge variant="outline" className="text-[10px]">Required for LIVE</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => testCredentials('legacy')} disabled={testingAudit} className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                Test LEGACY
              </Button>
              <Button size="sm" variant="default" onClick={() => testCredentials('new')} disabled={testingAudit} className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                Test NEW
              </Button>
            </div>
          </div>
          {!audit && (
            <p className="text-[11px] text-muted-foreground">
              Click <strong>Test NEW</strong> to verify the configured token has the contacts/opportunities/notes scopes
              required for live writes. Live dispatch will be blocked until all required scopes pass.
            </p>
          )}
          {audit && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge variant={auditAccount === 'new' ? 'default' : 'secondary'} className="text-[10px] uppercase">{audit.account}</Badge>
                <Badge variant="outline" className="text-[10px]">kind: {audit.token_kind}</Badge>
                <Badge variant="outline" className="text-[10px]">hint: {audit.token_type_hint}</Badge>
                {audit.exchange_attempted && (
                  <Badge variant={audit.exchange_succeeded ? 'default' : 'destructive'} className="text-[10px]">
                    exchange: {audit.exchange_succeeded ? 'ok' : 'failed'}
                  </Badge>
                )}
                {audit.location_id_matches_secret === false && (
                  <Badge variant="destructive" className="text-[10px]">locationId mismatch</Badge>
                )}
                <a href={audit.documentation_url} target="_blank" rel="noreferrer"
                   className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                  Required scopes <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="overflow-hidden rounded border border-border/40">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 uppercase text-muted-foreground">
                    <tr>
                      <th className="p-1.5 text-left">Scope</th>
                      <th className="p-1.5 text-left">Endpoint</th>
                      <th className="p-1.5 text-left">Status</th>
                      <th className="p-1.5 text-left">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.scope_probes.map((p) => (
                      <tr key={p.scope} className="border-t border-border/30">
                        <td className="p-1.5 font-mono text-[10px]">{p.scope}</td>
                        <td className="p-1.5 font-mono text-[10px] text-muted-foreground">{p.method} {p.endpoint}</td>
                        <td className="p-1.5">
                          {p.ok ? (
                            <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" />OK</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3 w-3" />{p.http_status || 'ERR'}</span>
                          )}
                        </td>
                        <td className="p-1.5 text-muted-foreground">
                          {p.ok ? '—' : `[${p.error_code || 'ERR'}] ${p.error_message || ''}`.substring(0, 120)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!audit.required_scopes_ok && (
                <Alert className="border-destructive/40 bg-destructive/5 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <AlertDescription className="text-[11px] text-destructive">
                    Missing required scopes: <code>{audit.missing_scopes.join(', ')}</code>.
                    Generate a new sub-account/PIT token with these scopes before running live jobs.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        {/* Dispatch form */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Domain</label>
            <Select value={domain} onValueChange={(v) => setDomain(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contacts">Contacts</SelectItem>
                <SelectItem value="opportunities">Opportunities</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="conversations">Conversations (read-only mirror)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Source</label>
            <Select value={source} onValueChange={(v) => setSource(v as Account)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="legacy">LEGACY</SelectItem>
                <SelectItem value="new">NEW</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Target</label>
            <Select value={target} onValueChange={(v) => setTarget(v as Account)} disabled={domain === 'conversations'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">NEW</SelectItem>
                <SelectItem value="legacy">LEGACY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Max items (0 = all)</label>
            <input
              type="number" min={0} value={maxItems}
              onChange={(e) => setMaxItems(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mode</label>
            <Select value={dryRun ? 'dry' : 'live'} onValueChange={(v) => setDryRun(v === 'dry')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dry">DRY RUN (safe)</SelectItem>
                <SelectItem value="live">LIVE (writes!)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!dryRun && (
          <Alert className="border-destructive/40 bg-destructive/5">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <AlertTitle className="text-destructive">LIVE MODE</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <div>This will write data to the {target.toUpperCase()} GoHighLevel account. Type <code className="rounded bg-muted px-1">MIGRATE-LIVE</code> to enable the dispatch button.</div>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="MIGRATE-LIVE"
                className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
              />
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={dispatch}
          disabled={dispatching || (!dryRun && confirmation !== 'MIGRATE-LIVE')}
          variant={dryRun ? 'default' : 'destructive'}
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          {dispatching ? 'Dispatching…' : dryRun ? 'Dispatch dry-run job' : 'Dispatch LIVE job'}
        </Button>

        {/* Recent jobs */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent jobs</h3>
            <Button size="sm" variant="ghost" onClick={refreshJobs} disabled={loadingJobs} className="gap-1">
              <RefreshCw className={`h-3 w-3 ${loadingJobs ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {jobs.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No jobs yet. Dispatch one above to see it appear here.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">When</th>
                    <th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Direction</th>
                    <th className="p-2 text-left">Mode</th>
                    <th className="p-2 text-right">Progress</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const pct = j.total_items > 0 ? Math.round((j.processed_items / j.total_items) * 100) : 0;
                    const isOpen = expandedJobId === j.id;
                    return (
                      <React.Fragment key={j.id}>
                        <tr className="border-t border-border/40 cursor-pointer hover:bg-muted/30"
                            onClick={() => setExpandedJobId(isOpen ? null : j.id)}>
                          <td className="p-2 text-muted-foreground">{new Date(j.created_at).toLocaleTimeString()}</td>
                          <td className="p-2 font-medium">{j.domain}</td>
                          <td className="p-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{j.source_account}</span>
                            <span className="mx-1 text-muted-foreground">→</span>
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase">{j.target_account}</span>
                          </td>
                          <td className="p-2">
                            <Badge variant={j.dry_run ? 'secondary' : 'destructive'} className="text-[10px]">
                              {j.dry_run ? 'DRY' : 'LIVE'}
                            </Badge>
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {j.processed_items}/{j.total_items || '?'}
                            <span className="ml-1 text-muted-foreground">({pct}%)</span>
                            <div className="text-[10px] text-muted-foreground">
                              ✓ {j.succeeded_items} · ✗ {j.failed_items}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={
                                j.status === 'completed' ? 'default' :
                                j.status === 'failed' ? 'destructive' :
                                j.status === 'processing' ? 'secondary' : 'outline'
                              } className="text-[10px] uppercase">
                                {j.status}
                              </Badge>
                              {(j.dispatch_count ?? 0) > 0 && (
                                <Badge variant="outline" className="gap-1 text-[10px]" title={`Worker invocations: ${j.dispatch_count}`}>
                                  <Repeat className="h-2.5 w-2.5" />
                                  ×{j.dispatch_count}
                                </Badge>
                              )}
                            </div>
                            {j.error_summary && (
                              <div className="mt-1 max-w-xs truncate text-[10px] text-destructive" title={j.error_summary}>
                                {j.error_summary}
                              </div>
                            )}
                          </td>
                        </tr>
                        {isOpen && <JobDetailRow job={j} onChanged={refreshJobs} />}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Recommended order: <strong>Contacts</strong> first → <strong>Opportunities</strong> &amp; <strong>Notes</strong> next (they require contact ID mappings).
            <strong> Conversations</strong> is a one-way read-only mirror into our DB.
          </p>
        </div>
      </CardContent>
    </Card>
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

// ────────────────────────────────────────────────────────────────────────────
// Expandable per-job audit / items row
// ────────────────────────────────────────────────────────────────────────────
function JobDetailRow({ job, onChanged }: { job: any; onChanged?: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [errorCategories, setErrorCategories] = useState<Record<string, number>>({});
  const [retryableFailures, setRetryableFailures] = useState(0);
  const [nonRetryableFailures, setNonRetryableFailures] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [redispatching, setRedispatching] = useState(false);

  const [liveJob, setLiveJob] = useState<any>(job);

  useEffect(() => { setLiveJob(job); }, [job]);

  const fetchStatus = async () => {
    const res = await invokeSecureFunction<any>(
      'migration-job-status', { job_id: job.id }, { timeoutMs: 15000 },
    );
    if (res.data?.success) {
      setItems(res.data?.items || res.data?.recent_items || []);
      setBreakdown(res.data?.breakdown || {});
      setErrorCategories(res.data?.error_categories || {});
      setRetryableFailures(res.data?.retryable_failures || 0);
      setNonRetryableFailures(res.data?.non_retryable_failures || 0);
      if (res.data?.job) setLiveJob(res.data.job);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => { if (!cancelled) await fetchStatus(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // Live-poll while job is active
  useEffect(() => {
    const active = liveJob?.status === 'pending' || liveJob?.status === 'processing';
    if (!active) return;
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveJob?.status, job.id]);

  const tokenAudit = liveJob.payload?.token_audit;
  const failed = items.filter((i) => i.status === 'failed');
  const skipped = items.filter((i) => i.status === 'skipped');

  // Best-effort cursor formatting — workers each persist their own shape
  const cursor = liveJob.resume_cursor || {};
  const cursorEntries = Object.entries(cursor).filter(([, v]) => v !== null && v !== undefined && v !== '');
  const lastSourceId: string | null = liveJob.last_processed_source_id || null;
  const lastDispatchedAt: string | null = liveJob.last_dispatched_at || null;
  const dispatchCount: number = liveJob.dispatch_count ?? 0;

  const downloadFailedCsv = async () => {
    setDownloading(true);
    try {
      const res = await invokeSecureFunction<any>(
        'migration-job-status',
        { job_id: job.id, include_failed_items: true },
        { timeoutMs: 60000 },
      );
      const rows: any[] = res.data?.failed_items || [];
      if (rows.length === 0) {
        toast.info('No failed items to export');
        return;
      }
      const headers = ['source_id', 'target_id', 'entity_label', 'error_category', 'is_retryable', 'attempts', 'processed_at', 'error_message'];
      const escape = (v: any) => {
        if (v === null || v === undefined) return '';
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration-${job.domain}-${job.id.substring(0, 8)}-failed.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} failed item${rows.length === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e?.message || 'CSV export failed');
    } finally {
      setDownloading(false);
    }
  };

  const manualRedispatch = async () => {
    setRedispatching(true);
    try {
      const res = await invokeSecureFunction<any>('migration-orchestrator', {
        domain: job.domain,
        source_account: job.source_account,
        target_account: job.target_account,
        dry_run: job.dry_run,
        confirmation: job.dry_run ? undefined : 'MIGRATE-LIVE',
        payload: { ...(job.payload || {}), resume_job_id: job.id },
        skip_preflight: true,
      }, { timeoutMs: 30000 });
      if (res.error || !res.data?.success) {
        toast.error(res.error?.message || res.data?.error || 'Re-dispatch failed');
      } else {
        toast.success('Re-dispatch queued');
        onChanged?.();
      }
    } finally {
      setRedispatching(false);
    }
  };

  const canRedispatch = liveJob.status === 'failed' || liveJob.status === 'cancelled' ||
    (liveJob.status === 'processing' && dispatchCount > 0 &&
     lastDispatchedAt && (Date.now() - new Date(lastDispatchedAt).getTime() > 5 * 60_000));

  return (
    <tr className="border-t border-border/40 bg-muted/10">
      <td colSpan={6} className="p-3">
        <div className="space-y-3">
          {/* Action toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={downloadFailedCsv}
              disabled={downloading || (breakdown.failed || 0) === 0}
              className="gap-1 h-7 text-[11px]"
            >
              <Download className="h-3 w-3" />
              {downloading ? 'Exporting…' : `Export failed (${breakdown.failed || 0})`}
            </Button>
            {canRedispatch && (
              <Button
                size="sm"
                variant="default"
                onClick={manualRedispatch}
                disabled={redispatching}
                className="gap-1 h-7 text-[11px]"
              >
                <Play className="h-3 w-3" />
                {redispatching ? 'Re-dispatching…' : 'Re-dispatch'}
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[10px]">
              {(job.dispatch_count ?? 0) > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Repeat className="h-2.5 w-2.5" />
                  {job.dispatch_count} dispatch{job.dispatch_count === 1 ? '' : 'es'}
                </Badge>
              )}
              {retryableFailures > 0 && (
                <Badge variant="secondary" title="Failures that may succeed on retry (rate limits, server, network)">
                  {retryableFailures} retryable
                </Badge>
              )}
              {nonRetryableFailures > 0 && (
                <Badge variant="destructive" title="Failures requiring user action (auth, validation, conflict)">
                  {nonRetryableFailures} blocked
                </Badge>
              )}
            </div>
          </div>

          {/* Error category breakdown */}
          {Object.keys(errorCategories).length > 0 && (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
              <div className="mb-1 font-semibold text-destructive">Failures by category</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(errorCategories).map(([cat, n]) => (
                  <Badge key={cat} variant="outline" className="text-[10px] font-mono">
                    {cat}: {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {tokenAudit && (
            <div className="rounded border border-border/40 bg-background/40 p-2 text-[11px]">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <KeyRound className="h-3 w-3 text-primary" />
                Run-level token audit
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 md:grid-cols-4">
                <div><span className="text-muted-foreground">kind:</span> {tokenAudit.token_kind || '—'}</div>
                <div><span className="text-muted-foreground">hint:</span> {tokenAudit.token_type_hint || '—'}</div>
                <div><span className="text-muted-foreground">scopes ok:</span>{' '}
                  {tokenAudit.required_scopes_ok
                    ? <span className="text-success">yes</span>
                    : <span className="text-destructive">no</span>}
                </div>
                <div><span className="text-muted-foreground">missing:</span>{' '}
                  <code>{(tokenAudit.missing_scopes || []).join(',') || 'none'}</code>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <Skeleton className="h-20" />
          ) : items.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No items recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {failed.length > 0 && (
                <details open className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
                  <summary className="cursor-pointer font-semibold text-destructive">
                    Recent failed items ({failed.length})
                  </summary>
                  <div className="mt-2 max-h-64 space-y-1 overflow-auto">
                    {failed.map((it, i) => {
                      const cat = it.error_category || 'unknown';
                      const retryable = it.is_retryable;
                      return (
                        <div key={i} className="rounded bg-background/60 p-1.5 font-mono text-[10px]">
                          <div className="flex items-center gap-2">
                            <Badge variant={retryable ? 'secondary' : 'destructive'} className="text-[10px]">
                              {cat}
                            </Badge>
                            <span className="font-sans font-medium">{it.entity_label || it.source_id}</span>
                            {retryable && <span className="font-sans text-[9px] text-muted-foreground">retryable</span>}
                          </div>
                          <div className="mt-0.5 break-words text-muted-foreground">{it.error_message}</div>
                          {cat === 'auth' && (
                            <a href="https://highlevel.stoplight.io/docs/integrations/0443d7d1a4bd0-overview"
                               target="_blank" rel="noreferrer"
                               className="mt-0.5 inline-flex items-center gap-1 font-sans text-primary hover:underline">
                              View required scopes <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
              {skipped.length > 0 && (
                <details className="rounded border border-border/40 bg-muted/30 p-2 text-[11px]">
                  <summary className="cursor-pointer font-semibold">Skipped items ({skipped.length})</summary>
                  <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                    {skipped.map((it, i) => (
                      <div key={i} className="rounded bg-background/60 p-1.5 text-[10px]">
                        <span className="font-medium">{it.entity_label || it.source_id}</span>
                        <span className="ml-2 text-muted-foreground">{it.error_message}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="text-[10px] text-muted-foreground">
                Showing the most recent {items.length} items. Use <strong>Export failed</strong> for the full list.
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
