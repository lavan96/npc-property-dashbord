import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Sparkles,
  FileText,
  Layers,
  BarChart3,
  Zap,
  Building2,
  ListChecks,
  Settings2,
  ExternalLink,
} from 'lucide-react';
import type { PropertyListing } from '@/lib/airtable';
import type { ReportScope, ReportTier } from '@/hooks/useReportPreferences';
import { buildFullAddress } from '@/lib/addressUtils';

const SCOPE_LABEL: Record<ReportScope, string> = {
  address: 'Address',
  suburb: 'Suburb',
  zipcode: 'Postcode',
  state: 'State',
};
const TIER_LABEL: Record<ReportTier, string> = {
  compass: 'Compass',
  strategic: 'Strategic',
  briefing: 'Briefing',
  snapshot: 'Snapshot',
};
const TIER_ICON = {
  compass: BarChart3,
  strategic: Sparkles,
  briefing: FileText,
  snapshot: Zap,
} as const;

export interface ReportCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: PropertyListing[];
  selectedIds: Set<string>;
  effectiveScope: ReportScope;
  effectiveTier: ReportTier;
  canGenerate: boolean;
  onGenerateForListing: (listing: PropertyListing, scope: ReportScope, tier: ReportTier) => void;
  onOpenBulkGeneration: () => void;
  onToggleSelect: (listingId: string) => void;
  onClearSelection: () => void;
}

/**
 * Phase C: ⌘K command palette for fast report actions.
 * Searches listings by address/suburb/postcode and exposes:
 *  - Generate (uses cached scope/tier or per-tier sub-commands)
 *  - Add/remove from selection
 *  - Bulk-generate from current selection
 *  - Quick navigation to Reports / Generated Reports
 */
export function ReportCommandPalette({
  open,
  onOpenChange,
  listings,
  selectedIds,
  effectiveScope,
  effectiveTier,
  canGenerate,
  onGenerateForListing,
  onOpenBulkGeneration,
  onToggleSelect,
  onClearSelection,
}: ReportCommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Global ⌘K / Ctrl+K binding
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  // Limit visible listing matches for perf — cmdk filters internally
  const visibleListings = useMemo(() => listings.slice(0, 50), [listings]);

  const close = () => {
    onOpenChange(false);
    setSearch('');
  };

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const selectionSize = selectedIds.size;
  const canBulk = canGenerate && selectionSize >= 2 && selectionSize <= 10;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search listings, or run a command…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {/* Selection actions */}
        {selectionSize > 0 && (
          <>
            <CommandGroup heading={`Selection (${selectionSize})`}>
              {canBulk && (
                <CommandItem onSelect={run(onOpenBulkGeneration)}>
                  <Layers className="h-4 w-4 mr-2 text-primary" />
                  Generate reports for {selectionSize} selected
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              )}
              {canGenerate && selectionSize > 10 && (
                <CommandItem disabled>
                  <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
                  Bulk supports max 10 — reduce selection
                </CommandItem>
              )}
              <CommandItem onSelect={run(onClearSelection)}>
                <ListChecks className="h-4 w-4 mr-2" />
                Clear selection
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Listing matches */}
        {visibleListings.length > 0 && (
          <>
            <CommandGroup
              heading={`Listings — generate as ${SCOPE_LABEL[effectiveScope]} · ${TIER_LABEL[effectiveTier]}`}
            >
              {visibleListings.map((listing) => {
                const addr = listing.address || listing.location || 'Unknown';
                const sub = [listing.suburb, listing.state, listing.zipCode]
                  .filter(Boolean)
                  .join(' ');
                const isSel = selectedIds.has(listing.id);
                return (
                  <CommandItem
                    key={listing.id}
                    value={`${addr} ${sub} ${buildFullAddress(listing)}`}
                    onSelect={
                      canGenerate
                        ? run(() => onGenerateForListing(listing, effectiveScope, effectiveTier))
                        : undefined
                    }
                  >
                    <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{addr}</span>
                      {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
                    </div>
                    <CommandShortcut className="flex items-center gap-1">
                      {isSel && <span className="text-primary">●</span>}
                      <Sparkles className="h-3 w-3" />
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Tier shortcuts (apply to first match if any, otherwise hint only) */}
        {canGenerate && visibleListings.length > 0 && search && (
          <>
            <CommandGroup heading="Generate first match with tier">
              {(['compass', 'strategic', 'briefing', 'snapshot'] as ReportTier[]).map((t) => {
                const Icon = TIER_ICON[t];
                return (
                  <CommandItem
                    key={t}
                    onSelect={run(() =>
                      onGenerateForListing(visibleListings[0], effectiveScope, t)
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2 text-primary" />
                    {TIER_LABEL[t]}
                    {t === effectiveTier && (
                      <CommandShortcut className="text-[10px]">default</CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={run(() => navigate('/generated-reports'))}>
            <FileText className="h-4 w-4 mr-2" />
            Open Generated Reports
          </CommandItem>
          <CommandItem onSelect={run(() => navigate('/reports'))}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Reports page
          </CommandItem>
          <CommandItem onSelect={run(() => navigate('/reports'))}>
            <Settings2 className="h-4 w-4 mr-2" />
            Manage report defaults
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
