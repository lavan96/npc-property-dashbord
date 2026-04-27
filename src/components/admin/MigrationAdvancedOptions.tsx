import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2 } from 'lucide-react';

export type MigrationDomain = 'contacts' | 'opportunities' | 'conversations' | 'notes';

export interface AdvancedFlagsState {
  // Contacts (existing — kept for parity, controlled by parent)
  preserve_csv_structure: boolean;
  force_reingest: boolean;
  reuse_existing_mappings: boolean;
  bypass_sanitizer: boolean;

  // Opportunities
  force_recreate_opportunities: boolean;
  skip_target_dedupe_check: boolean;
  only_low_confidence: boolean;
  include_closed_statuses: boolean;
  pipeline_filter: string; // comma-separated names
  stage_filter: string;    // comma-separated names
  assigned_user_strategy: 'single' | 'map_by_email' | 'omit';

  // Conversations
  message_direction: 'all' | 'inbound' | 'outbound';
  channel_filter: string; // e.g. "SMS,Email"
  date_range_days: string; // numeric string; '' = no limit
  skip_attachments: boolean;

  // Notes
  force_overwrite_existing: boolean;
  min_content_length: string; // numeric string
  prefix_legacy_marker: boolean;
}

export const DEFAULT_ADVANCED_FLAGS: AdvancedFlagsState = {
  preserve_csv_structure: true,
  force_reingest: true,
  reuse_existing_mappings: false,
  bypass_sanitizer: false,

  force_recreate_opportunities: false,
  skip_target_dedupe_check: false,
  only_low_confidence: false,
  include_closed_statuses: false,
  pipeline_filter: '',
  stage_filter: '',
  assigned_user_strategy: 'single',

  message_direction: 'all',
  channel_filter: '',
  date_range_days: '',
  skip_attachments: false,

  force_overwrite_existing: false,
  min_content_length: '',
  prefix_legacy_marker: false,
};

/**
 * Build a domain-scoped payload patch from the flag state.
 * Only emits keys that the selected worker actually honours, so other workers
 * never receive (and silently ignore) flags that don't apply.
 */
export function buildDomainPayloadPatch(domain: MigrationDomain, f: AdvancedFlagsState): Record<string, any> {
  if (domain === 'contacts') {
    return {
      preserve_csv_structure: f.preserve_csv_structure,
      force_reingest: f.force_reingest,
      reuse_existing_mappings: f.reuse_existing_mappings,
      allow_name_dedupe: f.reuse_existing_mappings,
      bypass_sanitizer: f.bypass_sanitizer,
    };
  }
  if (domain === 'opportunities') {
    const splitCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    return {
      force_recreate_opportunities: f.force_recreate_opportunities,
      skip_target_dedupe_check: f.skip_target_dedupe_check,
      only_low_confidence: f.only_low_confidence,
      include_closed_statuses: f.include_closed_statuses,
      ...(f.pipeline_filter ? { pipeline_filter: splitCsv(f.pipeline_filter) } : {}),
      ...(f.stage_filter ? { stage_filter: splitCsv(f.stage_filter) } : {}),
      assigned_user_strategy: f.assigned_user_strategy,
    };
  }
  if (domain === 'conversations') {
    const splitCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const days = parseInt(f.date_range_days, 10);
    return {
      message_direction: f.message_direction,
      ...(f.channel_filter ? { channel_filter: splitCsv(f.channel_filter) } : {}),
      ...(Number.isFinite(days) && days > 0 ? { date_range_days: days } : {}),
      skip_attachments: f.skip_attachments,
    };
  }
  if (domain === 'notes') {
    const minLen = parseInt(f.min_content_length, 10);
    return {
      force_overwrite_existing: f.force_overwrite_existing,
      ...(Number.isFinite(minLen) && minLen > 0 ? { min_content_length: minLen } : {}),
      prefix_legacy_marker: f.prefix_legacy_marker,
    };
  }
  return {};
}

interface Props {
  domain: MigrationDomain;
  flags: AdvancedFlagsState;
  onChange: (next: AdvancedFlagsState) => void;
}

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: React.ReactNode;
  destructive?: boolean;
}> = ({ checked, onChange, title, description, destructive }) => (
  <div className={`rounded-md border p-3 ${destructive && checked ? 'border-destructive/60 bg-destructive/10' : 'border-border/60 bg-muted/20'}`}>
    <label className="flex items-start gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <strong>{title}</strong>
        <div className="mt-1 text-muted-foreground">{description}</div>
      </span>
    </label>
  </div>
);

const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
  type?: 'text' | 'number';
}> = ({ label, value, onChange, placeholder, description, type = 'text' }) => (
  <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
    <label className="text-xs font-medium">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
    />
    {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
  </div>
);

export const MigrationAdvancedOptions: React.FC<Props> = ({ domain, flags, onChange }) => {
  const set = <K extends keyof AdvancedFlagsState>(k: K, v: AdvancedFlagsState[K]) =>
    onChange({ ...flags, [k]: v });

  return (
    <div className="rounded-md border border-primary/30 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Advanced options</h3>
        <Badge variant="outline" className="text-[10px] uppercase">{domain}</Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Only flags supported by the <strong>{domain}</strong> worker are shown.
        </span>
      </div>

      {domain === 'contacts' && (
        <div className="space-y-3">
          <Toggle
            checked={flags.preserve_csv_structure}
            onChange={(v) => set('preserve_csv_structure', v)}
            title="Preserve legacy CSV structure (recommended)"
            description={<>Keep original source/list-like grouping signals (legacy <code>source</code>, tags, and metadata columns) instead of flattening all contacts under one export source.</>}
          />
          <Toggle
            checked={flags.force_reingest}
            onChange={(v) => set('force_reingest', v)}
            title="Force create-first contact writes (recommended after target wipe)"
            description={<>Ignore stale ID mappings and attempt individual <code>POST /contacts/</code> writes before any duplicate fallback.</>}
          />
          <Toggle
            checked={flags.reuse_existing_mappings}
            onChange={(v) => set('reuse_existing_mappings', v)}
            title="Reuse existing mappings / name matches"
            description="Off for wiped target accounts. Only enable when the target GHL account already contains trusted contacts that should be reused instead of created."
          />
          <Toggle
            destructive
            checked={flags.bypass_sanitizer}
            onChange={(v) => set('bypass_sanitizer', v)}
            title="⚠ Bypass sanitizer — force 100% migration"
            description={<>Copies <em>every</em> legacy contact, even those with junk names or no email/phone. Synthetic placeholders are tagged for cleanup.</>}
          />
        </div>
      )}

      {domain === 'opportunities' && (
        <div className="space-y-3">
          <Toggle
            checked={flags.force_recreate_opportunities}
            onChange={(v) => set('force_recreate_opportunities', v)}
            title="Force recreate opportunities"
            description={<>Bypass existing <code>ghl_id_mapping</code> rows and create fresh opportunities in the target. Use after a target-account wipe.</>}
          />
          <Toggle
            checked={flags.skip_target_dedupe_check}
            onChange={(v) => set('skip_target_dedupe_check', v)}
            title="Skip target dedupe check"
            description="Disables the strict name + monetaryValue matcher. Faster on empty target accounts, but unsafe if data already exists in the target."
          />
          <Toggle
            checked={flags.only_low_confidence}
            onChange={(v) => set('only_low_confidence', v)}
            title="Only re-process low-confidence mappings"
            description="Re-runs the matcher only for items previously marked low confidence (e.g. ambiguous 3:1 collisions). Safer than a full force-recreate."
          />
          <Toggle
            checked={flags.include_closed_statuses}
            onChange={(v) => set('include_closed_statuses', v)}
            title="Include closed statuses (won/lost/abandoned)"
            description="By default the worker skips closed deals. Enable to migrate historical closed-out opportunities for reporting parity."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Pipeline filter (comma-separated names)"
              value={flags.pipeline_filter}
              onChange={(v) => set('pipeline_filter', v)}
              placeholder="Sales Pipeline, Refinance"
              description="Empty = all pipelines."
            />
            <TextField
              label="Stage filter (comma-separated names)"
              value={flags.stage_filter}
              onChange={(v) => set('stage_filter', v)}
              placeholder="New Lead, Qualified"
              description="Empty = all stages."
            />
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
            <label className="text-xs font-medium">Assigned-user strategy</label>
            <Select value={flags.assigned_user_strategy} onValueChange={(v) => set('assigned_user_strategy', v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single — use one target user (current default)</SelectItem>
                <SelectItem value="map_by_email">Map by email — match source assignee email → target user</SelectItem>
                <SelectItem value="omit">Omit — leave assignedTo empty in the target</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              <code>map_by_email</code> falls back to the configured single user when no email match is found.
            </p>
          </div>
        </div>
      )}

      {domain === 'conversations' && (
        <div className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1.5">
            <label className="text-xs font-medium">Message direction</label>
            <Select value={flags.message_direction} onValueChange={(v) => set('message_direction', v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All messages</SelectItem>
                <SelectItem value="inbound">Inbound only</SelectItem>
                <SelectItem value="outbound">Outbound only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Channel filter (comma-separated)"
              value={flags.channel_filter}
              onChange={(v) => set('channel_filter', v)}
              placeholder="SMS, Email, IG"
              description="Empty = all channels."
            />
            <TextField
              label="Date range (last N days)"
              value={flags.date_range_days}
              onChange={(v) => set('date_range_days', v)}
              placeholder="90"
              description="Empty = no date limit."
              type="number"
            />
          </div>
          <Toggle
            checked={flags.skip_attachments}
            onChange={(v) => set('skip_attachments', v)}
            title="Skip attachments"
            description="Drop attachment payloads from the mirrored messages. Useful for fast catch-up syncs where only message bodies are needed."
          />
        </div>
      )}

      {domain === 'notes' && (
        <div className="space-y-3">
          <Toggle
            checked={flags.force_overwrite_existing}
            onChange={(v) => set('force_overwrite_existing', v)}
            title="Force overwrite existing notes"
            description="Re-create notes in the target even when a mapping exists. Required after a target wipe."
          />
          <TextField
            label="Minimum content length (characters)"
            value={flags.min_content_length}
            onChange={(v) => set('min_content_length', v)}
            placeholder="3"
            description="Drops empty/stub notes (e.g. GHL system markers) below the threshold. Empty = keep all."
            type="number"
          />
          <Toggle
            checked={flags.prefix_legacy_marker}
            onChange={(v) => set('prefix_legacy_marker', v)}
            title="Prefix migrated notes with [Migrated]"
            description="Prepends a marker to the note body so it's easy to identify and clean up in the target account later."
          />
        </div>
      )}
    </div>
  );
};
