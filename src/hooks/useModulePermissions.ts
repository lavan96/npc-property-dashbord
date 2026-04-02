import { useMemo } from 'react';
import { usePermissions } from './usePermissions';

/**
 * Convenience hook that returns permission flags for a specific module.
 * Use in pages/components to conditionally show/hide edit/delete UI.
 * 
 * @example
 * const { canView, canEdit, canDelete } = useModulePermissions('clients');
 * // Then conditionally render buttons based on these flags
 */
export function useModulePermissions(moduleKey: string) {
  const { hasModuleAccess, canEdit, canDelete, isSuperadmin, loading } = usePermissions();

  return useMemo(() => ({
    canView: isSuperadmin || hasModuleAccess(moduleKey),
    canEdit: isSuperadmin || canEdit(moduleKey),
    canDelete: isSuperadmin || canDelete(moduleKey),
    loading,
  }), [moduleKey, isSuperadmin, hasModuleAccess, canEdit, canDelete, loading]);
}
