import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BrandAccessibilityCheck } from '@/branding/accessibility';

interface BrandAccessibilityPanelProps {
  checks: BrandAccessibilityCheck[];
}

export function BrandAccessibilityPanel({ checks }: BrandAccessibilityPanelProps) {
  const statusMeta = {
    pass: {
      icon: CheckCircle2,
      badge: 'bg-success/10 text-success border-success/30 shadow-sm',
      iconWrap: 'bg-success/10 text-success border-success/20',
      panel: 'border-success/25 bg-success/5 shadow-success/5',
      label: 'Pass',
    },
    warning: {
      icon: AlertTriangle,
      badge: 'bg-warning/10 text-warning border-warning/30 shadow-sm',
      iconWrap: 'bg-warning/10 text-warning border-warning/20',
      panel: 'border-warning/25 bg-warning/5 shadow-warning/5',
      label: 'Warning',
    },
    critical: {
      icon: ShieldAlert,
      badge: 'bg-destructive/10 text-destructive border-destructive/30 shadow-sm',
      iconWrap: 'bg-destructive/10 text-destructive border-destructive/25',
      panel: 'border-destructive/40 bg-destructive/10 shadow-destructive/10',
      label: 'Critical',
    },
  } as const;

  return (
    <div className="grid gap-3">
      {checks.map((check) => {
        const meta = statusMeta[check.status];
        const Icon = meta.icon;

        return (
          <div key={check.id} className={cn('dashboard-status-chip min-w-0 rounded-2xl border p-4 shadow-sm', meta.panel)}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm', meta.iconWrap)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{check.label}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{check.detail}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn('w-fit shrink-0 rounded-full px-3', meta.badge)}>{meta.label}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
