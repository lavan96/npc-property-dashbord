import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Sparkles,
  Eye,
  Copy,
  ExternalLink,
  Map,
  CheckSquare,
  Square,
  MapPin,
  TrendingUp,
  Hash,
  Globe,
  BarChart3,
  FileText,
  Zap,
} from 'lucide-react';
import type { ReportScope, ReportTier } from '@/hooks/useReportPreferences';

const SCOPE_ICONS = { address: MapPin, suburb: TrendingUp, zipcode: Hash, state: Globe } as const;
const TIER_ICONS = { compass: BarChart3, strategic: Sparkles, briefing: FileText, snapshot: Zap } as const;
const SCOPE_LABELS = { address: 'Address', suburb: 'Suburb', zipcode: 'Postcode', state: 'State' } as const;
const TIER_LABELS = { compass: 'Compass', strategic: 'Strategic', briefing: 'Briefing', snapshot: 'Snapshot' } as const;

export interface ListingRowContextMenuProps {
  children: ReactNode;
  label?: string;
  isSelected?: boolean;
  canGenerate?: boolean;
  effectiveScope: ReportScope;
  effectiveTier: ReportTier;
  onQuickGenerate: () => void;
  onGenerateWithScope: (args: { scope: ReportScope; tier: ReportTier }) => void;
  onToggleSelect?: () => void;
  onOpenDetails?: () => void;
  onCopyAddress?: () => void;
  onOpenSource?: () => void;
}

/**
 * Right-click context menu for listing rows (Phase C). Mirrors the
 * ReportActionMenu actions but launches from anywhere on the row, with
 * a quick scope/tier submenu using cached preferences.
 */
export function ListingRowContextMenu({
  children,
  label,
  isSelected,
  canGenerate = true,
  effectiveScope,
  effectiveTier,
  onQuickGenerate,
  onGenerateWithScope,
  onToggleSelect,
  onOpenDetails,
  onCopyAddress,
  onOpenSource,
}: ListingRowContextMenuProps) {
  const ScopeIcon = SCOPE_ICONS[effectiveScope];
  const TierIcon = TIER_ICONS[effectiveTier];

  const scopes: ReportScope[] = ['address', 'suburb', 'zipcode', 'state'];
  const tiers: ReportTier[] = ['compass', 'strategic', 'briefing', 'snapshot'];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {label && (
          <>
            <ContextMenuLabel className="text-xs font-normal text-muted-foreground truncate">
              {label}
            </ContextMenuLabel>
            <ContextMenuSeparator />
          </>
        )}

        {canGenerate && (
          <>
            <ContextMenuItem onClick={onQuickGenerate}>
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              Generate
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                <ScopeIcon className="h-3 w-3" />
                {SCOPE_LABELS[effectiveScope]}
                <span>·</span>
                <TierIcon className="h-3 w-3" />
                {TIER_LABELS[effectiveTier]}
              </span>
            </ContextMenuItem>

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <BarChart3 className="h-4 w-4 mr-2" />
                Generate with scope…
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {scopes.map((s) => {
                  const Icon = SCOPE_ICONS[s];
                  return (
                    <ContextMenuItem
                      key={s}
                      onClick={() => onGenerateWithScope({ scope: s, tier: effectiveTier })}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {SCOPE_LABELS[s]}
                      {s === effectiveScope && (
                        <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                      )}
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate with tier…
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {tiers.map((t) => {
                  const Icon = TIER_ICONS[t];
                  return (
                    <ContextMenuItem
                      key={t}
                      onClick={() => onGenerateWithScope({ scope: effectiveScope, tier: t })}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {TIER_LABELS[t]}
                      {t === effectiveTier && (
                        <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                      )}
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />
          </>
        )}

        {onToggleSelect && (
          <ContextMenuItem onClick={onToggleSelect}>
            {isSelected ? (
              <>
                <CheckSquare className="h-4 w-4 mr-2 text-primary" />
                Remove from selection
              </>
            ) : (
              <>
                <Square className="h-4 w-4 mr-2" />
                Add to selection
              </>
            )}
          </ContextMenuItem>
        )}

        {(onOpenDetails || onCopyAddress || onOpenSource) && <ContextMenuSeparator />}

        {onOpenDetails && (
          <ContextMenuItem onClick={onOpenDetails}>
            <Map className="h-4 w-4 mr-2" />
            Open details
          </ContextMenuItem>
        )}
        {onOpenSource && (
          <ContextMenuItem onClick={onOpenSource}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open source
          </ContextMenuItem>
        )}
        {onCopyAddress && (
          <ContextMenuItem onClick={onCopyAddress}>
            <Copy className="h-4 w-4 mr-2" />
            Copy address
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
