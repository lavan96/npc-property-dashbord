import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import {
  Loader2, Search, MoreHorizontal, Mail, Shield, RefreshCw,
  Ban, CheckCircle2, History, Settings, Users, Copy,
  BarChart3, FileSpreadsheet, FileText, DollarSign, UserPlus,
  Pencil, Trash2, CircleDot, ShieldCheck,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { ClientAssignmentsDialog } from '@/components/admin/finance-portal/ClientAssignmentsDialog';
import { DefaultPermissionsDialog } from '@/components/admin/finance-portal/DefaultPermissionsDialog';
import { ActivityLogDialog } from '@/components/admin/finance-portal/ActivityLogDialog';
import { CreateFinanceContactDialog } from '@/components/admin/finance-portal/CreateFinanceContactDialog';
import { EditFinanceContactDialog } from '@/components/admin/finance-portal/EditFinanceContactDialog';
import { InviteFinanceContactDialog } from '@/components/admin/finance-portal/InviteFinanceContactDialog';
import { GlobalPartnerPermissionsDialog } from '@/components/admin/finance-portal/GlobalPartnerPermissionsDialog';
import { EMPTY_MATRIX, normalizeMatrix, type FinancePermissionMatrix } from '@/components/admin/finance-portal/FinancePermissionMatrix';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';

interface FinanceUserRow {
  id: string;                  // finance_agent_contacts.id
  name: string;
  email: string;
  company: string | null;
  contact_type: string;
  is_default: boolean;
  is_active: boolean;
  status: 'no_access' | 'invited' | 'invite_expired' | 'active' | 'inactive' | 'revoked';
  portal_user: null | {
    id: string;
    invite_sent_at: string | null;
    invite_accepted_at: string | null;
    invite_token_expires_at: string | null;
    last_login_at: string | null;
    has_accepted_terms: boolean;
    has_completed_onboarding: boolean;
    terms_accepted_at: string | null;
    revoked_at: string | null;
  };
}

const STATUS_BADGE: Record<FinanceUserRow['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  no_access:        { label: 'No Access',        variant: 'outline', className: 'dashboard-status-chip text-muted-foreground' },
  invited:          { label: 'Invited',          variant: 'secondary', className: 'dashboard-status-chip dashboard-status-chip-warning' },
  invite_expired:   { label: 'Invite Expired',   variant: 'destructive', className: 'dashboard-status-chip dashboard-status-chip-destructive' },
  active:           { label: 'Active',           variant: 'default', className: 'dashboard-status-chip dashboard-status-chip-success' },
  inactive:         { label: 'Inactive',         variant: 'outline', className: 'dashboard-status-chip text-muted-foreground' },
  revoked:          { label: 'Revoked',          variant: 'destructive', className: 'dashboard-status-chip dashboard-status-chip-destructive' },
};

export default function FinancePortalAdmin() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<FinanceUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FinanceUserRow['status']>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [defaultPermissions, setDefaultPermissions] = useState<FinancePermissionMatrix>(EMPTY_MATRIX);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForUser, setActivityForUser] = useState<FinanceUserRow | null>(null);
  const [assignmentsForUser, setAssignmentsForUser] = useState<FinanceUserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<FinanceUserRow | null>(null);
  const [deleteUser, setDeleteUser] = useState<FinanceUserRow | null>(null);
  const [inviteDialog, setInviteDialog] = useState<{ open: boolean; user: FinanceUserRow | null; isResend: boolean }>({ open: false, user: null, isResend: false });
  const [globalPermsForUser, setGlobalPermsForUser] = useState<FinanceUserRow | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        invokeSecureFunction('finance-portal-admin', { operation: 'list_users' }),
        invokeSecureFunction('finance-portal-admin', { operation: 'get_default_permissions' }),
      ]);
      if (uRes.error) throw new Error(uRes.error.message);
      if (dRes.error) throw new Error(dRes.error.message);
      setUsers(uRes.data?.records || []);
      setDefaultPermissions(normalizeMatrix(dRes.data?.record?.permissions));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load finance portal users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter(u => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!s) return true;
      return (
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.company || '').toLowerCase().includes(s)
      );
    });
  }, [users, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: users.length, active: 0, invited: 0, revoked: 0, no_access: 0 };
    for (const u of users) {
      if (u.status === 'active') c.active++;
      else if (u.status === 'invited') c.invited++;
      else if (u.status === 'revoked') c.revoked++;
      else if (u.status === 'no_access') c.no_access++;
    }
    return c;
  }, [users]);

  const inviteUser = async (u: FinanceUserRow, isResend = false) => {
    setBusyId(u.id);
    try {
      const { data, error } = await invokeSecureFunction('finance-portal-invite', {
        action: 'invite',
        finance_contact_id: u.id,
        resend_invite: isResend,
      });
      if (error) throw new Error(error.message);
      toast.success(data?.message || 'Invite sent');
      if (data?.invite_link) {
        try {
          await navigator.clipboard.writeText(data.invite_link);
          toast.success('Invite link copied to clipboard');
        } catch { /* ignore */ }
      }
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send invite');
    } finally {
      setBusyId(null);
    }
  };

  const revokeUser = async (u: FinanceUserRow) => {
    setBusyId(u.id);
    try {
      const { error } = await invokeSecureFunction('finance-portal-invite', {
        action: 'revoke',
        finance_contact_id: u.id,
      });
      if (error) throw new Error(error.message);
      toast.success('Portal access revoked');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke');
    } finally {
      setBusyId(null);
    }
  };

  const reinstateUser = async (u: FinanceUserRow) => {
    setBusyId(u.id);
    try {
      const { error } = await invokeSecureFunction('finance-portal-invite', {
        action: 'reinstate',
        finance_contact_id: u.id,
      });
      if (error) throw new Error(error.message);
      toast.success('Portal access reinstated');
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reinstate');
    } finally {
      setBusyId(null);
    }
  };

  const deleteContact = async (u: FinanceUserRow) => {
    setBusyId(u.id);
    try {
      const { error } = await invokeSecureFunction('finance-portal-admin', {
        operation: 'delete_contact',
        contact_id: u.id,
        hard_delete: false,
      });
      if (error) throw new Error(error.message);
      toast.success(`${u.name} removed (soft-deleted)`);
      setDeleteUser(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete contact');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (u: FinanceUserRow, next: boolean) => {
    setBusyId(u.id);
    try {
      const { data, error } = await invokeSecureFunction('finance-portal-admin', {
        operation: 'update_contact',
        contact_id: u.id,
        is_active: next,
      });
      if (error) throw new Error(error.message);
      if (next) {
        toast.success(`${u.name} marked Active`);
      } else {
        toast.success(
          (data as any)?.portal_revoked
            ? `${u.name} deactivated — portal session revoked`
            : `${u.name} marked Inactive`
        );
      }
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardThemeFrame variant="page" className="space-y-6 p-4 sm:p-6">
      <DashboardThemeFrame variant="hero" as="header" className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm shadow-primary/10">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Administration control centre</span>
            </div>
            <div className="space-y-2">
              <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm shadow-primary/10">
                  <Shield className="h-5 w-5" />
                </span>
                <span className="min-w-0 truncate">Finance Portal Admin</span>
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Manage portal access, per-client assignments, and CRUD permission matrices for finance contacts.
              </p>
            </div>
          </div>
        </div>
        <DashboardThemeFrame variant="toolbar" className="gap-2.5 border-border/60 bg-background/70 p-2.5 shadow-md shadow-black/5 dark:bg-slate-950/55">
          <Button
            onClick={() => setCreateOpen(true)}
            className="min-h-10 flex-1 gap-2 rounded-xl shadow-md shadow-primary/20 ring-2 ring-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 focus-visible:ring-primary/40 sm:flex-none"
            size="default"
          >
            <UserPlus className="h-4 w-4" />
            New Finance Contact
          </Button>
          <Button variant="outline" asChild className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Link to="/admin/finance-portal/analytics"><BarChart3 className="h-4 w-4" />Analytics</Link>
          </Button>
          <Button variant="outline" asChild className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Link to="/admin/finance-portal/bulk-import"><FileSpreadsheet className="h-4 w-4" />Bulk Import</Link>
          </Button>
          <Button variant="outline" asChild className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Link to="/admin/finance-portal/compliance"><FileText className="h-4 w-4" />Compliance</Link>
          </Button>
          <Button variant="outline" asChild className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Link to="/admin/finance-portal/health"><ShieldCheck className="h-4 w-4" />Health Sweep</Link>
          </Button>
          <Button variant="outline" asChild className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Link to="/admin/finance-portal/commissions"><DollarSign className="h-4 w-4" />Commissions</Link>
          </Button>
          <Button variant="outline" onClick={() => { setActivityForUser(null); setActivityOpen(true); }} className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <History className="h-4 w-4" />
            Activity Log
          </Button>
          <Button variant="outline" onClick={() => setDefaultsOpen(true)} className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 sm:flex-none">
            <Settings className="h-4 w-4" />
            Default Permissions
          </Button>
          <Button variant="outline" onClick={loadAll} className="min-h-10 flex-1 gap-2 rounded-xl border-border/70 bg-card/70 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40 disabled:translate-y-0 disabled:opacity-60 sm:flex-none" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </DashboardThemeFrame>
      </DashboardThemeFrame>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Contacts" value={counts.total} />
        <StatCard label="Active" value={counts.active} tone="success" />
        <StatCard label="Invited" value={counts.invited} tone="info" />
        <StatCard label="No Access" value={counts.no_access} tone="muted" />
        <StatCard label="Revoked" value={counts.revoked} tone="destructive" />
      </div>

      <DashboardThemeFrame variant="section" className="p-0">
        <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Finance Contacts
            </CardTitle>
            <CardDescription>
              Each row links a finance contact to portal access and per-client permissions.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full min-w-0 pl-8 sm:w-64"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'active', 'invited', 'no_access', 'revoked'] as const).map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : STATUS_BADGE[s as FinanceUserRow['status']]?.label || s}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/70 shadow-inner">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Invite</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No matching finance contacts.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(u => {
                    const badge = STATUS_BADGE[u.status];
                    const portalUser = u.portal_user;
                    const canManageAssignments = !!portalUser;
                    return (
                      <TableRow key={u.id} className="transition-colors hover:bg-muted/35">
                        <TableCell>
                          <div className="max-w-[220px] truncate font-medium" title={u.name}>{u.name}</div>
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={u.company || u.contact_type}>
                            {u.company || u.contact_type}
                            {u.is_default && <span className="ml-2 text-primary">★ default</span>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-sm" title={u.email}>{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center">
                                  <Switch
                                    checked={u.is_active}
                                    disabled={busyId === u.id}
                                    onCheckedChange={(c) => toggleActive(u, c)}
                                    aria-label={`Toggle ${u.name} active`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {u.is_active
                                  ? 'Active — turn off to deactivate and revoke portal session'
                                  : 'Inactive — turn on to reactivate'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {portalUser?.last_login_at
                            ? format(new Date(portalUser.last_login_at), 'MMM d, yyyy HH:mm')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {portalUser?.invite_sent_at
                            ? format(new Date(portalUser.invite_sent_at), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {portalUser ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                                  {portalUser.has_accepted_terms && portalUser.has_completed_onboarding ? (
                                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                                  ) : (
                                    <CircleDot className="h-4 w-4 text-warning shrink-0" />
                                  )}
                                  <span className="text-muted-foreground">
                                    {portalUser.has_accepted_terms && portalUser.has_completed_onboarding
                                      ? 'Complete'
                                      : `${(portalUser.has_accepted_terms ? 1 : 0) + (portalUser.has_completed_onboarding ? 1 : 0)}/2`}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="end">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Compliance Tracking</p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    {portalUser.has_accepted_terms ? (
                                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                                    ) : (
                                      <CircleDot className="h-4 w-4 text-warning shrink-0" />
                                    )}
                                    <span className="text-sm">Terms & Conditions</span>
                                    <Badge variant={portalUser.has_accepted_terms ? 'default' : 'secondary'} className="ml-auto text-[10px]">
                                      {portalUser.has_accepted_terms ? 'Accepted' : 'Pending'}
                                    </Badge>
                                  </div>
                                  {portalUser.terms_accepted_at && (
                                    <p className="text-[10px] text-muted-foreground pl-6">
                                      Accepted on {new Date(portalUser.terms_accepted_at).toLocaleDateString()}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    {portalUser.has_completed_onboarding ? (
                                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                                    ) : (
                                      <CircleDot className="h-4 w-4 text-warning shrink-0" />
                                    )}
                                    <span className="text-sm">Onboarding Tour</span>
                                    <Badge variant={portalUser.has_completed_onboarding ? 'default' : 'secondary'} className="ml-auto text-[10px]">
                                      {portalUser.has_completed_onboarding ? 'Completed' : 'Pending'}
                                    </Badge>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/40" disabled={busyId === u.id}>
                                {busyId === u.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setEditUser(u)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Contact Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {(u.status === 'no_access' || u.status === 'invite_expired') && (
                                <DropdownMenuItem onClick={() => setInviteDialog({ open: true, user: u, isResend: false })}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Send Invite…
                                </DropdownMenuItem>
                              )}
                              {(u.status === 'invited' || u.status === 'invite_expired' || u.status === 'active') && (
                                <DropdownMenuItem onClick={() => setInviteDialog({ open: true, user: u, isResend: true })}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Resend / Reset Invite…
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={!canManageAssignments}
                                onClick={() => setAssignmentsForUser(u)}
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Manage Client Assignments
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canManageAssignments || !u.portal_user}
                                onClick={() => setGlobalPermsForUser(u)}
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                Global Permissions…
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canManageAssignments}
                                onClick={() => { setActivityForUser(u); setActivityOpen(true); }}
                              >
                                <History className="h-4 w-4 mr-2" />
                                View Activity
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.status === 'revoked' ? (
                                <DropdownMenuItem onClick={() => reinstateUser(u)}>
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
                                  Reinstate Access
                                </DropdownMenuItem>
                              ) : (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={e => e.preventDefault()}
                                      disabled={!portalUser}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Ban className="h-4 w-4 mr-2" />
                                      Revoke Access
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Revoke portal access?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {u.name} will be signed out and unable to log in to the Finance Portal until access is reinstated. Client assignments are preserved.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => revokeUser(u)}
                                      >
                                        Revoke
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              <DropdownMenuItem
                                onClick={() => setDeleteUser(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Contact
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        </Card>
      </DashboardThemeFrame>

      <ClientAssignmentsDialog
        open={!!assignmentsForUser}
        onOpenChange={(o) => { if (!o) setAssignmentsForUser(null); }}
        financeUser={
          assignmentsForUser?.portal_user
            ? {
                portal_user_id: assignmentsForUser.portal_user.id,
                contact_name: assignmentsForUser.name,
                contact_email: assignmentsForUser.email,
              }
            : null
        }
        defaultPermissions={defaultPermissions}
      />

      <DefaultPermissionsDialog
        open={defaultsOpen}
        onOpenChange={setDefaultsOpen}
        onSaved={(m) => setDefaultPermissions(m)}
      />

      <GlobalPartnerPermissionsDialog
        open={!!globalPermsForUser}
        onOpenChange={(o) => { if (!o) setGlobalPermsForUser(null); }}
        partner={
          globalPermsForUser?.portal_user
            ? {
                portal_user_id: globalPermsForUser.portal_user.id,
                contact_name: globalPermsForUser.name,
                contact_email: globalPermsForUser.email,
              }
            : null
        }
        onSaved={() => loadAll()}
      />

      <ActivityLogDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        financeUserId={activityForUser?.portal_user?.id || null}
        title={activityForUser ? `Activity: ${activityForUser.name}` : 'Finance Portal Activity'}
      />

      <CreateFinanceContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => loadAll()}
      />

      <InviteFinanceContactDialog
        open={inviteDialog.open}
        onOpenChange={(o) => setInviteDialog((s) => ({ ...s, open: o }))}
        contact={inviteDialog.user ? { id: inviteDialog.user.id, name: inviteDialog.user.name, email: inviteDialog.user.email } : null}
        isResend={inviteDialog.isResend}
        onSent={() => loadAll()}
      />

      <EditFinanceContactDialog
        open={!!editUser}
        onOpenChange={(o) => { if (!o) setEditUser(null); }}
        contact={editUser ? {
          id: editUser.id,
          name: editUser.name,
          email: editUser.email,
          company: editUser.company,
          contact_type: editUser.contact_type,
          is_default: editUser.is_default,
          hasPortalUser: !!editUser.portal_user,
        } : null}
        onSaved={() => loadAll()}
      />

      <AlertDialog open={!!deleteUser} onOpenChange={(o) => { if (!o) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete finance contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUser?.name} will be marked inactive and removed from active finance contact lists. Any existing portal access will be revoked. Client assignments and history are preserved for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteContact(deleteUser)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardThemeFrame>
  );
}

function StatCard({
  label, value, tone = 'default',
}: {
  label: string; value: number; tone?: 'default' | 'success' | 'info' | 'muted' | 'destructive';
}) {
  const toneCls = {
    default:     'text-foreground',
    success:     'text-success',
    info:        'text-primary',
    muted:       'text-muted-foreground',
    destructive: 'text-destructive',
  }[tone];
  return (
    <DashboardThemeFrame variant="premiumCard">
      <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
    </DashboardThemeFrame>
  );
}
