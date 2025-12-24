import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Permission {
  module_key: string;
  module_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface PermissionsContextType {
  permissions: Permission[];
  roles: string[];
  isSuperadmin: boolean;
  isAdmin: boolean;
  loading: boolean;
  hasModuleAccess: (moduleKey: string) => boolean;
  canEdit: (moduleKey: string) => boolean;
  canDelete: (moduleKey: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isSuperadmin: authIsSuperadmin, isAdmin: authIsAdmin, roles: authRoles, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  // Use roles from auth context (server-verified)
  const isSuperadmin = authIsSuperadmin;
  const isAdmin = authIsAdmin;
  const roles = authRoles;

  const fetchPermissions = async () => {
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      // If superadmin, they have access to everything
      if (isSuperadmin) {
        // Fetch all modules for superadmin
        const { data: modules, error: modulesError } = await supabase
          .from('dashboard_modules')
          .select('module_key, module_name')
          .eq('is_active', true);

        if (!modulesError && modules) {
          setPermissions(modules.map(m => ({
            module_key: m.module_key,
            module_name: m.module_name,
            can_view: true,
            can_edit: true,
            can_delete: true,
          })));
        }
      } else {
        // Fetch specific permissions for non-superadmin users via edge function
        const sessionToken = localStorage.getItem('session_token');
        if (sessionToken) {
          const { data } = await supabase.functions.invoke('admin-user-management', {
            body: { action: 'get_own_profile', session_token: sessionToken }
          });
          
          // For non-superadmin, fetch their permissions
          const { data: userPermissions, error: permError } = await supabase
            .from('user_permissions')
            .select(`
              can_view,
              can_edit,
              can_delete,
              dashboard_modules(module_key, module_name)
            `)
            .eq('user_id', user.id);

          if (!permError && userPermissions) {
            setPermissions(userPermissions.map(p => ({
              module_key: (p.dashboard_modules as any)?.module_key || '',
              module_name: (p.dashboard_modules as any)?.module_name || '',
              can_view: p.can_view,
              can_edit: p.can_edit,
              can_delete: p.can_delete,
            })).filter(p => p.module_key));
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchPermissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchPermissions();
    }
  }, [user?.id, authLoading, isSuperadmin]);

  const hasModuleAccess = (moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_view || false;
  };

  const canEdit = (moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_edit || false;
  };

  const canDelete = (moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_delete || false;
  };

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        roles,
        isSuperadmin,
        isAdmin,
        loading: loading || authLoading,
        hasModuleAccess,
        canEdit,
        canDelete,
        refreshPermissions: fetchPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}