import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { 
  Users, Shield, Mail, Plus, Trash2, Edit, Crown, UserPlus, Key,
  Settings, AlertCircle, ShieldOff, Clock
} from 'lucide-react';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { useNotifications } from '@/contexts/NotificationsContext';
import { PermissionsGrid } from '@/components/admin/PermissionsGrid';
import { ResetPasswordDialog } from '@/components/admin/ResetPasswordDialog';
import { SoftDeletedUsersPanel } from '@/components/admin/SoftDeletedUsersPanel';
import { formatDistanceToNow } from 'date-fns';

interface User {
  id: string;
  username: string;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
  user_roles: Array<{ role: string }>;
  personal_mailbox: string | null;
}

interface Module {
  id: string;
  module_key: string;
  module_name: string;
  description: string;
  category: string;
}

interface PermissionSetting {
  module_key: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export default function UserManagement() {
  const { user } = useAuth();
  const { isSuperadmin, loading: permLoading } = usePermissions();
  const { addNotification } = useNotifications();
  
  const [users, setUsers] = useState<User[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Invite state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteType, setInviteType] = useState<'magic_link' | 'temp_password'>('magic_link');
  const [invitePermissions, setInvitePermissions] = useState<PermissionSetting[]>([]);
  const [inviteSending, setInviteSending] = useState(false);

  // Create sub-admin state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createMailbox, setCreateMailbox] = useState('');
  const [createPermissions, setCreatePermissions] = useState<PermissionSetting[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit permissions state
  const [editPermDialogOpen, setEditPermDialogOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<PermissionSetting[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Mailbox editing state
  const [mailboxDialogOpen, setMailboxDialogOpen] = useState(false);
  const [editingMailboxUserId, setEditingMailboxUserId] = useState<string | null>(null);
  const [editingMailboxValue, setEditingMailboxValue] = useState('');
  const [savingMailbox, setSavingMailbox] = useState(false);

  // Reset password state
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [resetPwUser, setResetPwUser] = useState<{ id: string; username: string } | null>(null);

  useEffect(() => {
    if (isSuperadmin) {
      fetchUsers();
      fetchModules();
    }
  }, [isSuperadmin]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await invokeSecureFunction('admin-user-management', {
        action: 'list_users'
      });
      if (data?.success) {
        setUsers(data.users);
      } else {
        toast.error(data?.error || error?.message || 'Failed to fetch users');
      }
    } catch {
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchModules = async () => {
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'list_modules'
      });
      if (data?.success) {
        setModules(data.modules);
        const defaultPerms = data.modules.map((m: Module) => ({
          module_key: m.module_key, can_view: true, can_edit: false, can_delete: false,
        }));
        setInvitePermissions(defaultPerms);
        setCreatePermissions(defaultPerms);
      }
    } catch (err) {
      console.error('Failed to fetch modules:', err);
    }
  };

  const fetchUserPermissions = async (userId: string) => {
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'get_user_permissions', user_id: userId
      });
      if (data?.success) {
        const perms = data.permissions.map((p: any) => ({
          module_key: p.dashboard_modules?.module_key,
          can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete,
        })).filter((p: any) => p.module_key);
        
        const allPerms = modules.map(m => {
          const existing = perms.find((p: any) => p.module_key === m.module_key);
          return existing || { module_key: m.module_key, can_view: false, can_edit: false, can_delete: false };
        });
        setEditPermissions(allPerms);
      }
    } catch {
      toast.error('Failed to fetch permissions');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) { toast.error('Email is required'); return; }
    setInviteSending(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'send_invite',
        invite_data: {
          email: inviteEmail, username: inviteUsername || undefined,
          invite_type: inviteType, permissions: invitePermissions.filter(p => p.can_view),
        }
      });
      if (data?.success) {
        toast.success('Invite sent successfully!');
        if (data.temporary_password) {
          toast.info(`Temporary password: ${data.temporary_password}`, { duration: 10000 });
        }
        logActivityDirect({ actionType: 'user_invited', entityType: 'user', entityName: inviteEmail, metadata: { invite_type: inviteType } });
        addNotification({ type: 'new_user_invited', title: 'User Invite Sent', message: `Invitation sent to ${inviteEmail}` });
        setInviteDialogOpen(false);
        setInviteEmail('');
        setInviteUsername('');
      } else {
        toast.error(data?.error || 'Failed to send invite');
      }
    } catch { toast.error('Failed to send invite'); }
    finally { setInviteSending(false); }
  };

  const handleSavePermissions = async () => {
    if (!editingUserId) return;
    const targetUser = users.find(u => u.id === editingUserId);
    setSavingPermissions(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'update_permissions', user_id: editingUserId,
        permissions: editPermissions.filter(p => p.can_view),
      });
      if (data?.success) {
        toast.success('Permissions updated');
        logActivityDirect({ actionType: 'user_permissions_changed', entityType: 'user', entityId: editingUserId, entityName: targetUser?.username, metadata: { permissions_count: editPermissions.filter(p => p.can_view).length } });
        addNotification({ type: 'user_role_updated', title: 'User Permissions Updated', message: `Permissions for ${targetUser?.username || 'user'} have been updated`, entityId: editingUserId });
        setEditPermDialogOpen(false);
        fetchUsers();
      } else {
        toast.error(data?.error || 'Failed to update permissions');
      }
    } catch { toast.error('Failed to update permissions'); }
    finally { setSavingPermissions(false); }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'update_user', user_id: userId, is_active: isActive,
      });
      if (data?.success) {
        const targetUser = users.find(u => u.id === userId);
        toast.success(isActive ? 'User activated' : 'User deactivated');
        logActivityDirect({ actionType: isActive ? 'user_activated' : 'user_deactivated', entityType: 'user', entityId: userId, entityName: targetUser?.username, metadata: { is_active: isActive } });
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to update user'); }
    } catch { toast.error('Failed to update user'); }
  };

  const handlePromoteToSuperadmin = async (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', { action: 'promote_to_superadmin', user_id: userId });
      if (data?.success) {
        toast.success('User promoted to superadmin');
        logActivityDirect({ actionType: 'user_invited', entityType: 'user', entityId: userId, entityName: targetUser?.username, metadata: { action: 'promoted_to_superadmin' } });
        addNotification({ type: 'user_role_updated', title: 'User Promoted to Superadmin', message: `${targetUser?.username || 'User'} has been promoted to superadmin`, entityId: userId });
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to promote user'); }
    } catch { toast.error('Failed to promote user'); }
  };

  const handleDemoteFromSuperadmin = async (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', { action: 'demote_from_superadmin', user_id: userId });
      if (data?.success) {
        toast.success('User demoted to admin');
        logActivityDirect({ actionType: 'user_deactivated', entityType: 'user', entityId: userId, entityName: targetUser?.username, metadata: { action: 'demoted_from_superadmin' } });
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to demote user'); }
    } catch { toast.error('Failed to demote user'); }
  };

  const handleDeleteUser = async (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', { action: 'delete_user', user_id: userId });
      if (data?.success) {
        toast.success('User moved to deleted');
        logActivityDirect({ actionType: 'user_deactivated', entityType: 'user', entityId: userId, entityName: targetUser?.username, metadata: { action: 'soft_deleted' } });
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to delete user'); }
    } catch { toast.error('Failed to delete user'); }
  };

  const openEditPermissions = (userId: string) => {
    setEditingUserId(userId);
    fetchUserPermissions(userId);
    setEditPermDialogOpen(true);
  };

  const updatePermission = (setter: React.Dispatch<React.SetStateAction<PermissionSetting[]>>) =>
    (moduleKey: string, field: 'can_view' | 'can_edit' | 'can_delete', value: boolean) => {
      setter(prev => prev.map(p => p.module_key === moduleKey ? { ...p, [field]: value } : p));
    };

  const handleCreateSubAdmin = async () => {
    if (!createUsername || !createPassword) { toast.error('Username and password are required'); return; }
    if (createPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setCreating(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'create_subadmin',
        subadmin_data: {
          username: createUsername, password: createPassword,
          email: createEmail || undefined, personal_mailbox: createMailbox || undefined,
          permissions: createPermissions.filter(p => p.can_view),
        }
      });
      if (data?.success) {
        toast.success('Sub-admin created successfully!');
        logActivityDirect({ actionType: 'user_invited', entityType: 'user', entityId: data.user_id, entityName: createUsername, metadata: { action: 'created_subadmin' } });
        addNotification({ type: 'new_user_invited', title: 'New Sub-Admin Created', message: `${createUsername} has been added as a sub-admin`, entityId: data.user_id });
        setCreateDialogOpen(false);
        setCreateUsername(''); setCreatePassword(''); setCreateEmail(''); setCreateMailbox('');
        setCreatePermissions(modules.map(m => ({ module_key: m.module_key, can_view: true, can_edit: false, can_delete: false })));
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to create sub-admin'); }
    } catch { toast.error('Failed to create sub-admin'); }
    finally { setCreating(false); }
  };

  const openMailboxDialog = (userId: string, currentMailbox: string | null) => {
    setEditingMailboxUserId(userId);
    setEditingMailboxValue(currentMailbox || '');
    setMailboxDialogOpen(true);
  };

  const handleSaveMailbox = async () => {
    if (!editingMailboxUserId) return;
    setSavingMailbox(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'update_user', user_id: editingMailboxUserId, personal_mailbox: editingMailboxValue || null,
      });
      if (data?.success) {
        toast.success('Mailbox updated');
        setMailboxDialogOpen(false);
        fetchUsers();
      } else { toast.error(data?.error || 'Failed to update mailbox'); }
    } catch { toast.error('Failed to update mailbox'); }
    finally { setSavingMailbox(false); }
  };

  if (permLoading) {
    return <div className="p-6 flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  }

  if (!isSuperadmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>You don't have permission to access this page. Superadmin access required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            User Management
          </h1>
          <p className="text-muted-foreground">Manage users, roles, and permissions</p>
        </div>
        
        <div className="flex gap-2">
          {/* Create Sub-Admin Button */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Sub-Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Sub-Admin</DialogTitle>
                <DialogDescription>Create a new sub-admin account with specific permissions.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username *</Label>
                    <Input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} placeholder="username" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password *</Label>
                    <Input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min 6 characters" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email (optional)</Label>
                    <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Personal Mailbox (optional)</Label>
                    <Input type="email" value={createMailbox} onChange={(e) => setCreateMailbox(e.target.value)} placeholder="mailbox@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Module Permissions</Label>
                  <PermissionsGrid
                    modules={modules}
                    permissions={createPermissions}
                    onUpdate={updatePermission(setCreatePermissions)}
                    onApplyPreset={setCreatePermissions}
                  />
                </div>
                <Button onClick={handleCreateSubAdmin} disabled={creating} className="w-full">
                  {creating ? 'Creating...' : 'Create Sub-Admin'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invite User Button */}
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Invite New User</DialogTitle>
                <DialogDescription>Send an invitation to join the dashboard with specific permissions.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Username (optional)</Label>
                    <Input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Leave blank to use email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Invite Method</Label>
                  <Select value={inviteType} onValueChange={(v: 'magic_link' | 'temp_password') => setInviteType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magic_link"><div className="flex items-center gap-2"><Mail className="h-4 w-4" />Magic Link</div></SelectItem>
                      <SelectItem value="temp_password"><div className="flex items-center gap-2"><Key className="h-4 w-4" />Temporary Password</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Module Permissions</Label>
                  <PermissionsGrid
                    modules={modules}
                    permissions={invitePermissions}
                    onUpdate={updatePermission(setInvitePermissions)}
                    onApplyPreset={setInvitePermissions}
                  />
                </div>
                <Button onClick={handleSendInvite} disabled={inviteSending} className="w-full">
                  {inviteSending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>Manage user accounts and their access levels</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === user?.id;
                  const hasSuperadmin = u.user_roles?.some(r => r.role === 'superadmin');
                  const hasAdmin = u.user_roles?.some(r => r.role === 'admin');
                  
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {u.username}
                            {isSelf && <Badge variant="outline" className="text-xs">You</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">{u.email || 'No email'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hasSuperadmin && <Badge className="bg-amber-500"><Crown className="h-3 w-3 mr-1" />Superadmin</Badge>}
                          {hasAdmin && !hasSuperadmin && <Badge variant="secondary"><Shield className="h-3 w-3 mr-1" />Admin</Badge>}
                          {!hasSuperadmin && !hasAdmin && <Badge variant="outline">User</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {u.personal_mailbox ? (
                            <span className="text-sm">{u.personal_mailbox}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Not set</span>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openMailboxDialog(u.id, u.personal_mailbox)} className="h-6 w-6 p-0">
                            <Mail className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={u.is_active} onCheckedChange={(v) => handleToggleActive(u.id, v)} disabled={isSelf} />
                          <span className={u.is_active ? 'text-green-600' : 'text-muted-foreground'}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.last_login_at ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground" title={new Date(u.last_login_at).toLocaleString()}>
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!hasSuperadmin && !isSelf && (
                            <Button variant="outline" size="sm" onClick={() => openEditPermissions(u.id)} title="Edit Permissions">
                              <Settings className="h-4 w-4" />
                            </Button>
                          )}
                          {!isSelf && (
                            <Button variant="outline" size="sm" onClick={() => { setResetPwUser({ id: u.id, username: u.username }); setResetPwDialogOpen(true); }} title="Reset Password">
                              <Key className="h-4 w-4" />
                            </Button>
                          )}
                          {!hasSuperadmin && !isSelf && (
                            <Button variant="outline" size="sm" onClick={() => handlePromoteToSuperadmin(u.id)} title="Promote to Superadmin">
                              <Crown className="h-4 w-4" />
                            </Button>
                          )}
                          {hasSuperadmin && !isSelf && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" title="Demote to Admin">
                                  <ShieldOff className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Demote from Superadmin?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove superadmin privileges from <strong>{u.username}</strong>. They will become a regular admin.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDemoteFromSuperadmin(u.id)}>Demote</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {!isSelf && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" title="Delete User">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will soft-delete <strong>{u.username}</strong>. They will be deactivated and can be restored later or permanently purged.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteUser(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Soft-Deleted Users */}
      <SoftDeletedUsersPanel />

      {/* Edit Permissions Dialog */}
      <Dialog open={editPermDialogOpen} onOpenChange={setEditPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>
              Update module access for {users.find(u => u.id === editingUserId)?.username || 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PermissionsGrid
              modules={modules}
              permissions={editPermissions}
              onUpdate={updatePermission(setEditPermissions)}
              onApplyPreset={setEditPermissions}
            />
            <Button onClick={handleSavePermissions} disabled={savingPermissions} className="w-full">
              {savingPermissions ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      {resetPwUser && (
        <ResetPasswordDialog
          open={resetPwDialogOpen}
          onOpenChange={setResetPwDialogOpen}
          userId={resetPwUser.id}
          username={resetPwUser.username}
        />
      )}

      {/* Edit Mailbox Dialog */}
      <Dialog open={mailboxDialogOpen} onOpenChange={setMailboxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Personal Mailbox</DialogTitle>
            <DialogDescription>Set the personal email mailbox for this user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Personal Mailbox Email</Label>
              <Input type="email" value={editingMailboxValue} onChange={(e) => setEditingMailboxValue(e.target.value)} placeholder="user@example.com" />
              <p className="text-xs text-muted-foreground">This mailbox will be used for this user's email communications.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMailboxDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSaveMailbox} disabled={savingMailbox} className="flex-1">
                {savingMailbox ? 'Saving...' : 'Save Mailbox'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
