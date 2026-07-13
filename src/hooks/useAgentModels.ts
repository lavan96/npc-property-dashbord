/**
 * React Query hook that returns the live agent_model_assignments rows the
 * UI needs to render "which model is powering this feature" chips.
 *
 * Data source: `agent-models-read` edge function (service-role read),
 * cached with @tanstack/react-query and kept fresh by a single Postgres
 * realtime subscription on `agent_model_assignments`. When the Model Hub
 * updates an assignment, every consumer re-renders within a heartbeat.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AGENT_SURFACES, type AgentSurfaceId, findSurfaceByKey } from '@/lib/agentModels/agentKeys';
import { formatModelDisplay, type ModelDisplay } from '@/lib/agentModels/modelDisplay';


export type AgentAssignment = {
  agent_key: string;
  agent_label: string;
  agent_category: string;
  agent_description: string | null;
  route: string;
  model_id: string;
  fallback_chain: Array<{ route: string; model_id: string }>;
  temperature: number | null;
  max_tokens: number | null;
  reasoning_effort: string | null;
  is_locked: boolean;
  last_used_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type ResolvedSlot = {
  agentKey: string;
  slotLabel: string;
  slotDescription?: string;
  assignment: AgentAssignment | null;
  display: ModelDisplay;
};

const QUERY_KEY = ['agent-model-assignments'] as const;

async function fetchAssignments(): Promise<AgentAssignment[]> {
  const { data, error } = await supabase.functions.invoke('agent-models-read', {
    body: { action: 'list' },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? 'Failed to load model assignments');
  return (data.assignments ?? []) as AgentAssignment[];
}

/**
 * Root hook — fetches every assignment once, keeps them in sync via
 * realtime, and exposes selector helpers. Cheap to call from many
 * components because @tanstack/react-query dedupes the request.
 */
export function useAgentModels() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAssignments,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel('agent-model-assignments-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_model_assignments' },
        () => {
          // Invalidate rather than patch — the edge function normalizes
          // fallback_chain and other JSON shapes we don't want to re-derive here.
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const byKey = useMemo(() => {
    const map = new Map<string, AgentAssignment>();
    (query.data ?? []).forEach((row) => map.set(row.agent_key, row));
    return map;
  }, [query.data]);

  return {
    ...query,
    assignments: query.data ?? [],
    byKey,
    /** Force a refetch — called by the Model Hub after a successful update. */
    invalidate: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  };
}

/** Resolve a single agent_key into a display-ready slot record. */
export function useAgentModel(agentKey: string): ResolvedSlot {
  const { byKey } = useAgentModels();
  const assignment = byKey.get(agentKey) ?? null;
  const meta = findSurfaceByKey(agentKey);
  return {
    agentKey,
    slotLabel: meta?.slot.slotLabel ?? 'Primary',
    slotDescription: meta?.slot.slotDescription,
    assignment,
    display: formatModelDisplay(assignment?.model_id),
  };
}

/** Resolve every slot on a surface (e.g. Report Q&A → 4 slots). */
export function useAgentSurface(surfaceId: AgentSurfaceId): {
  surface: (typeof AGENT_SURFACES)[AgentSurfaceId];
  slots: ResolvedSlot[];
  isLoading: boolean;
} {
  const { byKey, isLoading } = useAgentModels();
  const surface = AGENT_SURFACES[surfaceId];
  const slots = useMemo(
    () =>
      surface.slots.map((slot) => {
        const assignment = byKey.get(slot.key) ?? null;
        return {
          agentKey: slot.key,
          slotLabel: slot.slotLabel,
          slotDescription: slot.slotDescription,
          assignment,
          display: formatModelDisplay(assignment?.model_id),
        };
      }),
    [byKey, surface],
  );
  return { surface, slots, isLoading };
}
