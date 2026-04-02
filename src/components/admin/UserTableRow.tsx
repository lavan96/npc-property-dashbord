import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Crown, Key, Mail, Settings, ShieldOff, Trash2, Shield, Copy } from 'lucide-react';
import { Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

interface UserTableRowProps {
  u: User;
  isSelf: boolean;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onEditPermissions: (userId: string) => void;
  onResetPassword: (user: { id: string; username: string }) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onDelete: (userId: string) => void;
  onEditMailbox: (userId: string, currentMailbox: string | null) => void;
  onClonePermissions: (userId: string) => void;
}

export function UserTableRow({
  u, isSelf, onToggleActive, onEditPermissions, onResetPassword,
  onPromote, onDemote, onDelete, onEditMailbox, onClonePermissions,
}: UserTableRowProps) {
  const hasSuperadmin = u.user_roles?.some(r => r.role === 'superadmin');
  const hasAdmin = u.user_roles?.some(r => r.role === 'admin');

  return (
    <TableRow>
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
          <Button variant="ghost" size="sm" onClick={() => onEditMailbox(u.id, u.personal_mailbox)} className="h-6 w-6 p-0">
            <Mail className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={u.is_active} onCheckedChange={(v) => onToggleActive(u.id, v)} disabled={isSelf} />
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
        <TooltipProvider>
          <div className="flex items-center justify-end gap-1">
            {!hasSuperadmin && !isSelf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => onEditPermissions(u.id)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Permissions</TooltipContent>
              </Tooltip>
            )}
            {!hasSuperadmin && !isSelf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => onClonePermissions(u.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clone Permissions To Another User</TooltipContent>
              </Tooltip>
            )}
            {!isSelf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => onResetPassword({ id: u.id, username: u.username })}>
                    <Key className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset Password</TooltipContent>
              </Tooltip>
            )}
            {!hasSuperadmin && !isSelf && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => onPromote(u.id)}>
                    <Crown className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Promote to Superadmin</TooltipContent>
              </Tooltip>
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
                    <AlertDialogAction onClick={() => onDemote(u.id)}>Demote</AlertDialogAction>
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
                    <AlertDialogAction onClick={() => onDelete(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}
