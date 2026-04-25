import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useSecureActivityLogs, ActivityLog } from '@/hooks/useSecureActivityLogs';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  User, 
  FileText, 
  LogIn, 
  LogOut,
  GitCompare,
  Mail,
  Phone,
  MessageSquare,
  Settings,
  Zap,
  Palette,
  Download,
  Filter,
  X,
  Users,
  Handshake,
  FileUp,
  StickyNote,
  Tag,
  CalendarIcon,
  ClipboardCheck,
  DatabaseIcon
} from 'lucide-react';

// ActivityLog interface is now imported from useSecureActivityLogs

type ActionTone = 'success' | 'warning' | 'destructive' | 'info' | 'accent' | 'neutral';

const TONE_CLASSES: Record<ActionTone, string> = {
  success: 'dashboard-status-chip dashboard-status-chip-success',
  warning: 'dashboard-status-chip dashboard-status-chip-warning',
  destructive: 'dashboard-status-chip dashboard-status-chip-destructive',
  info: 'dashboard-status-chip dashboard-status-chip-info',
  accent: 'dashboard-status-chip dashboard-status-chip-accent',
  neutral: 'dashboard-status-chip dashboard-status-chip-neutral',
};

const ACTION_TYPE_LABELS: Record<string, { label: string; tone: ActionTone }> = {
  // Auth
  login: { label: 'Login', tone: 'success' },
  logout: { label: 'Logout', tone: 'neutral' },
  // Reports
  report_generated: { label: 'Report Generated', tone: 'info' },
  report_regenerated: { label: 'Report Regenerated', tone: 'info' },
  report_viewed: { label: 'Report Viewed', tone: 'neutral' },
  report_edited: { label: 'Report Edited', tone: 'warning' },
  report_archived: { label: 'Report Archived', tone: 'warning' },
  report_deleted: { label: 'Report Deleted', tone: 'destructive' },
  report_pdf_downloaded: { label: 'PDF Downloaded', tone: 'accent' },
  report_shared: { label: 'Report Shared', tone: 'info' },
  manual_override_applied: { label: 'Override Applied', tone: 'warning' },
  // Comparisons
  comparison_created: { label: 'Comparison Created', tone: 'info' },
  comparison_viewed: { label: 'Comparison Viewed', tone: 'neutral' },
  comparison_deleted: { label: 'Comparison Deleted', tone: 'destructive' },
  // Cash flow
  cash_flow_created: { label: 'Cash Flow Created', tone: 'success' },
  cash_flow_updated: { label: 'Cash Flow Updated', tone: 'success' },
  cash_flow_deleted: { label: 'Cash Flow Deleted', tone: 'destructive' },
  // Email
  email_read: { label: 'Email Read', tone: 'neutral' },
  email_reply_generated: { label: 'Reply Generated', tone: 'info' },
  email_reply_sent: { label: 'Reply Sent', tone: 'success' },
  email_linked_to_report: { label: 'Email Linked', tone: 'info' },
  // Calls
  call_tagged: { label: 'Call Tagged', tone: 'accent' },
  alert_rule_created: { label: 'Alert Created', tone: 'warning' },
  alert_rule_updated: { label: 'Alert Updated', tone: 'warning' },
  alert_rule_deleted: { label: 'Alert Deleted', tone: 'destructive' },
  weekly_report_config_changed: { label: 'Config Changed', tone: 'neutral' },
  // QA
  qa_conversation_created: { label: 'QA Started', tone: 'info' },
  qa_question_asked: { label: 'Question Asked', tone: 'info' },
  qa_conversation_deleted: { label: 'QA Deleted', tone: 'destructive' },
  // Automation
  automation_switch_created: { label: 'Switch Created', tone: 'success' },
  automation_switch_enabled: { label: 'Switch Enabled', tone: 'success' },
  automation_switch_disabled: { label: 'Switch Disabled', tone: 'neutral' },
  automation_switch_deleted: { label: 'Switch Deleted', tone: 'destructive' },
  automation_master_toggle_changed: { label: 'Master Toggle', tone: 'warning' },
  // Templates
  template_uploaded: { label: 'Template Uploaded', tone: 'info' },
  template_activated: { label: 'Template Activated', tone: 'success' },
  template_deactivated: { label: 'Template Deactivated', tone: 'neutral' },
  template_deleted: { label: 'Template Deleted', tone: 'destructive' },
  branding_profile_created: { label: 'Branding Created', tone: 'accent' },
  branding_profile_updated: { label: 'Branding Updated', tone: 'accent' },
  branding_profile_deleted: { label: 'Branding Deleted', tone: 'destructive' },
  // User management
  user_invited: { label: 'User Invited', tone: 'info' },
  user_permissions_changed: { label: 'Permissions Changed', tone: 'warning' },
  user_deactivated: { label: 'User Deactivated', tone: 'destructive' },
  user_activated: { label: 'User Activated', tone: 'success' },
  password_reset_initiated: { label: 'Password Reset', tone: 'warning' },
  // White label
  whitelabel_settings_updated: { label: 'Whitelabel Updated', tone: 'accent' },
  whitelabel_logo_changed: { label: 'Logo Changed', tone: 'accent' },
  // Bulk
  bulk_generation_started: { label: 'Bulk Started', tone: 'info' },
  bulk_generation_completed: { label: 'Bulk Completed', tone: 'success' },
  // General
  settings_updated: { label: 'Settings Updated', tone: 'neutral' },
  data_exported: { label: 'Data Exported', tone: 'info' },
  // Client management
  client_created: { label: 'Client Created', tone: 'success' },
  client_updated: { label: 'Client Updated', tone: 'success' },
  client_deleted: { label: 'Client Deleted', tone: 'destructive' },
  client_exported: { label: 'Client Exported', tone: 'info' },
  client_file_uploaded: { label: 'File Uploaded', tone: 'info' },
  client_file_deleted: { label: 'File Deleted', tone: 'destructive' },
  client_note_added: { label: 'Note Added', tone: 'warning' },
  client_tag_added: { label: 'Tag Added', tone: 'accent' },
  client_tag_removed: { label: 'Tag Removed', tone: 'neutral' },
  // Deal pipeline
  deal_created: { label: 'Deal Created', tone: 'success' },
  deal_updated: { label: 'Deal Updated', tone: 'success' },
  deal_stage_changed: { label: 'Stage Changed', tone: 'info' },
  deal_deleted: { label: 'Deal Deleted', tone: 'destructive' },
  build_payment_updated: { label: 'Payment Updated', tone: 'warning' },
  // Calendar
  appointment_created: { label: 'Appointment Created', tone: 'info' },
  appointment_updated: { label: 'Appointment Updated', tone: 'info' },
  appointment_deleted: { label: 'Appointment Deleted', tone: 'destructive' },
  appointment_rescheduled: { label: 'Appointment Rescheduled', tone: 'warning' },
  // Checklists
  checklist_generated: { label: 'Checklist Generated', tone: 'info' },
  checklist_item_checked: { label: 'Item Checked', tone: 'success' },
  checklist_completed: { label: 'Checklist Completed', tone: 'success' },
  checklist_deleted: { label: 'Checklist Deleted', tone: 'destructive' },
  // Data
  data_imported: { label: 'Data Imported', tone: 'info' },
  // WhiteLabel extended
  whitelabel_logo_uploaded: { label: 'Logo Uploaded', tone: 'accent' },
  whitelabel_logo_removed: { label: 'Logo Removed', tone: 'neutral' },
  whitelabel_theme_changed: { label: 'Theme Changed', tone: 'accent' },
  // Reports extended
  comparison_pdf_downloaded: { label: 'Comparison PDF', tone: 'info' },
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

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([]);
  
  const { fetchLogs: secureFetchLogs, loading } = useSecureActivityLogs();

  const loadLogs = async () => {
    const result = await secureFetchLogs({
      actionFilter: actionFilter !== 'all' ? actionFilter : undefined,
      entityFilter: entityFilter !== 'all' ? entityFilter : undefined,
      userFilter: userFilter !== 'all' ? userFilter : undefined,
      limit: 500
    });

    if (result.error) {
      toast.error(result.error);
      setLogs([]);
      setUniqueUsers([]);
    } else {
      setLogs(result.logs);
      setUniqueUsers(result.uniqueUsers);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, entityFilter, userFilter]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.username?.toLowerCase().includes(search) ||
      log.entity_name?.toLowerCase().includes(search) ||
      log.action_type.toLowerCase().includes(search) ||
      log.entity_type.toLowerCase().includes(search)
    );
  });

  const clearFilters = () => {
    setSearchTerm('');
    setActionFilter('all');
    setEntityFilter('all');
    setUserFilter('all');
  };

  const hasActiveFilters = searchTerm || actionFilter !== 'all' || entityFilter !== 'all' || userFilter !== 'all';

  const getActionBadge = (actionType: string) => {
    const config = ACTION_TYPE_LABELS[actionType] || { label: actionType.replace(/_/g, ' '), tone: 'neutral' as ActionTone };
    return (
      <span className={TONE_CLASSES[config.tone]}>
        {config.label}
      </span>
    );
  };

  const getEntityIcon = (entityType: string) => {
    return ENTITY_TYPE_ICONS[entityType] || <Activity className="h-4 w-4" />;
  };

  const exportLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity Name', 'IP Address'].join(','),
      ...filteredLogs.map(log => [
        log.created_at,
        log.username || 'Unknown',
        log.action_type,
        log.entity_type,
        log.entity_name || '',
        log.ip_address || ''
      ].map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <Button variant="outline" size="sm" onClick={exportLogs} className="min-h-[44px] sm:min-h-0">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadLogs} className="min-h-[44px] sm:min-h-0">
            <RefreshCw className="h-4 w-4 mr-2" />
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
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.entries(ACTION_TYPE_LABELS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {filteredLogs.length} of {logs.length} logs
                </span>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              {loading ? 'Loading...' : `${filteredLogs.length} activities`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-[200px]" />
                        <Skeleton className="h-3 w-[150px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activity logs found</p>
                </div>
              ) : (
                <>
                  {/* Mobile: Card layout */}
                  <div className="sm:hidden divide-y divide-border">
                    {filteredLogs.map((log) => (
                      <div key={log.id} className="py-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground shrink-0">
                              {getEntityIcon(log.entity_type)}
                            </span>
                            <span className="font-medium text-sm truncate">
                              {log.entity_name || log.entity_type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {getActionBadge(log.action_type)}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            <span>{log.username || 'Unknown'}</span>
                          </div>
                          <span className="font-mono">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: Table layout */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Timestamp</TableHead>
                          <TableHead className="w-[120px]">User</TableHead>
                          <TableHead className="w-[160px]">Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead className="w-[120px]">IP Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs">
                              <div>{format(new Date(log.created_at), 'MMM d, HH:mm:ss')}</div>
                              <div className="text-muted-foreground">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">
                                  {log.username || 'Unknown'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getActionBadge(log.action_type)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  {getEntityIcon(log.entity_type)}
                                </span>
                                <div>
                                  <div className="text-sm font-medium truncate max-w-[300px]">
                                    {log.entity_name || log.entity_type.replace(/_/g, ' ')}
                                  </div>
                                  {log.entity_id && (
                                    <div className="text-xs text-muted-foreground font-mono">
                                      {log.entity_id.slice(0, 8)}...
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {log.ip_address || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
  );
}