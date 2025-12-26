import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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

  const fetchPermissions = useCallback(async () => {
    // Don't fetch if auth is still loading or no user
    if (authLoading) {
      return;
    }

    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      console.log('[Permissions] Fetching permissions for user:', user.username, 'isSuperadmin:', isSuperadmin);
      
      // If superadmin, they have access to everything
      if (isSuperadmin) {
        // Fetch all modules for superadmin
        const { data: modules, error: modulesError } = await supabase
          .from('dashboard_modules')
          .select('module_key, module_name')
          .eq('is_active', true);

        if (modulesError) {
          console.error('[Permissions] Error fetching modules for superadmin:', modulesError);
        }

        if (!modulesError && modules) {
          console.log('[Permissions] Superadmin granted access to', modules.length, 'modules');
          setPermissions(modules.map(m => ({
            module_key: m.module_key,
            module_name: m.module_name,
            can_view: true,
            can_edit: true,
            can_delete: true,
          })));
        }
      } else {
        // Fetch specific permissions for non-superadmin users
        console.log('[Permissions] Fetching specific permissions for user ID:', user.id);
        
        const { data: userPermissions, error: permError } = await supabase
          .from('user_permissions')
          .select(`
            can_view,
            can_edit,
            can_delete,
            dashboard_modules(module_key, module_name)
          `)
          .eq('user_id', user.id);

        if (permError) {
          console.error('[Permissions] Error fetching user permissions:', permError);
        } else {
          console.log('[Permissions] Raw permissions data:', userPermissions);
          
          if (userPermissions && userPermissions.length > 0) {
            const mappedPermissions = userPermissions
              .filter(p => p.can_view) // Only include permissions where can_view is true
              .map(p => ({
                module_key: (p.dashboard_modules as any)?.module_key || '',
                module_name: (p.dashboard_modules as any)?.module_name || '',
                can_view: p.can_view,
                can_edit: p.can_edit,
                can_delete: p.can_delete,
              }))
              .filter(p => p.module_key);
            
            console.log('[Permissions] Mapped permissions:', mappedPermissions.length, 'modules accessible');
            setPermissions(mappedPermissions);
          } else {
            console.log('[Permissions] No permissions found for user');
            setPermissions([]);
          }
        }
      }
    } catch (error) {
      console.error('[Permissions] Error in fetchPermissions:', error);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, isSuperadmin]);

  // Fetch permissions when auth state changes and is ready
  useEffect(() => {
    // Only fetch when auth is no longer loading
    if (!authLoading) {
      console.log('[Permissions] Auth ready, fetching permissions. User:', user?.username, 'Roles:', roles);
      fetchPermissions();
    }
  }, [authLoading, user?.id, isSuperadmin, fetchPermissions]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_view || false;
  }, [isSuperadmin, permissions]);

  const canEdit = useCallback((moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_edit || false;
  }, [isSuperadmin, permissions]);

  const canDelete = useCallback((moduleKey: string): boolean => {
    if (isSuperadmin) return true;
    const perm = permissions.find(p => p.module_key === moduleKey);
    return perm?.can_delete || false;
  }, [isSuperadmin, permissions]);

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