import { AlertTriangle, AlertCircle, Info, TrendingDown, Zap, DollarSign, Eye, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Anomaly {
  id: string;
  type: 'critical' | 'warning' | 'info';
  category: string;
  campaign_name: string;
  campaign_id: string;
  title: string;
  description: string;
  metric_value: number;
  threshold_value: number;
}

const categoryIcons: Record<string, React.ReactNode> = {
  cpl_spike: <DollarSign className="h-4 w-4" />,
  ctr_drop: <TrendingDown className="h-4 w-4" />,
  creative_fatigue: <Eye className="h-4 w-4" />,
  budget_drain: <Zap className="h-4 w-4" />,
  zero_conversion: <AlertTriangle className="h-4 w-4" />,
  high_frequency: <Users className="h-4 w-4" />,
  spend_inefficiency: <DollarSign className="h-4 w-4" />,
};

const typeStyles: Record<string, { variant: 'destructive' | 'default'; bg: string; border: string; icon: React.ReactNode }> = {
  critical: {
    variant: 'destructive',
    bg: 'bg-destructive/5 dark:bg-destructive/10',
    border: 'border-destructive/30',
    icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
  },
  warning: {
    variant: 'default',
    bg: 'bg-amber-500/5 dark:bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
  },
  info: {
    variant: 'default',
    bg: 'bg-blue-500/5 dark:bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: <Info className="h-4 w-4 text-blue-500" />,
  },
};

interface AnomalyAlertsPanelProps {
  anomalies: Anomaly[];
  loading?: boolean;
}

export function AnomalyAlertsPanel({ anomalies, loading }: AnomalyAlertsPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const critical = anomalies.filter(a => a.type === 'critical');
  const warnings = anomalies.filter(a => a.type === 'warning');
  const info = anomalies.filter(a => a.type === 'info');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomaly Detection
          </CardTitle>
          <div className="flex items-center gap-2">
            {critical.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {critical.length} Critical
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                {warnings.length} Warning{warnings.length > 1 ? 's' : ''}
              </Badge>
            )}
            {anomalies.length === 0 && (
              <Badge variant="secondary" className="text-[10px]">
                All Clear
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 mb-2">
              <span className="text-lg">✓</span>
            </div>
            <p className="text-sm font-medium">No anomalies detected</p>
            <p className="text-xs mt-1">All campaigns are operating within normal parameters</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="space-y-2.5">
              {anomalies.map(anomaly => {
                const style = typeStyles[anomaly.type];
                return (
                  <div
                    key={anomaly.id}
                    className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-foreground">{anomaly.title}</span>
                          <span className="shrink-0">
                            {categoryIcons[anomaly.category]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
