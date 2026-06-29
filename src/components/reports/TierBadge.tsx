import { Badge } from '@/components/ui/badge';
import { Compass, FileText, Zap, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReportTier = 'compass' | 'briefing' | 'snapshot' | 'financial';

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
    // 40-page client-facing macro / suburb / planning / risk / property-fit report.
    description: 'Client-facing 40-page macro, suburb, planning & risk report',
    pages: '~40',
    icon: Compass,
    color: 'bg-amber-500 text-foreground dark:text-white hover:bg-amber-600',
    badgeVariant: 'default' as const,
  },
  financial: {
    name: 'Financial Analysis',
    shortName: 'Financial',
    description: 'Separate financial breakdown: yield, loan, cashflow, 10-yr, tax',
    pages: '~20',
    icon: Calculator,
    color: 'bg-emerald-600 text-foreground dark:text-white hover:bg-emerald-700',
    badgeVariant: 'default' as const,
  },
  briefing: {
    name: 'Executive Briefing',
    shortName: 'Briefing',
    description: 'Condensed ~20 page executive summary',
    pages: '~20',
    icon: FileText,
    color: 'bg-blue-500 text-foreground dark:text-white hover:bg-blue-600',
    badgeVariant: 'secondary' as const,
  },
  snapshot: {
    name: 'Snapshot',
    shortName: 'Snapshot',
    description: 'Quick 4-5 page summary overview',
    pages: '4-5',
    icon: Zap,
    color: 'bg-green-500 text-foreground dark:text-white hover:bg-green-600',
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
