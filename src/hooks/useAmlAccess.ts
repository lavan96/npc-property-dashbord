import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [loading, setLoading] = useState(true);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [roles, setRoles] = useState<Set<AmlRole>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;

      const [{ data: flag }, roleResult] = await Promise.all([
        supabase.from("feature_flags").select("value").eq("key", "aml_ctf").maybeSingle(),
        uid
          ? supabase.schema("aml" as any).from("role_assignments" as any)
              .select("role").eq("user_id", uid).is("revoked_at", null)
          : Promise.resolve({ data: [] as any[] }),
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
  }, []);

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
