export function getSurfaceLabel(surface?: string | null) {
  switch (surface) {
    case 'internal_dashboard':
      return 'Internal';
    case 'finance_portal':
      return 'Finance portal';
    case 'client_portal':
      return 'Client portal';
    case 'automation':
      return 'Automation';
    case 'external_system':
      return 'External';
    default:
      return 'Unknown source';
  }
}

export function getSyncStatusLabel(status?: string | null) {
  switch (status) {
    case 'synced':
      return 'Synced';
    case 'duplicate':
      return 'Duplicate';
    case 'conflict':
      return 'Conflict';
    case 'superseded':
      return 'Superseded';
    case 'local':
      return 'Local only';
    default:
      return 'Unknown';
  }
}

export function getConflictReason(record: Record<string, any> | null | undefined) {
  if (!record) return null;
  return record.last_sync_error
    || record.conflict_reason
    || record.metadata?.conflict_reason
    || record.metadata?.source_details?.sync_conflict_reason
    || record.source_details?.sync_conflict_reason
    || null;
}

export function getActorLabel(record: Record<string, any> | null | undefined) {
  if (!record) return null;
  return record.source_actor_name
    || record.metadata?.source_actor_name
    || record.source_details?.actor_name
    || null;
}