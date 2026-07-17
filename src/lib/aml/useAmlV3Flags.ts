import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * AML V3 — Phase 1 feature-flag reader.
 *
 * Reads the four V3 flags reserved in Phase 0 from `public.feature_flags`:
 *   - aml_v3_nav                    (this phase: switches the shell to V3 nav)
 *   - aml_v3_start_client_compliance (Phase 2)
 *   - aml_v3_compliance_home         (Phase 3)
 *   - aml_v3_case_workspace          (Phase 4/6)
 *
 * All default to `false`. When every flag is off the module behaves
 * byte-identically to the V2 shell — no user-visible change.
 */

export type AmlV3FlagKey =
  | "aml_v3_nav"
  | "aml_v3_start_client_compliance"
  | "aml_v3_compliance_home"
  | "aml_v3_case_workspace"
  | "aml_v3_regulatory_hub"
  | "aml_v3_terminology_editor"
  | "aml_v3_metrics_relocation";

export interface AmlV3Flags {
  v3Nav: boolean;
  startClientCompliance: boolean;
  complianceHome: boolean;
  caseWorkspace: boolean;
  regulatoryHub: boolean;
  terminologyEditor: boolean;
  metricsRelocation: boolean;
  loading: boolean;
}

const CACHE_KEY = "aml:v3_flags:v1";
type Cache = Omit<AmlV3Flags, "loading">;

let memory: Cache | null = null;
const subs = new Set<(f: Cache) => void>();

function readCache(): Cache | null {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) { memory = JSON.parse(raw) as Cache; return memory; }
  } catch { /* ignore */ }
  return null;
}

function writeCache(next: Cache) {
  memory = next;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  subs.forEach((fn) => fn(next));
}

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  if (value && typeof value === "object") {
    // { enabled: true } shape tolerated
    const enabled = (value as { enabled?: unknown }).enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return false;
}

export async function refreshAmlV3Flags(): Promise<Cache> {
  const keys: AmlV3FlagKey[] = [
    "aml_v3_nav",
    "aml_v3_start_client_compliance",
    "aml_v3_compliance_home",
    "aml_v3_case_workspace",
    "aml_v3_regulatory_hub",
    "aml_v3_terminology_editor",
    "aml_v3_metrics_relocation",
  ];
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key,value")
      .in("key", keys);
    if (error) throw error;
    const map = new Map((data ?? []).map((r) => [r.key, r.value]));
    const next: Cache = {
      v3Nav: coerceBool(map.get("aml_v3_nav")),
      startClientCompliance: coerceBool(map.get("aml_v3_start_client_compliance")),
      complianceHome: coerceBool(map.get("aml_v3_compliance_home")),
      caseWorkspace: coerceBool(map.get("aml_v3_case_workspace")),
      regulatoryHub: coerceBool(map.get("aml_v3_regulatory_hub")),
      terminologyEditor: coerceBool(map.get("aml_v3_terminology_editor")),
      metricsRelocation: coerceBool(map.get("aml_v3_metrics_relocation")),
    };
    writeCache(next);
    return next;
  } catch {
    const fallback: Cache = memory ?? {
      v3Nav: false,
      startClientCompliance: false,
      complianceHome: false,
      caseWorkspace: false,
      regulatoryHub: false,
      terminologyEditor: false,
      metricsRelocation: false,
    };
    return fallback;
  }
}

export function useAmlV3Flags(): AmlV3Flags {
  const cached = readCache();
  const [flags, setFlags] = useState<Cache>(
    cached ?? {
      v3Nav: false,
      startClientCompliance: false,
      complianceHome: false,
      caseWorkspace: false,
      regulatoryHub: false,
      terminologyEditor: false,
      metricsRelocation: false,
    },
  );
  const [loading, setLoading] = useState<boolean>(!cached);

  useEffect(() => {
    const listener = (f: Cache) => setFlags(f);
    subs.add(listener);
    if (!memory) {
      refreshAmlV3Flags().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => { subs.delete(listener); };
  }, []);

  return { ...flags, loading };
}
