import { Badge } from '@/components/ui/badge';
import { Compass, FileText, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportTier = 'compass' | 'briefing' | 'snapshot';

interface TierBadgeProps {
  tier: ReportTier;
  className?: string;
  showIcon?: boolean;
}

export const TIER_INFO = {
  compass: {
    name: "Investor's Compass",
    shortName: 'Compass',
    description: 'Comprehensive 50+ page in-depth analysis',
    pages: '50+',
    icon: Compass,
    color: 'bg-amber-500 text-white hover:bg-amber-600',
    badgeVariant: 'default' as const,
  },
  briefing: {
    name: 'Executive Briefing',
    shortName: 'Briefing',
    description: 'Condensed ~20 page executive summary',
    pages: '~20',
    icon: FileText,
    color: 'bg-blue-500 text-white hover:bg-blue-600',
    badgeVariant: 'secondary' as const,
  },
  snapshot: {
    name: 'Snapshot',
    shortName: 'Snapshot',
    description: 'Quick 4-5 page summary overview',
    pages: '4-5',
    icon: Zap,
    color: 'bg-green-500 text-white hover:bg-green-600',
    badgeVariant: 'outline' as const,
  },
};

export function TierBadge({ tier, className, showIcon = true }: TierBadgeProps) {
  const info = TIER_INFO[tier];
  const Icon = info.icon;

  return (
    <Badge 
      className={cn(info.color, 'gap-1', className)}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {info.shortName}
    </Badge>
  );
}

export function getTierDisplayName(tier: ReportTier): string {
  return TIER_INFO[tier]?.name || tier;
}

export function getTierPages(tier: ReportTier): string {
  return TIER_INFO[tier]?.pages || 'N/A';
}
