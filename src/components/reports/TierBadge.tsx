import { Badge } from '@/components/ui/badge';
import { Compass, FileText, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportTier = 'compass' | 'briefing' | 'snapshot';

interface TierBadgeProps {
  tier: ReportTier;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
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

export function TierBadge({ tier, className, showIcon = true, size = 'md' }: TierBadgeProps) {
  const info = TIER_INFO[tier];
  const Icon = info.icon;

  const sizeClasses = {
    sm: 'text-xs py-0.5 px-1.5',
    md: 'text-xs py-1 px-2',
    lg: 'text-sm py-1.5 px-3 font-medium',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  return (
    <Badge 
      className={cn(info.color, 'gap-1', sizeClasses[size], className)}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
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
