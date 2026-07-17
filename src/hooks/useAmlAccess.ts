import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthenticatedSupabase } from "@/hooks/useAuthenticatedSupabase";

export type AmlRole = "analyst" | "reviewer" | "mlro" | "auditor";

export interface AmlAccess {
  loading: boolean;
  flagEnabled: boolean;
  roles: Set<AmlRole>;
  hasAnyRole: boolean;
  canWrite: boolean;
  isMlro: boolean;
  refresh: () => Promise<void>;
}

export function useAmlAccess(): AmlAccess {
  const { user, loading: authLoading } = useAuth();
  const { supabase: authenticatedSupabase, isAuthenticated } = useAuthenticatedSupabase();
  const [loading, setLoading] = useState(true);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [roles, setRoles] = useState<Set<AmlRole>>(new Set());

  const load = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    setLoading(true);
    try {
      const uid = user?.id;

      if (!uid || !isAuthenticated) {
        setFlagEnabled(false);
        setRoles(new Set());
        return;
      }

      const [{ data: flag }, roleResult] = await Promise.all([
        authenticatedSupabase.from("feature_flags").select("value").eq("key", "aml_ctf").maybeSingle(),
        authenticatedSupabase.schema("aml" as any).from("role_assignments" as any)
          .select("role").eq("user_id", uid).is("revoked_at", null),
      ]);

      const val = (flag?.value ?? {}) as { enabled?: boolean };
      setFlagEnabled(Boolean(val?.enabled));
      setRoles(new Set(((roleResult as any).data ?? []).map((r: any) => r.role as AmlRole)));
    } catch (e) {
      console.warn("useAmlAccess failed", e);
      setFlagEnabled(false);
      setRoles(new Set());
    } finally {
      setLoading(false);
    }
  }, [authLoading, authenticatedSupabase, isAuthenticated, user?.id]);

  useEffect(() => { load(); }, [load]);

  return {
    loading,
    flagEnabled,
    roles,
    hasAnyRole: roles.size > 0,
    canWrite: roles.has("analyst") || roles.has("reviewer") || roles.has("mlro"),
    isMlro: roles.has("mlro"),
    refresh: load,
  };
}
