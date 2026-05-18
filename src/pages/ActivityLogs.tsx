import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useSecureActivityLogs, ActivityLog } from '@/hooks/useSecureActivityLogs';
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import {
  Activity, Search, RefreshCw, User, FileText, LogIn, LogOut,
  GitCompare, Mail, Phone, MessageSquare, Settings, Zap, Palette,
  Download, Filter, X, Users, Handshake, FileUp, StickyNote, Tag,
  CalendarIcon, ClipboardCheck, DatabaseIcon, ChevronLeft, ChevronRight,
  ExternalLink, Copy,
} from 'lucide-react';

type ActionTone = 'success' | 'warning' | 'destructive' | 'info' | 'accent' | 'neutral';

const TONE_CLASSES: Record<ActionTone, string> = {
  success: 'dashboard-status-chip dashboard-status-chip-success',
  warning: 'dashboard-status-chip dashboard-status-chip-warning',
  destructive: 'dashboard-status-chip dashboard-status-chip-destructive',
  info: 'dashboard-status-chip dashboard-status-chip-info',
  accent: 'dashboard-status-chip dashboard-status-chip-accent',
  neutral: 'dashboard-status-chip dashboard-status-chip-neutral',
};

const SEVERITY_BAR: Record<ActionTone, string> = {
  success: 'bg-success/70',
  warning: 'bg-warning/70',
  destructive: 'bg-destructive/70',
  info: 'bg-primary/60',
  accent: 'bg-accent/70',
  neutral: 'bg-muted-foreground/40',
};

const ACTION_TYPE_LABELS: Record<string, { label: string; tone: ActionTone }> = {
  // Auth
  login: { label: 'Login', tone: 'success' },
  logout: { label: 'Logout', tone: 'neutral' },
  // Reports
  report_generated: { label: 'Report Generated', tone: 'success' },
  report_regenerated: { label: 'Report Regenerated', tone: 'info' },
  report_viewed: { label: 'Report Viewed', tone: 'neutral' },
  report_edited: { label: 'Report Edited', tone: 'info' },
  report_archived: { label: 'Report Archived', tone: 'warning' },
  report_deleted: { label: 'Report Deleted', tone: 'destructive' },
  report_pdf_downloaded: { label: 'PDF Downloaded', tone: 'accent' },
  report_shared: { label: 'Report Shared', tone: 'info' },
  manual_override_applied: { label: 'Override Applied', tone: 'warning' },
  // Comparisons
  comparison_created: { label: 'Comparison Created', tone: 'success' },
  comparison_viewed: { label: 'Comparison Viewed', tone: 'neutral' },
  comparison_deleted: { label: 'Comparison Deleted', tone: 'destructive' },
  // Cash flow
  cash_flow_created: { label: 'Cash Flow Created', tone: 'success' },
  cash_flow_updated: { label: 'Cash Flow Updated', tone: 'info' },
  cash_flow_deleted: { label: 'Cash Flow Deleted', tone: 'destructive' },
  // Email
  email_read: { label: 'Email Read', tone: 'neutral' },
  email_reply_generated: { label: 'Reply Generated', tone: 'info' },
  email_reply_sent: { label: 'Reply Sent', tone: 'success' },
  email_linked_to_report: { label: 'Email Linked', tone: 'info' },
  // Calls
  call_tagged: { label: 'Call Tagged', tone: 'accent' },
  alert_rule_created: { label: 'Alert Created', tone: 'info' },
  alert_rule_updated: { label: 'Alert Updated', tone: 'info' },
  alert_rule_deleted: { label: 'Alert Deleted', tone: 'destructive' },
  weekly_report_config_changed: { label: 'Config Changed', tone: 'neutral' },
  // QA
  qa_conversation_created: { label: 'QA Started', tone: 'info' },
  qa_question_asked: { label: 'Question Asked', tone: 'neutral' },
  qa_conversation_deleted: { label: 'QA Deleted', tone: 'destructive' },
  // Automation
  automation_switch_created: { label: 'Switch Created', tone: 'success' },
  automation_switch_enabled: { label: 'Switch Enabled', tone: 'success' },
  automation_switch_disabled: { label: 'Switch Disabled', tone: 'warning' },
  automation_switch_deleted: { label: 'Switch Deleted', tone: 'destructive' },
  automation_master_toggle_changed: { label: 'Master Toggle', tone: 'warning' },
  // Templates
  template_uploaded: { label: 'Template Uploaded', tone: 'info' },
  template_activated: { label: 'Template Activated', tone: 'success' },
  template_deactivated: { label: 'Template Deactivated', tone: 'warning' },
  template_deleted: { label: 'Template Deleted', tone: 'destructive' },
  branding_profile_created: { label: 'Branding Created', tone: 'accent' },
  branding_profile_updated: { label: 'Branding Updated', tone: 'accent' },
  branding_profile_deleted: { label: 'Branding Deleted', tone: 'destructive' },
  // User management
  user_invited: { label: 'User Invited', tone: 'info' },
  user_permissions_changed: { label: 'Permissions Changed', tone: 'warning' },
  user_deactivated: { label: 'User Deactivated', tone: 'destructive' },
  user_activated: { label: 'User Activated', tone: 'success' },
  password_reset_initiated: { label: 'Password Reset', tone: 'destructive' },
  // White label
  whitelabel_settings_updated: { label: 'Whitelabel Updated', tone: 'accent' },
  whitelabel_logo_changed: { label: 'Logo Changed', tone: 'accent' },
  // Bulk
  bulk_generation_started: { label: 'Bulk Started', tone: 'info' },
  bulk_generation_completed: { label: 'Bulk Completed', tone: 'success' },
  // General
  settings_updated: { label: 'Settings Updated', tone: 'warning' },
  data_exported: { label: 'Data Exported', tone: 'info' },
  // Client management
  client_created: { label: 'Client Created', tone: 'success' },
  client_updated: { label: 'Client Updated', tone: 'info' },
  client_deleted: { label: 'Client Deleted', tone: 'destructive' },
  client_exported: { label: 'Client Exported', tone: 'info' },
  client_file_uploaded: { label: 'File Uploaded', tone: 'info' },
  client_file_deleted: { label: 'File Deleted', tone: 'destructive' },
  client_note_added: { label: 'Note Added', tone: 'info' },
  client_tag_added: { label: 'Tag Added', tone: 'accent' },
  client_tag_removed: { label: 'Tag Removed', tone: 'neutral' },
  // Deal pipeline
  deal_created: { label: 'Deal Created', tone: 'success' },
  deal_updated: { label: 'Deal Updated', tone: 'info' },
  deal_stage_changed: { label: 'Stage Changed', tone: 'accent' },
  deal_deleted: { label: 'Deal Deleted', tone: 'destructive' },
  build_payment_updated: { label: 'Payment Updated', tone: 'info' },
  // Calendar
  appointment_created: { label: 'Appointment Created', tone: 'success' },
  appointment_updated: { label: 'Appointment Updated', tone: 'info' },
  appointment_deleted: { label: 'Appointment Deleted', tone: 'destructive' },
  appointment_rescheduled: { label: 'Appointment Rescheduled', tone: 'warning' },
  // Checklists
  checklist_generated: { label: 'Checklist Generated', tone: 'info' },
  checklist_item_checked: { label: 'Item Checked', tone: 'success' },
  checklist_completed: { label: 'Checklist Completed', tone: 'success' },
  checklist_deleted: { label: 'Checklist Deleted', tone: 'destructive' },
  // Data
  data_imported: { label: 'Data Imported', tone: 'success' },
  // WhiteLabel extended
  whitelabel_logo_uploaded: { label: 'Logo Uploaded', tone: 'accent' },
  whitelabel_logo_removed: { label: 'Logo Removed', tone: 'warning' },
  whitelabel_theme_changed: { label: 'Theme Changed', tone: 'accent' },
  // Reports extended
  comparison_pdf_downloaded: { label: 'Comparison PDF', tone: 'accent' },
  portfolio_report_generated: { label: 'Portfolio Report', tone: 'success' },
};

const ENTITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  investment_report: <FileText className="h-4 w-4" />,
  property_comparison: <GitCompare className="h-4 w-4" />,
  cash_flow_analysis: <Activity className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  call_log: <Phone className="h-4 w-4" />,
  call_alert_rule: <Zap className="h-4 w-4" />,
  qa_conversation: <MessageSquare className="h-4 w-4" />,
  automation_switch: <Settings className="h-4 w-4" />,
  template: <FileText className="h-4 w-4" />,
  branding_profile: <Palette className="h-4 w-4" />,
  user: <User className="h-4 w-4" />,
  whitelabel_settings: <Settings className="h-4 w-4" />,
  bulk_generation_job: <FileText className="h-4 w-4" />,
  session: <LogIn className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
  client: <Users className="h-4 w-4" />,
  deal: <Handshake className="h-4 w-4" />,
  client_file: <FileUp className="h-4 w-4" />,
  client_note: <StickyNote className="h-4 w-4" />,
  appointment: <CalendarIcon className="h-4 w-4" />,
  checklist: <ClipboardCheck className="h-4 w-4" />,
  data_import: <DatabaseIcon className="h-4 w-4" />,
  portfolio_report: <FileText className="h-4 w-4" />,
};

// Resolve an entity to an in-app route. Returns null if no deep-link target.
function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case 'investment_report':
      return entityId ? `/investment-report/${entityId}` : '/reports/analytics';
    case 'property_comparison':
      return '/reports/analytics';
    case 'cash_flow_analysis':
      return '/cash-flow-analysis';
    case 'email':
      return '/email-copilot';
    case 'call_log':
    case 'call_alert_rule':
      return '/call-logs';
    case 'qa_conversation':
      return '/report-qa';
    case 'automation_switch':
      return '/automation';
    case 'template':
      return '/templates';
    case 'branding_profile':
    case 'whitelabel_settings':
      return '/white-label';
    case 'user':
      return '/admin/users';
    case 'client':
    case 'client_file':
    case 'client_note':
      return '/clients';
    case 'deal':
      return '/deal-pipeline';
    case 'appointment':
      return '/calendar';
    case 'checklist':
      return '/checklists';
    case 'data_import':
      return '/data-import';
    case 'portfolio_report':
      return '/portfolio-reports';
    default:
      return null;
  }
}

type DateRangeKey = 'all' | '24h' | '7d' | '30d' | 'custom';
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d, yyyy');
}

export default function ActivityLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const { fetchLogs: secureFetchLogs, loading } = useSecureActivityLogs();

  const { startDateISO, endDateISO } = useMemo(() => {
    const now = new Date();
    if (dateRange === 'all') return { startDateISO: undefined, endDateISO: undefined };
    if (dateRange === '24h') return { startDateISO: subDays(now, 1).toISOString(), endDateISO: undefined };
    if (dateRange === '7d') return { startDateISO: subDays(now, 7).toISOString(), endDateISO: undefined };
    if (dateRange === '30d') return { startDateISO: subDays(now, 30).toISOString(), endDateISO: undefined };
    return {
      startDateISO: customStart ? startOfDay(customStart).toISOString() : undefined,
      endDateISO: customEnd ? endOfDay(customEnd).toISOString() : undefined,
    };
  }, [dateRange, customStart, customEnd]);

  const loadLogs = async () => {
    const result = await secureFetchLogs({
      actionFilter: actionFilter !== 'all' ? actionFilter : undefined,
      entityFilter: entityFilter !== 'all' ? entityFilter : undefined,
      userFilter: userFilter !== 'all' ? userFilter : undefined,
      startDate: startDateISO,
      endDate: endDateISO,
      page,
      pageSize,
    });

    if (result.error) {
      toast.error(result.error);
      setLogs([]);
      setUniqueUsers([]);
      setTotal(0);
    } else {
      setLogs(result.logs);
      setUniqueUsers(result.uniqueUsers);
      setTotal(result.total);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, userFilter, startDateISO, endDateISO, pageSize]);

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, entityFilter, userFilter, startDateISO, endDateISO, page, pageSize]);

  // Client-side text search on current page
  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const q = searchTerm.toLowerCase();
    return logs.filter(log =>
      log.username?.toLowerCase().includes(q) ||
      log.entity_name?.toLowerCase().includes(q) ||
      log.action_type.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      log.entity_id?.toLowerCase().includes(q)
    );
  }, [logs, searchTerm]);

  // Group filtered logs by day
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; rows: ActivityLog[] }>();
    for (const log of filteredLogs) {
      const d = new Date(log.created_at);
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, { label: dayLabel(d), rows: [] });
      map.get(key)!.rows.push(log);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [filteredLogs]);

  const clearFilters = () => {
    setSearchTerm('');
    setActionFilter('all');
    setEntityFilter('all');
    setUserFilter('all');
    setDateRange('30d');
    setCustomStart(undefined);
    setCustomEnd(undefined);
  };

  const hasActiveFilters =
    !!searchTerm ||
    actionFilter !== 'all' ||
    entityFilter !== 'all' ||
    userFilter !== 'all' ||
    dateRange !== '30d';

  const getActionConfig = (a: string) =>
    ACTION_TYPE_LABELS[a] || { label: a.replace(/_/g, ' '), tone: 'neutral' as ActionTone };

  const getActionBadge = (a: string) => {
    const cfg = getActionConfig(a);
    return <span className={TONE_CLASSES[cfg.tone]}>{cfg.label}</span>;
  };

  const getEntityIcon = (entityType: string) =>
    ENTITY_TYPE_ICONS[entityType] || <Activity className="h-4 w-4" />;

  const exportCurrentPage = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity Name', 'Entity ID', 'IP Address'].join(','),
      ...filteredLogs.map(log => [
        log.created_at,
        log.username || 'Unknown',
        log.action_type,
        log.entity_type,
        log.entity_name || '',
        log.entity_id || '',
        log.ip_address || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-page-${page}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  const handleRowClick = (log: ActivityLog) => setSelectedLog(log);

  const copy = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Activity Logs</h1>
          <p className="text-sm text-muted-foreground">
            Track all user actions and system events
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCurrentPage} className="min-h-[44px] sm:min-h-0">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadLogs} className="min-h-[44px] sm:min-h-0">
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search this page..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeKey)}>
              <SelectTrigger><SelectValue placeholder="Date range" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="Action Type" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All Actions</SelectItem>
                {Object.entries(ACTION_TYPE_LABELS).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger><SelectValue placeholder="Entity Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="investment_report">Reports</SelectItem>
                <SelectItem value="property_comparison">Comparisons</SelectItem>
                <SelectItem value="cash_flow_analysis">Cash Flow</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="call_log">Call Logs</SelectItem>
                <SelectItem value="qa_conversation">QA</SelectItem>
                <SelectItem value="automation_switch">Automation</SelectItem>
                <SelectItem value="template">Templates</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="session">Sessions</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
                <SelectItem value="deal">Deals</SelectItem>
                <SelectItem value="client_file">Client Files</SelectItem>
                <SelectItem value="client_note">Client Notes</SelectItem>
                <SelectItem value="appointment">Appointments</SelectItem>
                <SelectItem value="checklist">Checklists</SelectItem>
                <SelectItem value="data_import">Data Imports</SelectItem>
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map(user => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dateRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {customStart ? format(customStart, 'PP') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart}
                    initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {customEnd ? format(customEnd, 'PP') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd}
                    initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Showing {filteredLogs.length} of {total} matching events
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading...'
              : total === 0
                ? 'No activities'
                : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[640px]">
            {loading ? (
              <div className="space-y-3 p-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-[260px]" />
                      <Skeleton className="h-3 w-[180px]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No activity logs found</p>
                {hasActiveFilters && (
                  <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="sm:hidden space-y-4">
                  {grouped.map(group => (
                    <div key={group.key} className="space-y-2">
                      <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/95 backdrop-blur text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </div>
                      <div className="divide-y divide-border">
                        {group.rows.map(log => {
                          const cfg = getActionConfig(log.action_type);
                          return (
                            <button
                              key={log.id}
                              type="button"
                              onClick={() => handleRowClick(log)}
                              className="w-full text-left py-3 flex gap-3 items-start hover:bg-muted/40 transition-colors rounded-md px-2"
                            >
                              <span className={cn('mt-1 w-1 self-stretch rounded-full', SEVERITY_BAR[cfg.tone])} />
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-muted-foreground shrink-0">{getEntityIcon(log.entity_type)}</span>
                                    <span className="font-medium text-sm truncate">
                                      {log.entity_name || log.entity_type.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                  {getActionBadge(log.action_type)}
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1.5"><User className="h-3 w-3" />{log.username || 'Unknown'}</span>
                                  <span className="font-mono">{format(new Date(log.created_at), 'HH:mm:ss')}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                      <TableRow>
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        <TableHead className="w-[140px]">User</TableHead>
                        <TableHead className="w-[180px]">Action</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead className="w-[130px]">IP Address</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped.map(group => (
                        <Fragment key={group.key}>
                          <TableRow className="hover:bg-transparent border-b-0">
                            <TableCell colSpan={5} className="py-2 px-4 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {group.label}
                              <span className="ml-2 text-muted-foreground/70 normal-case font-normal">
                                · {group.rows.length} {group.rows.length === 1 ? 'event' : 'events'}
                              </span>
                            </TableCell>
                          </TableRow>
                          {group.rows.map(log => {
                            const cfg = getActionConfig(log.action_type);
                            const href = entityHref(log.entity_type, log.entity_id);
                            return (
                              <TableRow
                                key={log.id}
                                className="cursor-pointer relative"
                                onClick={() => handleRowClick(log)}
                              >
                                <TableCell className="font-mono text-xs relative">
                                  <span className={cn('absolute left-0 top-2 bottom-2 w-0.5 rounded-r', SEVERITY_BAR[cfg.tone])} />
                                  <div className="pl-2">
                                    <div>{format(new Date(log.created_at), 'HH:mm:ss')}</div>
                                    <div className="text-muted-foreground">
                                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium text-sm">{log.username || 'Unknown'}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{getActionBadge(log.action_type)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{getEntityIcon(log.entity_type)}</span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium truncate max-w-[360px] flex items-center gap-1.5">
                                        {log.entity_name || log.entity_type.replace(/_/g, ' ')}
                                        {href && (
                                          <ExternalLink className="h-3 w-3 text-muted-foreground/70" />
                                        )}
                                      </div>
                                      {log.entity_id && (
                                        <div className="text-xs text-muted-foreground font-mono">
                                          {log.entity_id.slice(0, 8)}…
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">
                                  {log.ip_address || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </ScrollArea>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-2">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
                  First
                </Button>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <Sheet open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedLog && (() => {
            const cfg = getActionConfig(selectedLog.action_type);
            const href = entityHref(selectedLog.entity_type, selectedLog.entity_id);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <span className="text-muted-foreground">{getEntityIcon(selectedLog.entity_type)}</span>
                    <span className="truncate">{selectedLog.entity_name || selectedLog.entity_type.replace(/_/g, ' ')}</span>
                  </SheetTitle>
                  <SheetDescription className="flex items-center gap-2">
                    <span className={TONE_CLASSES[cfg.tone]}>{cfg.label}</span>
                    <span className="text-xs">{format(new Date(selectedLog.created_at), 'PPpp')}</span>
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5 text-sm">
                  <DetailRow label="When">
                    <div>{format(new Date(selectedLog.created_at), 'EEE, MMM d, yyyy · HH:mm:ss')}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(selectedLog.created_at), { addSuffix: true })}
                    </div>
                  </DetailRow>

                  <DetailRow label="User">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedLog.username || 'Unknown'}</span>
                    </div>
                    {selectedLog.user_id && (
                      <CopyableMono value={selectedLog.user_id} onCopy={copy} />
                    )}
                  </DetailRow>

                  <DetailRow label="Entity">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{getEntityIcon(selectedLog.entity_type)}</span>
                        <span className="font-medium">
                          {selectedLog.entity_name || selectedLog.entity_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {selectedLog.entity_type.replace(/_/g, ' ')}
                      </div>
                      {selectedLog.entity_id && (
                        <CopyableMono value={selectedLog.entity_id} onCopy={copy} />
                      )}
                      {href && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => { navigate(href); setSelectedLog(null); }}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Open {selectedLog.entity_type.replace(/_/g, ' ')}
                        </Button>
                      )}
                    </div>
                  </DetailRow>

                  {(selectedLog.ip_address || selectedLog.user_agent) && (
                    <DetailRow label="Session">
                      {selectedLog.ip_address && (
                        <div className="text-xs font-mono">IP {selectedLog.ip_address}</div>
                      )}
                      {selectedLog.user_agent && (
                        <div className="text-xs text-muted-foreground break-words">
                          {selectedLog.user_agent}
                        </div>
                      )}
                    </DetailRow>
                  )}

                  {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                    <DetailRow label="Metadata">
                      <pre className="text-[11px] bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words border border-border/50">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        onClick={() => copy(JSON.stringify(selectedLog.metadata, null, 2), 'Metadata copied')}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy JSON
                      </Button>
                    </DetailRow>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CopyableMono({ value, onCopy }: { value: string; onCopy: (v: string, l?: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, 'ID copied')}
      className="group inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="truncate max-w-[280px]">{value}</span>
      <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
