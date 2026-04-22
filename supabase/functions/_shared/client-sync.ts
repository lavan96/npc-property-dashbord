export type SyncSurface = 'internal_dashboard' | 'finance_portal' | 'client_portal' | 'automation' | 'external_system';

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return toHex(hash);
}

export function buildDocumentDedupeKey(input: {
  clientId: string;
  filename: string;
  fileSize: number;
  category?: string | null;
}) {
  const normalizedName = input.filename.trim().toLowerCase().replace(/\s+/g, '-');
  const normalizedCategory = (input.category || 'general').trim().toLowerCase();
  return `${input.clientId}:${normalizedCategory}:${input.fileSize}:${normalizedName}`;
}

export async function createSyncEvent(
  supabase: any,
  input: {
    clientId: string;
    entityId: string;
    entityTable: string;
    entityType: string;
    sourceSurface: SyncSurface;
    sourceActorType: 'internal_user' | 'finance_user' | 'client_user' | 'system';
    sourceActorName?: string | null;
    sourceReference?: string | null;
    sourceDetails?: Record<string, unknown>;
    syncStatus?: 'local' | 'synced' | 'duplicate' | 'superseded' | 'conflict';
    dedupeKey?: string | null;
    contentHash?: string | null;
    propagatedTo?: unknown[];
    versionGroupId?: string | null;
    versionNumber?: number;
    supersedesEntityId?: string | null;
    conflictReason?: string | null;
    conflictGroup?: string | null;
  },
) {
  try {
    await supabase.from('client_sync_events').insert({
      client_id: input.clientId,
      entity_id: input.entityId,
      entity_table: input.entityTable,
      entity_type: input.entityType,
      source_surface: input.sourceSurface,
      source_actor_type: input.sourceActorType,
      source_actor_name: input.sourceActorName ?? null,
      source_reference: input.sourceReference ?? null,
      source_details: input.sourceDetails ?? {},
      sync_status: input.syncStatus ?? 'synced',
      dedupe_key: input.dedupeKey ?? null,
      content_hash: input.contentHash ?? null,
      propagated_to: input.propagatedTo ?? [],
      version_group_id: input.versionGroupId ?? null,
      version_number: input.versionNumber ?? 1,
      supersedes_entity_id: input.supersedesEntityId ?? null,
      conflict_reason: input.conflictReason ?? null,
      conflict_group: input.conflictGroup ?? null,
    });
  } catch (error) {
    console.error('[client-sync] failed to create sync event', error);
  }
}