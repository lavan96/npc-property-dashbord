import { usePermissions } from '@/hooks/usePermissions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ModuleGuardProps {
  moduleKey: string;
  children: React.ReactNode;
  /** If true, requires canEdit permission instead of just canView */
  requireEdit?: boolean;
  /** If true, requires canDelete permission */
  requireDelete?: boolean;
}

export function ModuleGuard({ moduleKey, children, requireEdit, requireDelete }: ModuleGuardProps) {
  const { hasModuleAccess, canEdit, canDelete, isSuperadmin, loading } = usePermissions();

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isSuperadmin) {
    return <>{children}</>;
  }

  if (!hasModuleAccess(moduleKey)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access this module. Contact your administrator to request access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (requireEdit && !canEdit(moduleKey)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You don't have edit permission for this module. Contact your administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (requireDelete && !canDelete(moduleKey)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You don't have delete permission for this module. Contact your administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
