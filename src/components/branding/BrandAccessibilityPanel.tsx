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
      badge: 'bg-success/10 text-success border-success/30',
      panel: 'border-success/25 bg-success/5',
      label: 'Pass',
    },
    warning: {
      icon: AlertTriangle,
      badge: 'bg-warning/10 text-warning border-warning/30',
      panel: 'border-warning/25 bg-warning/5',
      label: 'Warning',
    },
    critical: {
      icon: ShieldAlert,
      badge: 'bg-destructive/10 text-destructive border-destructive/30',
      panel: 'border-destructive/25 bg-destructive/5',
      label: 'Critical',
    },
  } as const;

  return (
    <div className="space-y-3">
      {checks.map((check) => {
        const meta = statusMeta[check.status];
        const Icon = meta.icon;

        return (
          <div key={check.id} className={cn('dashboard-status-chip rounded-2xl border p-4', meta.panel)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-background/80 p-2 shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{check.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                </div>
              </div>
              <Badge variant="outline" className={meta.badge}>{meta.label}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}