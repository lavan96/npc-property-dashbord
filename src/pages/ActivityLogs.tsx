import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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

const ACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login: { label: 'Login', color: 'bg-green-500' },
  logout: { label: 'Logout', color: 'bg-gray-500' },
  // Reports
  report_generated: { label: 'Report Generated', color: 'bg-blue-500' },
  report_regenerated: { label: 'Report Regenerated', color: 'bg-blue-400' },
  report_viewed: { label: 'Report Viewed', color: 'bg-slate-400' },
  report_edited: { label: 'Report Edited', color: 'bg-amber-500' },
  report_archived: { label: 'Report Archived', color: 'bg-orange-500' },
  report_deleted: { label: 'Report Deleted', color: 'bg-red-500' },
  report_pdf_downloaded: { label: 'PDF Downloaded', color: 'bg-purple-500' },
  report_shared: { label: 'Report Shared', color: 'bg-indigo-500' },
  manual_override_applied: { label: 'Override Applied', color: 'bg-yellow-500' },
  // Comparisons
  comparison_created: { label: 'Comparison Created', color: 'bg-teal-500' },
  comparison_viewed: { label: 'Comparison Viewed', color: 'bg-teal-400' },
  comparison_deleted: { label: 'Comparison Deleted', color: 'bg-red-400' },
  // Cash flow
  cash_flow_created: { label: 'Cash Flow Created', color: 'bg-emerald-500' },
  cash_flow_updated: { label: 'Cash Flow Updated', color: 'bg-emerald-400' },
  cash_flow_deleted: { label: 'Cash Flow Deleted', color: 'bg-red-400' },
  // Email
  email_read: { label: 'Email Read', color: 'bg-slate-400' },
  email_reply_generated: { label: 'Reply Generated', color: 'bg-blue-400' },
  email_reply_sent: { label: 'Reply Sent', color: 'bg-green-400' },
  email_linked_to_report: { label: 'Email Linked', color: 'bg-indigo-400' },
  // Calls
  call_tagged: { label: 'Call Tagged', color: 'bg-violet-500' },
  alert_rule_created: { label: 'Alert Created', color: 'bg-amber-400' },
  alert_rule_updated: { label: 'Alert Updated', color: 'bg-amber-400' },
  alert_rule_deleted: { label: 'Alert Deleted', color: 'bg-red-400' },
  weekly_report_config_changed: { label: 'Config Changed', color: 'bg-slate-500' },
  // QA
  qa_conversation_created: { label: 'QA Started', color: 'bg-cyan-500' },
  qa_question_asked: { label: 'Question Asked', color: 'bg-cyan-400' },
  qa_conversation_deleted: { label: 'QA Deleted', color: 'bg-red-400' },
  // Automation
  automation_switch_created: { label: 'Switch Created', color: 'bg-lime-500' },
  automation_switch_enabled: { label: 'Switch Enabled', color: 'bg-green-500' },
  automation_switch_disabled: { label: 'Switch Disabled', color: 'bg-gray-500' },
  automation_switch_deleted: { label: 'Switch Deleted', color: 'bg-red-400' },
  automation_master_toggle_changed: { label: 'Master Toggle', color: 'bg-yellow-500' },
  // Templates
  template_uploaded: { label: 'Template Uploaded', color: 'bg-blue-500' },
  template_activated: { label: 'Template Activated', color: 'bg-green-500' },
  template_deactivated: { label: 'Template Deactivated', color: 'bg-gray-500' },
  template_deleted: { label: 'Template Deleted', color: 'bg-red-400' },
  branding_profile_created: { label: 'Branding Created', color: 'bg-pink-500' },
  branding_profile_updated: { label: 'Branding Updated', color: 'bg-pink-400' },
  branding_profile_deleted: { label: 'Branding Deleted', color: 'bg-red-400' },
  // User management
  user_invited: { label: 'User Invited', color: 'bg-indigo-500' },
  user_permissions_changed: { label: 'Permissions Changed', color: 'bg-amber-500' },
  user_deactivated: { label: 'User Deactivated', color: 'bg-red-500' },
  user_activated: { label: 'User Activated', color: 'bg-green-500' },
  password_reset_initiated: { label: 'Password Reset', color: 'bg-orange-500' },
  // White label
  whitelabel_settings_updated: { label: 'Whitelabel Updated', color: 'bg-purple-500' },
  whitelabel_logo_changed: { label: 'Logo Changed', color: 'bg-purple-400' },
  // Bulk
  bulk_generation_started: { label: 'Bulk Started', color: 'bg-blue-600' },
  bulk_generation_completed: { label: 'Bulk Completed', color: 'bg-green-600' },
  // General
  settings_updated: { label: 'Settings Updated', color: 'bg-slate-500' },
  data_exported: { label: 'Data Exported', color: 'bg-teal-500' },
  // Client management
  client_created: { label: 'Client Created', color: 'bg-emerald-500' },
  client_updated: { label: 'Client Updated', color: 'bg-emerald-400' },
  client_deleted: { label: 'Client Deleted', color: 'bg-red-500' },
  client_exported: { label: 'Client Exported', color: 'bg-teal-500' },
  client_file_uploaded: { label: 'File Uploaded', color: 'bg-blue-500' },
  client_file_deleted: { label: 'File Deleted', color: 'bg-red-400' },
  client_note_added: { label: 'Note Added', color: 'bg-amber-400' },
  client_tag_added: { label: 'Tag Added', color: 'bg-violet-500' },
  client_tag_removed: { label: 'Tag Removed', color: 'bg-violet-400' },
  // Deal pipeline
  deal_created: { label: 'Deal Created', color: 'bg-emerald-600' },
  deal_updated: { label: 'Deal Updated', color: 'bg-emerald-400' },
  deal_stage_changed: { label: 'Stage Changed', color: 'bg-blue-500' },
  deal_deleted: { label: 'Deal Deleted', color: 'bg-red-500' },
  build_payment_updated: { label: 'Payment Updated', color: 'bg-amber-500' },
  // Calendar
  appointment_created: { label: 'Appointment Created', color: 'bg-blue-500' },
  appointment_updated: { label: 'Appointment Updated', color: 'bg-blue-400' },
  appointment_deleted: { label: 'Appointment Deleted', color: 'bg-red-400' },
  appointment_rescheduled: { label: 'Appointment Rescheduled', color: 'bg-amber-500' },
  // Checklists
  checklist_generated: { label: 'Checklist Generated', color: 'bg-cyan-500' },
  checklist_item_checked: { label: 'Item Checked', color: 'bg-cyan-400' },
  checklist_completed: { label: 'Checklist Completed', color: 'bg-green-600' },
  checklist_deleted: { label: 'Checklist Deleted', color: 'bg-red-400' },
  // Data
  data_imported: { label: 'Data Imported', color: 'bg-indigo-500' },
  // WhiteLabel extended
  whitelabel_logo_uploaded: { label: 'Logo Uploaded', color: 'bg-purple-500' },
  whitelabel_logo_removed: { label: 'Logo Removed', color: 'bg-purple-400' },
  whitelabel_theme_changed: { label: 'Theme Changed', color: 'bg-purple-500' },
  // Reports extended
  comparison_pdf_downloaded: { label: 'Comparison PDF', color: 'bg-teal-500' },
  portfolio_report_generated: { label: 'Portfolio Report', color: 'bg-emerald-500' },
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
    const config = ACTION_TYPE_LABELS[actionType] || { label: actionType, color: 'bg-gray-500' };
    return (
      <Badge className={`${config.color} text-white text-xs`}>
        {config.label}
      </Badge>
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