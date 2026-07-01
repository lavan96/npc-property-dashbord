/**
 * Finance Portal — Admin Analytics Dashboard (Phase 6B)
 * KPI cards, daily activity chart, top partner activity, action breakdown,
 * and audit log search powered by finance_portal_activity_log.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import {
  Activity, Users, MessageSquare, FileText, RefreshCw, Loader2,
  TrendingUp, Search, ShieldCheck, Mail, BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, BarChart, Bar, Legend,
} from 'recharts';
import { Link } from 'react-router-dom';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';

interface DailyPoint {
  date: string;
  logins: number;
  doc_uploads: number;
  messages: number;
  bc_views: number;
  total: number;
}

interface TopUser {
  finance_user_id: string;
  events: number;
  last_activity: string | null;
  name?: string;
  email?: string;
}

interface AnalyticsData {
  kpis: {
    active_users: number;
    invited_users: number;
    revoked_users: number;
    total_users: number;
    total_assignments: number;
    auto_linked_assignments: number;
    active_threads: number;
    unread_messages_staff: number;
    total_events_period: number;
    doc_uploads_period: number;
    doc_total_bytes_period: number;
  };
  daily: DailyPoint[];
  action_counts: Record<string, number>;
  top_users: TopUser[];
  window_days: number;
}

interface AuditEntry {
  id: string;
  finance_user_id: string | null;
  client_id: string | null;
  actor_user_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  ip_address: string | null;
  created_at: string;
}

const ACTION_TONE: Record<string, string> = {
  login_success: 'text-success',
  login_failed: 'text-destructive',
  logout: 'text-muted-foreground',
  document_uploaded: 'text-primary',
  document_deleted: 'text-destructive',
  message_sent: 'text-primary',
  invite_sent: 'text-primary',
  invite_accepted: 'text-success',
  access_revoked: 'text-destructive',
  access_reinstated: 'text-success',
};

function formatBytes(b: number): string {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function FinancePortalAnalytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState<string>('30');

  const [auditLoading, setAuditLoading] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState<string>('all');

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await invokeSecureFunction('finance-portal-admin', {
        operation: 'get_analytics',
        days,
      });
      if (error) throw new Error(error.message);
      setData(res as AnalyticsData);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const { data: res, error } = await invokeSecureFunction('finance-portal-admin', {
        operation: 'get_activity_log',
        limit: 500,
        action_filter: auditAction === 'all' ? undefined : auditAction,
        search: auditSearch || undefined,
      });
      if (error) throw new Error(error.message);
      setAudit(res?.records || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load audit log');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => { void loadAnalytics(); }, [days]);
  useEffect(() => { void loadAudit(); }, []);

  const actionList = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.action_counts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [data]);

  return (
    <DashboardThemeFrame variant="page" className="space-y-6 p-4 sm:p-6">
      <DashboardThemeFrame variant="hero" as="header" className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Finance Portal Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregate activity, engagement, and audit insight across all finance partners.
          </p>
        </div>
        <DashboardThemeFrame variant="toolbar" className="md:w-auto">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadAnalytics} className="gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/finance-portal">Manage Users</Link>
          </Button>
        </DashboardThemeFrame>
      </DashboardThemeFrame>

      {loading || !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={<Users className="h-4 w-4" />} label="Active Partners" value={data.kpis.active_users} subtitle={`${data.kpis.invited_users} invited · ${data.kpis.revoked_users} revoked`} />
            <KpiCard icon={<ShieldCheck className="h-4 w-4" />} label="Client Assignments" value={data.kpis.total_assignments} subtitle={`${data.kpis.auto_linked_assignments} auto-linked`} />
            <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="Active Threads" value={data.kpis.active_threads} subtitle={`${data.kpis.unread_messages_staff} unread for staff`} tone={data.kpis.unread_messages_staff > 0 ? 'warning' : 'default'} />
            <KpiCard icon={<FileText className="h-4 w-4" />} label="Docs Uploaded" value={data.kpis.doc_uploads_period} subtitle={formatBytes(data.kpis.doc_total_bytes_period)} />
          </div>

          <Tabs defaultValue="activity" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-muted/60 p-1 sm:w-auto">
              <TabsTrigger value="activity"><Activity className="h-4 w-4 mr-2" />Activity</TabsTrigger>
              <TabsTrigger value="partners"><Users className="h-4 w-4 mr-2" />Top Partners</TabsTrigger>
              <TabsTrigger value="actions"><TrendingUp className="h-4 w-4 mr-2" />Action Breakdown</TabsTrigger>
              <TabsTrigger value="audit"><Search className="h-4 w-4 mr-2" />Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-4">
              <DashboardThemeFrame variant="chartCard" className="p-0">
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <CardTitle>Daily Engagement</CardTitle>
                  <CardDescription>Logins, document uploads, messages, and BC reviews over the selected window.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.daily}>
                        <defs>
                          <linearGradient id="gLogins" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gDocs" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => v.slice(5)} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                        <RTooltip
                          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="logins" stroke="hsl(var(--primary))" fill="url(#gLogins)" name="Logins" />
                        <Area type="monotone" dataKey="doc_uploads" stroke="hsl(var(--success))" fill="url(#gDocs)" name="Doc Uploads" />
                        <Area type="monotone" dataKey="messages" stroke="hsl(var(--warning))" fill="url(#gMsg)" name="Messages" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              </DashboardThemeFrame>
              <DashboardThemeFrame variant="chartCard" className="p-0">
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <CardTitle>Total Events / Day</CardTitle>
                  <CardDescription>Sum of all audited finance portal events.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => v.slice(5)} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                        <RTooltip
                          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              </DashboardThemeFrame>
            </TabsContent>

            <TabsContent value="partners">
              <DashboardThemeFrame variant="section" className="p-0">
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <CardTitle>Most Active Partners</CardTitle>
                  <CardDescription>Top 10 finance partners by audited event count over the window.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/70"><Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">Events</TableHead>
                        <TableHead>Last Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.top_users.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8 text-sm">No partner activity in this window.</TableCell></TableRow>
                      )}
                      {data.top_users.map(u => (
                        <TableRow key={u.finance_user_id}>
                          <TableCell>
                            <div className="font-medium">{u.name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{u.events}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {u.last_activity ? format(new Date(u.last_activity), 'MMM d, yyyy HH:mm') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                </CardContent>
              </Card>
              </DashboardThemeFrame>
            </TabsContent>

            <TabsContent value="actions">
              <DashboardThemeFrame variant="chartCard" className="p-0">
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader>
                  <CardTitle>Action Frequency</CardTitle>
                  <CardDescription>Breakdown of audit actions over the selected window.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={actionList} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                        <YAxis type="category" dataKey="action" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} />
                        <RTooltip
                          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              </DashboardThemeFrame>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <DashboardThemeFrame variant="section" className="p-0">
              <Card className="border-0 bg-transparent shadow-none">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Audit Log Search</CardTitle>
                    <CardDescription>Search across actions, entity types, and metadata.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={auditSearch}
                        onChange={e => setAuditSearch(e.target.value)}
                        placeholder="Search action / entity / metadata..."
                        className="h-9 w-full min-w-0 pl-8 sm:w-72"
                        onKeyDown={e => e.key === 'Enter' && loadAudit()}
                      />
                    </div>
                    <Select value={auditAction} onValueChange={setAuditAction}>
                      <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        {Object.keys(data.action_counts).sort().map(a => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={loadAudit} disabled={auditLoading} className="gap-2 h-9">
                      {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Search
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/70">
                    <Table className="min-w-[840px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {audit.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">No audit records.</TableCell></TableRow>
                        )}
                        {audit.map(a => (
                          <TableRow key={a.id} className="transition-colors hover:bg-muted/35">
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(a.created_at), 'MMM d, HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] capitalize">{a.actor_type}</Badge>
                            </TableCell>
                            <TableCell className={`max-w-[220px] truncate text-sm font-medium ${ACTION_TONE[a.action] || ''}`} title={a.action}>
                              {a.action}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.entity_type || '—'}
                              {a.entity_id && <span className="ml-1 font-mono">{a.entity_id.slice(0, 8)}</span>}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground font-mono" title={a.ip_address || '—'}>{a.ip_address || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              </DashboardThemeFrame>
            </TabsContent>
          </Tabs>
        </>
      )}
    </DashboardThemeFrame>
  );
}

function KpiCard({
  icon, label, value, subtitle, tone = 'default',
}: {
  icon: React.ReactNode; label: string; value: number; subtitle?: string;
  tone?: 'default' | 'warning' | 'success' | 'destructive';
}) {
  const toneCls = {
    default:     'text-foreground',
    warning:     'text-warning',
    success:     'text-success',
    destructive: 'text-destructive',
  }[tone];
  return (
    <DashboardThemeFrame variant="premiumCard">
      <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            {icon}{label}
          </div>
        </div>
        <div className={`text-2xl font-bold mt-2 ${toneCls}`}>{value.toLocaleString()}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
    </DashboardThemeFrame>
  );
}
