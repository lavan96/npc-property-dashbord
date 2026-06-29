import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSecureActivityLogs, ActivityLog, ActivityStats } from '@/hooks/useSecureActivityLogs';
import { SearchableMultiSelect, MSOption } from '@/components/shared/SearchableMultiSelect';
import { format, formatDistanceToNow, startOfDay, endOfDay, subDays, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';
import {
  Activity, Search, RefreshCw, User, FileText, LogIn,
  GitCompare, Mail, Phone, MessageSquare, Settings, Zap, Palette,
  Download, Filter, X, Users, Handshake, FileUp, StickyNote,
  CalendarIcon, ClipboardCheck, DatabaseIcon, ChevronLeft, ChevronRight,
  ExternalLink, Copy, Bookmark, BookmarkPlus, Trash2, AlertTriangle,
  Sparkles, Rows3, Rows2, ChevronDown, Radio, Info,
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
  success: 'bg-gradient-to-b from-success/90 via-success/70 to-success/40',
  warning: 'bg-gradient-to-b from-warning/90 via-warning/70 to-warning/40',
  destructive: 'bg-gradient-to-b from-destructive via-destructive/80 to-destructive/50 shadow-[0_0_10px_hsl(var(--destructive)/0.45)]',
  info: 'bg-gradient-to-b from-primary/80 via-primary/60 to-primary/30',
  accent: 'bg-gradient-to-b from-accent/90 via-accent/70 to-accent/40',
  neutral: 'bg-gradient-to-b from-muted-foreground/50 to-muted-foreground/20',
};

const TONE_DESCRIPTION: Record<ActionTone, string> = {
  success: 'Successful creation, completion, or activation',
  info: 'Informational update or edit',
  warning: 'Caution — config change, archive, deactivation',
  destructive: 'Deletion, removal, or revocation',
  accent: 'Branding, tagging, or visual change',
  neutral: 'Read, view, or low-signal event',
};

const ACTION_TYPE_LABELS: Record<string, { label: string; tone: ActionTone; group?: string }> = {
  // Auth
  login: { label: 'Login', tone: 'success', group: 'Auth' },
  logout: { label: 'Logout', tone: 'neutral', group: 'Auth' },
  password_reset_initiated: { label: 'Password Reset', tone: 'destructive', group: 'Auth' },
  // Reports
  report_generated: { label: 'Report Generated', tone: 'success', group: 'Reports' },
  report_regenerated: { label: 'Report Regenerated', tone: 'info', group: 'Reports' },
  report_viewed: { label: 'Report Viewed', tone: 'neutral', group: 'Reports' },
  report_edited: { label: 'Report Edited', tone: 'info', group: 'Reports' },
  report_archived: { label: 'Report Archived', tone: 'warning', group: 'Reports' },
  report_deleted: { label: 'Report Deleted', tone: 'destructive', group: 'Reports' },
  report_pdf_downloaded: { label: 'PDF Downloaded', tone: 'accent', group: 'Reports' },
  report_shared: { label: 'Report Shared', tone: 'info', group: 'Reports' },
  manual_override_applied: { label: 'Override Applied', tone: 'warning', group: 'Reports' },
  portfolio_report_generated: { label: 'Portfolio Report', tone: 'success', group: 'Reports' },
  comparison_pdf_downloaded: { label: 'Comparison PDF', tone: 'accent', group: 'Reports' },
  // Comparisons
  comparison_created: { label: 'Comparison Created', tone: 'success', group: 'Comparisons' },
  comparison_viewed: { label: 'Comparison Viewed', tone: 'neutral', group: 'Comparisons' },
  comparison_deleted: { label: 'Comparison Deleted', tone: 'destructive', group: 'Comparisons' },
  // Cash flow
  cash_flow_created: { label: 'Cash Flow Created', tone: 'success', group: 'Cash Flow' },
  cash_flow_updated: { label: 'Cash Flow Updated', tone: 'info', group: 'Cash Flow' },
  cash_flow_deleted: { label: 'Cash Flow Deleted', tone: 'destructive', group: 'Cash Flow' },
  // Email
  email_read: { label: 'Email Read', tone: 'neutral', group: 'Email' },
  email_reply_generated: { label: 'Reply Generated', tone: 'info', group: 'Email' },
  email_reply_sent: { label: 'Reply Sent', tone: 'success', group: 'Email' },
  email_linked_to_report: { label: 'Email Linked', tone: 'info', group: 'Email' },
  // Cross-portal messages
  portal_message_sent: { label: 'Portal Message Sent', tone: 'info', group: 'Messages' },
  portal_message_received: { label: 'Portal Message Received', tone: 'accent', group: 'Messages' },
  // Calls
  call_tagged: { label: 'Call Tagged', tone: 'accent', group: 'Calls' },
  alert_rule_created: { label: 'Alert Created', tone: 'info', group: 'Calls' },
  alert_rule_updated: { label: 'Alert Updated', tone: 'info', group: 'Calls' },
  alert_rule_deleted: { label: 'Alert Deleted', tone: 'destructive', group: 'Calls' },
  weekly_report_config_changed: { label: 'Config Changed', tone: 'neutral', group: 'Calls' },
  // QA
  qa_conversation_created: { label: 'QA Started', tone: 'info', group: 'QA' },
  qa_question_asked: { label: 'Question Asked', tone: 'neutral', group: 'QA' },
  qa_conversation_deleted: { label: 'QA Deleted', tone: 'destructive', group: 'QA' },
  // Automation
  automation_switch_created: { label: 'Switch Created', tone: 'success', group: 'Automation' },
  automation_switch_enabled: { label: 'Switch Enabled', tone: 'success', group: 'Automation' },
  automation_switch_disabled: { label: 'Switch Disabled', tone: 'warning', group: 'Automation' },
  automation_switch_deleted: { label: 'Switch Deleted', tone: 'destructive', group: 'Automation' },
  automation_master_toggle_changed: { label: 'Master Toggle', tone: 'warning', group: 'Automation' },
  // Templates
  template_uploaded: { label: 'Template Uploaded', tone: 'info', group: 'Templates' },
  template_activated: { label: 'Template Activated', tone: 'success', group: 'Templates' },
  template_deactivated: { label: 'Template Deactivated', tone: 'warning', group: 'Templates' },
  template_deleted: { label: 'Template Deleted', tone: 'destructive', group: 'Templates' },
  // Branding
  branding_profile_created: { label: 'Branding Created', tone: 'accent', group: 'Branding' },
  branding_profile_updated: { label: 'Branding Updated', tone: 'accent', group: 'Branding' },
  branding_profile_deleted: { label: 'Branding Deleted', tone: 'destructive', group: 'Branding' },
  // User management
  user_invited: { label: 'User Invited', tone: 'info', group: 'Users' },
  user_permissions_changed: { label: 'Permissions Changed', tone: 'warning', group: 'Users' },
  user_deactivated: { label: 'User Deactivated', tone: 'destructive', group: 'Users' },
  user_activated: { label: 'User Activated', tone: 'success', group: 'Users' },
  // White label
  whitelabel_settings_updated: { label: 'Whitelabel Updated', tone: 'accent', group: 'White Label' },
  whitelabel_logo_changed: { label: 'Logo Changed', tone: 'accent', group: 'White Label' },
  whitelabel_logo_uploaded: { label: 'Logo Uploaded', tone: 'accent', group: 'White Label' },
  whitelabel_logo_removed: { label: 'Logo Removed', tone: 'warning', group: 'White Label' },
  whitelabel_theme_changed: { label: 'Theme Changed', tone: 'accent', group: 'White Label' },
  // Bulk
  bulk_generation_started: { label: 'Bulk Started', tone: 'info', group: 'Bulk' },
  bulk_generation_completed: { label: 'Bulk Completed', tone: 'success', group: 'Bulk' },
  // General
  settings_updated: { label: 'Settings Updated', tone: 'warning', group: 'General' },
  data_exported: { label: 'Data Exported', tone: 'info', group: 'General' },
  data_imported: { label: 'Data Imported', tone: 'success', group: 'General' },
  // Clients
  client_created: { label: 'Client Created', tone: 'success', group: 'Clients' },
  client_updated: { label: 'Client Updated', tone: 'info', group: 'Clients' },
  client_deleted: { label: 'Client Deleted', tone: 'destructive', group: 'Clients' },
  client_exported: { label: 'Client Exported', tone: 'info', group: 'Clients' },
  client_file_uploaded: { label: 'File Uploaded', tone: 'info', group: 'Clients' },
  client_file_deleted: { label: 'File Deleted', tone: 'destructive', group: 'Clients' },
  client_note_added: { label: 'Note Added', tone: 'info', group: 'Clients' },
  client_tag_added: { label: 'Tag Added', tone: 'accent', group: 'Clients' },
  client_tag_removed: { label: 'Tag Removed', tone: 'neutral', group: 'Clients' },
  // Deal pipeline
  deal_created: { label: 'Deal Created', tone: 'success', group: 'Deals' },
  deal_updated: { label: 'Deal Updated', tone: 'info', group: 'Deals' },
  deal_stage_changed: { label: 'Stage Changed', tone: 'accent', group: 'Deals' },
  deal_deleted: { label: 'Deal Deleted', tone: 'destructive', group: 'Deals' },
  build_payment_updated: { label: 'Payment Updated', tone: 'info', group: 'Deals' },
  // Calendar
  appointment_created: { label: 'Appointment Created', tone: 'success', group: 'Calendar' },
  appointment_updated: { label: 'Appointment Updated', tone: 'info', group: 'Calendar' },
  appointment_deleted: { label: 'Appointment Deleted', tone: 'destructive', group: 'Calendar' },
  appointment_rescheduled: { label: 'Appointment Rescheduled', tone: 'warning', group: 'Calendar' },
  // Checklists
  checklist_generated: { label: 'Checklist Generated', tone: 'info', group: 'Checklists' },
  checklist_item_checked: { label: 'Item Checked', tone: 'success', group: 'Checklists' },
  checklist_completed: { label: 'Checklist Completed', tone: 'success', group: 'Checklists' },
  checklist_deleted: { label: 'Checklist Deleted', tone: 'destructive', group: 'Checklists' },
};

const ENTITY_TYPE_ICONS: Record<string, React.ReactNode> = {
  investment_report: <FileText className="h-4 w-4" />,
  property_comparison: <GitCompare className="h-4 w-4" />,
  cash_flow_analysis: <Activity className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  call_log: <Phone className="h-4 w-4" />,
  call_alert_rule: <Zap className="h-4 w-4" />,
  qa_conversation: <MessageSquare className="h-4 w-4" />,
  portal_message: <MessageSquare className="h-4 w-4" />,
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

const ENTITY_OPTIONS: MSOption[] = [
  { value: 'investment_report', label: 'Reports', group: 'Content' },
  { value: 'property_comparison', label: 'Comparisons', group: 'Content' },
  { value: 'cash_flow_analysis', label: 'Cash Flow', group: 'Content' },
  { value: 'portfolio_report', label: 'Portfolio Reports', group: 'Content' },
  { value: 'template', label: 'Templates', group: 'Content' },
  { value: 'branding_profile', label: 'Branding', group: 'Content' },
  { value: 'email', label: 'Email', group: 'Comms' },
  { value: 'call_log', label: 'Call Logs', group: 'Comms' },
  { value: 'call_alert_rule', label: 'Call Alerts', group: 'Comms' },
  { value: 'qa_conversation', label: 'QA', group: 'Comms' },
  { value: 'client', label: 'Clients', group: 'CRM' },
  { value: 'client_file', label: 'Client Files', group: 'CRM' },
  { value: 'client_note', label: 'Client Notes', group: 'CRM' },
  { value: 'deal', label: 'Deals', group: 'CRM' },
  { value: 'appointment', label: 'Appointments', group: 'CRM' },
  { value: 'checklist', label: 'Checklists', group: 'CRM' },
  { value: 'automation_switch', label: 'Automation', group: 'System' },
  { value: 'user', label: 'Users', group: 'System' },
  { value: 'session', label: 'Sessions', group: 'System' },
  { value: 'whitelabel_settings', label: 'White Label', group: 'System' },
  { value: 'data_import', label: 'Data Imports', group: 'System' },
  { value: 'bulk_generation_job', label: 'Bulk Jobs', group: 'System' },
];

const ACTION_OPTIONS: MSOption[] = Object.entries(ACTION_TYPE_LABELS).map(([value, v]) => ({
  value, label: v.label, group: v.group,
}));

// Deep-link resolver
function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case 'investment_report': return entityId ? `/investment-report/${entityId}` : '/reports/analytics';
    case 'property_comparison': return '/reports/analytics';
    case 'cash_flow_analysis': return '/cash-flow-analysis';
    case 'email': return '/email-copilot';
    case 'call_log':
    case 'call_alert_rule': return '/call-logs';
    case 'qa_conversation': return '/report-qa';
    case 'automation_switch': return '/automation';
    case 'template': return '/templates';
    case 'branding_profile':
    case 'whitelabel_settings': return '/white-label';
    case 'user': return '/admin/users';
    case 'client':
    case 'client_file':
    case 'client_note': return '/clients';
    case 'deal': return '/deal-pipeline';
    case 'appointment': return '/calendar';
    case 'checklist': return '/checklists';
    case 'data_import': return '/data-import';
    case 'portfolio_report': return '/portfolio-reports';
    default: return null;
  }
}

type DateRangeKey = 'all' | '24h' | '7d' | '30d' | 'custom';
type Density = 'compact' | 'comfortable';
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const PRESETS_KEY = 'activityLogs.presets.v1';
const DENSITY_KEY = 'activityLogs.density.v1';

interface FilterPreset {
  id: string;
  name: string;
  actions: string[];
  entities: string[];
  users: string[];
  dateRange: DateRangeKey;
}

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}
function savePresets(p: FilterPreset[]) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); } catch {}
}

function dayLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d, yyyy');
}

export default function ActivityLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string[]>([]);
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ActivityStats | null>(null);

  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [density, setDensity] = useState<Density>(() => {
    try { return (localStorage.getItem(DENSITY_KEY) as Density) || 'comfortable'; }
    catch { return 'comfortable'; }
  });

  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets());
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Live tail
  const [liveTail, setLiveTail] = useState(false);
  const [lastTickAt, setLastTickAt] = useState<Date | null>(null);
  const [newSinceMount, setNewSinceMount] = useState(0);
  const prevTopIdRef = useRef<string | null>(null);

  const { fetchLogs: secureFetchLogs, loading } = useSecureActivityLogs();

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch {}
  }, [density]);

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

  const loadLogs = useCallback(async (silent = false) => {
    const result = await secureFetchLogs({
      actionFilter: actionFilter.length ? actionFilter : undefined,
      entityFilter: entityFilter.length ? entityFilter : undefined,
      userFilter: userFilter.length ? userFilter : undefined,
      startDate: startDateISO,
      endDate: endDateISO,
      page,
      pageSize,
      includeStats: true,
    });

    if (result.error) {
      if (!silent) toast.error(result.error);
      if (!silent) { setLogs([]); setUniqueUsers([]); setTotal(0); setStats(null); }
    } else {
      // Detect new events for live tail badge
      const newTopId = result.logs[0]?.id ?? null;
      if (silent && prevTopIdRef.current && newTopId && newTopId !== prevTopIdRef.current) {
        const idx = result.logs.findIndex(l => l.id === prevTopIdRef.current);
        const delta = idx === -1 ? result.logs.length : idx;
        if (delta > 0) setNewSinceMount(n => n + delta);
      }
      prevTopIdRef.current = newTopId;
      setLogs(result.logs);
      setUniqueUsers(result.uniqueUsers);
      setTotal(result.total);
      setStats(result.stats);
      setLastTickAt(new Date());
    }
  }, [secureFetchLogs, actionFilter, entityFilter, userFilter, startDateISO, endDateISO, page, pageSize]);

  useEffect(() => { setPage(1); }, [actionFilter, entityFilter, userFilter, startDateISO, endDateISO, pageSize]);
  useEffect(() => { setNewSinceMount(0); prevTopIdRef.current = null; loadLogs(); }, [loadLogs]);

  // Live tail polling — only when on page 1, no drawer open, tab visible
  useEffect(() => {
    if (!liveTail) return;
    if (page !== 1) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (selectedLog) return;
      loadLogs(true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [liveTail, page, selectedLog, loadLogs]);

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

  // FlatItem defined at file scope below

  const flatItems = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const g of grouped) {
      out.push({ kind: 'header', key: `h-${g.key}`, label: g.label, count: g.rows.length });
      for (const log of g.rows) out.push({ kind: 'row', key: log.id, log });
    }
    return out;
  }, [grouped]);

  const clearFilters = () => {
    setSearchTerm('');
    setActionFilter([]);
    setEntityFilter([]);
    setUserFilter([]);
    setDateRange('30d');
    setCustomStart(undefined);
    setCustomEnd(undefined);
  };

  const hasActiveFilters =
    !!searchTerm ||
    actionFilter.length > 0 ||
    entityFilter.length > 0 ||
    userFilter.length > 0 ||
    dateRange !== '30d';

  const getActionConfig = (a: string) =>
    ACTION_TYPE_LABELS[a] || { label: a.replace(/_/g, ' '), tone: 'neutral' as ActionTone };

  const getActionBadge = (a: string) => {
    const cfg = getActionConfig(a);
    return <span className={TONE_CLASSES[cfg.tone]}>{cfg.label}</span>;
  };

  const getEntityIcon = (entityType: string) =>
    ENTITY_TYPE_ICONS[entityType] || <Activity className="h-4 w-4" />;

  const userOptions: MSOption[] = useMemo(
    () => uniqueUsers.map(u => ({ value: u, label: u })), [uniqueUsers]
  );

  // Exporters
  const downloadBlob = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
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
    downloadBlob(csv, 'text/csv', `activity-logs-page-${page}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    toast.success(`Exported ${filteredLogs.length} rows to CSV`);
  };

  const exportJSON = () => {
    const json = JSON.stringify(filteredLogs, null, 2);
    downloadBlob(json, 'application/json', `activity-logs-page-${page}-${format(new Date(), 'yyyy-MM-dd')}.json`);
    toast.success(`Exported ${filteredLogs.length} rows to JSON`);
  };

  // Presets
  const applyPreset = (p: FilterPreset) => {
    setActionFilter(p.actions);
    setEntityFilter(p.entities);
    setUserFilter(p.users);
    setDateRange(p.dateRange);
    toast.success(`Applied "${p.name}"`);
  };
  const savePreset = () => {
    if (!newPresetName.trim()) return;
    const next: FilterPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      actions: actionFilter,
      entities: entityFilter,
      users: userFilter,
      dateRange,
    };
    const updated = [...presets, next];
    setPresets(updated);
    savePresets(updated);
    setNewPresetName('');
    setPresetDialogOpen(false);
    toast.success(`Saved preset "${next.name}"`);
  };
  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  const handleRowClick = (log: ActivityLog) => setSelectedLog(log);

  const copy = async (text: string, label = 'Copied') => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error('Failed to copy'); }
  };

  const compact = density === 'compact';
  const cellPad = compact ? 'py-2' : 'py-3';

  const topActionLabel = stats?.topAction
    ? (ACTION_TYPE_LABELS[stats.topAction.type]?.label || stats.topAction.type.replace(/_/g, ' '))
    : null;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Activity Logs</h1>
          <p className="text-sm text-muted-foreground">Track all user actions and system events</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Presets */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0">
                <Bookmark className="h-4 w-4 mr-2" />
                Presets
                {presets.length > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">({presets.length})</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Saved filter presets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presets.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">No saved presets yet.</div>
              ) : (
                presets.map(p => (
                  <div key={p.id} className="group flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-sm">
                    <button onClick={() => applyPreset(p)} className="flex-1 text-left text-sm truncate">
                      {p.name}
                      <div className="text-[10px] text-muted-foreground">
                        {p.actions.length + p.entities.length + p.users.length} filters · {p.dateRange}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                      aria-label="Delete preset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setPresetDialogOpen(true); }}
                disabled={!hasActiveFilters}
              >
                <BookmarkPlus className="h-4 w-4 mr-2" />
                Save current filters…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Density toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline" size="sm"
                onClick={() => setDensity(d => d === 'compact' ? 'comfortable' : 'compact')}
                className="min-h-[44px] sm:min-h-0"
                aria-label="Toggle density"
              >
                {compact ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{compact ? 'Comfortable view' : 'Compact view'}</TooltipContent>
          </Tooltip>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0">
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCSV}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportJSON}>Export as JSON (with metadata)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Severity legend */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0" aria-label="Severity legend">
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Severity legend
              </div>
              <div className="space-y-2">
                {(['destructive','warning','info','success','accent','neutral'] as ActionTone[]).map(t => (
                  <div key={t} className="flex items-start gap-2.5">
                    <span className={cn('mt-0.5 w-1 h-5 rounded-full shrink-0', SEVERITY_BAR[t])} />
                    <div className="min-w-0">
                      <div className={cn('text-xs', TONE_CLASSES[t], 'inline-flex')}>{t}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{TONE_DESCRIPTION[t]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Live tail toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={liveTail ? 'default' : 'outline'} size="sm"
                onClick={() => { setLiveTail(v => !v); setNewSinceMount(0); }}
                className="min-h-[44px] sm:min-h-0 relative"
                aria-pressed={liveTail}
              >
                <Radio className={cn('h-4 w-4 mr-2', liveTail && 'animate-pulse text-success')} />
                {liveTail ? 'Live' : 'Live tail'}
                {liveTail && newSinceMount > 0 && (
                  <span className="ml-1.5 text-[10px] rounded-full bg-success/20 text-success px-1.5 py-0.5">
                    +{newSinceMount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {liveTail
                ? `Polling every 10s${lastTickAt ? ` · last @ ${format(lastTickAt, 'HH:mm:ss')}` : ''}${page > 1 ? ' (paused — not page 1)' : ''}`
                : 'Auto-refresh page 1 every 10s'}
            </TooltipContent>
          </Tooltip>

          <Button variant="outline" size="sm" onClick={() => loadLogs(false)} className="min-h-[44px] sm:min-h-0">
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Events today"
          value={stats?.eventsToday ?? '—'}
          icon={<Sparkles className="h-4 w-4" />}
          tone="info"
        />
        <StatTile
          label="Active users"
          value={stats?.uniqueUsers ?? '—'}
          icon={<Users className="h-4 w-4" />}
          tone="success"
          hint={stats?.sampleCapped ? 'Within sampled window' : undefined}
        />
        <StatTile
          label="Top action"
          value={topActionLabel || '—'}
          subValue={stats?.topAction ? `${stats.topAction.count} events` : undefined}
          icon={<Activity className="h-4 w-4" />}
          tone="accent"
          truncate
        />
        <StatTile
          label="Destructive actions"
          value={stats?.failures ?? '—'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={stats && stats.failures > 0 ? 'destructive' : 'neutral'}
        />
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

            <SearchableMultiSelect
              label="Actions"
              placeholder="All actions"
              searchPlaceholder="Search 60+ actions…"
              options={ACTION_OPTIONS}
              selected={actionFilter}
              onChange={setActionFilter}
              icon={<Zap className="h-4 w-4 text-muted-foreground" />}
              width="w-[300px]"
            />

            <SearchableMultiSelect
              label="Entities"
              placeholder="All entities"
              options={ENTITY_OPTIONS}
              selected={entityFilter}
              onChange={setEntityFilter}
              icon={<DatabaseIcon className="h-4 w-4 text-muted-foreground" />}
            />

            <SearchableMultiSelect
              label="Users"
              placeholder="All users"
              options={userOptions}
              selected={userFilter}
              onChange={setUserFilter}
              icon={<User className="h-4 w-4 text-muted-foreground" />}
            />
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
          {loading ? (
            <div className="space-y-3 p-2 h-[640px]">
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
            <div className="text-center py-12 text-muted-foreground h-[640px] flex flex-col items-center justify-center">
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
              {/* Mobile — virtualized */}
              <div className="sm:hidden">
                <VirtualLogList
                  items={flatItems}
                  variant="mobile"
                  compact={compact}
                  onRowClick={handleRowClick}
                  getActionConfig={getActionConfig}
                  getActionBadge={getActionBadge}
                  getEntityIcon={getEntityIcon}
                />
              </div>

              {/* Desktop — virtualized */}
              <div className="hidden sm:block">
                {/* Sticky column header */}
                <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border border-border/60 rounded-t-md grid grid-cols-[180px_140px_180px_1fr_130px] gap-3 px-4 h-12 items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <div>Timestamp</div>
                  <div>User</div>
                  <div>Action</div>
                  <div>Entity</div>
                  <div>IP Address</div>
                </div>
                <VirtualLogList
                  items={flatItems}
                  variant="desktop"
                  compact={compact}
                  onRowClick={handleRowClick}
                  getActionConfig={getActionConfig}
                  getActionBadge={getActionBadge}
                  getEntityIcon={getEntityIcon}
                />
              </div>
            </>
          )}

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
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>First</Button>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Preset Dialog (lightweight popover) */}
      {presetDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-background dark:bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPresetDialogOpen(false)}
        >
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookmarkPlus className="h-4 w-4" /> Save filter preset
              </CardTitle>
              <CardDescription>
                Captures current actions, entities, users, and date range.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                autoFocus
                placeholder="e.g. Today's failures"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPresetDialogOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={savePreset} disabled={!newPresetName.trim()}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                          size="sm" variant="outline" className="mt-2"
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
                        size="sm" variant="ghost" className="mt-2"
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
    </TooltipProvider>
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

const STAT_TONE: Record<string, { ring: string; icon: string; value: string }> = {
  info:        { ring: 'ring-primary/20',     icon: 'text-primary bg-primary/10',           value: 'text-foreground' },
  success:     { ring: 'ring-success/20',     icon: 'text-success bg-success/10',           value: 'text-foreground' },
  accent:      { ring: 'ring-accent/30',      icon: 'text-accent-foreground bg-accent/15',  value: 'text-foreground' },
  destructive: { ring: 'ring-destructive/30', icon: 'text-destructive bg-destructive/10',   value: 'text-destructive' },
  neutral:     { ring: 'ring-border',         icon: 'text-muted-foreground bg-muted/40',    value: 'text-foreground' },
};

function StatTile({
  label, value, subValue, icon, tone = 'neutral', hint, truncate,
}: {
  label: string;
  value: React.ReactNode;
  subValue?: string;
  icon: React.ReactNode;
  tone?: 'info' | 'success' | 'accent' | 'destructive' | 'neutral';
  hint?: string;
  truncate?: boolean;
}) {
  const t = STAT_TONE[tone];
  return (
    <Card className={cn('relative overflow-hidden border-border/60 ring-1', t.ring)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
            <div className={cn(
              'mt-1 font-bold text-2xl leading-tight',
              t.value,
              truncate && 'truncate'
            )}>
              {value}
            </div>
            {subValue && <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>}
            {hint && <div className="text-[10px] text-muted-foreground/70 mt-1 italic">{hint}</div>}
          </div>
          <div className={cn('p-2 rounded-lg shrink-0', t.icon)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

type FlatItem =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'row'; key: string; log: ActivityLog };

interface VirtualLogListProps {
  items: FlatItem[];
  variant: 'desktop' | 'mobile';
  compact: boolean;
  onRowClick: (log: ActivityLog) => void;
  getActionConfig: (a: string) => { label: string; tone: ActionTone };
  getActionBadge: (a: string) => React.ReactNode;
  getEntityIcon: (e: string) => React.ReactNode;
}

function VirtualLogList({
  items, variant, compact, onRowClick, getActionConfig, getActionBadge, getEntityIcon,
}: VirtualLogListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const estimate = (idx: number) => {
    const it = items[idx];
    if (!it) return 56;
    if (it.kind === 'header') return 34;
    if (variant === 'mobile') return compact ? 64 : 76;
    return compact ? 48 : 68;
  };

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimate,
    overscan: 12,
    getItemKey: (i) => items[i]?.key ?? i,
  });

  return (
    <div
      ref={parentRef}
      className={cn(
        'overflow-auto contain-strict',
        variant === 'desktop'
          ? 'h-[640px] border border-t-0 border-border/60 rounded-b-md bg-card/40'
          : 'h-[640px]'
      )}
    >
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
      >
        {virtualizer.getVirtualItems().map(v => {
          const item = items[v.index];
          if (!item) return null;
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%',
                transform: `translateY(${v.start}px)`,
              }}
            >
              {item.kind === 'header' ? (
                <div className={cn(
                  'px-4 py-2 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40',
                  variant === 'mobile' && 'sticky-ish'
                )}>
                  {item.label}
                  <span className="ml-2 text-muted-foreground/70 normal-case font-normal">
                    · {item.count} {item.count === 1 ? 'event' : 'events'}
                  </span>
                </div>
              ) : variant === 'desktop' ? (
                <DesktopRow
                  log={item.log}
                  compact={compact}
                  cfg={getActionConfig(item.log.action_type)}
                  badge={getActionBadge(item.log.action_type)}
                  entityIcon={getEntityIcon(item.log.entity_type)}
                  onClick={() => onRowClick(item.log)}
                />
              ) : (
                <MobileRow
                  log={item.log}
                  compact={compact}
                  cfg={getActionConfig(item.log.action_type)}
                  badge={getActionBadge(item.log.action_type)}
                  entityIcon={getEntityIcon(item.log.entity_type)}
                  onClick={() => onRowClick(item.log)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopRow({
  log, compact, cfg, badge, entityIcon, onClick,
}: {
  log: ActivityLog;
  compact: boolean;
  cfg: { label: string; tone: ActionTone };
  badge: React.ReactNode;
  entityIcon: React.ReactNode;
  onClick: () => void;
}) {
  const href = entityHref(log.entity_type, log.entity_id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left grid grid-cols-[180px_140px_180px_1fr_130px] gap-3 px-4 items-center',
        'border-b border-border/40 hover:bg-muted/35 transition-colors relative',
        compact ? 'py-2' : 'py-3'
      )}
    >
      <span className={cn('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r', SEVERITY_BAR[cfg.tone])} />
      <div className="pl-2 font-mono text-xs min-w-0">
        <div>{format(new Date(log.created_at), 'HH:mm:ss')}</div>
        {!compact && (
          <div className="text-muted-foreground truncate">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm truncate">{log.username || 'Unknown'}</span>
      </div>
      <div>{badge}</div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground shrink-0">{entityIcon}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {log.entity_name || log.entity_type.replace(/_/g, ' ')}
            {href && <ExternalLink className="h-3 w-3 text-muted-foreground/70 shrink-0" />}
          </div>
          {!compact && log.entity_id && (
            <div className="text-xs text-muted-foreground font-mono truncate">
              {log.entity_id.slice(0, 8)}…
            </div>
          )}
        </div>
      </div>
      <div className="text-xs font-mono text-muted-foreground truncate">
        {log.ip_address || '-'}
      </div>
    </button>
  );
}

function MobileRow({
  log, compact, cfg, badge, entityIcon, onClick,
}: {
  log: ActivityLog;
  compact: boolean;
  cfg: { label: string; tone: ActionTone };
  badge: React.ReactNode;
  entityIcon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex gap-3 items-start hover:bg-muted/40 transition-colors px-3 border-b border-border/40',
        compact ? 'py-2' : 'py-3'
      )}
    >
      <span className={cn('mt-1 w-1 self-stretch rounded-full', SEVERITY_BAR[cfg.tone])} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{entityIcon}</span>
            <span className="font-medium text-sm truncate">
              {log.entity_name || log.entity_type.replace(/_/g, ' ')}
            </span>
          </div>
          {badge}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><User className="h-3 w-3" />{log.username || 'Unknown'}</span>
          <span className="font-mono">{format(new Date(log.created_at), 'HH:mm:ss')}</span>
        </div>
      </div>
    </button>
  );
}
