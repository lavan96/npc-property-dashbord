import { usePortalDealProgressData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Building2, CheckCircle2, Circle, Clock,
  ArrowRight, TrendingUp, CalendarDays, DollarSign,
  FileCheck, Home, Milestone
} from 'lucide-react';
import { format } from 'date-fns';

const ACQUISITION_STAGES = [
  { key: 'initial_consultation', label: 'Initial Consultation', icon: MessageSquareIcon },
  { key: 'pre_approval', label: 'Pre-Approval', icon: FileCheck },
  { key: 'property_search', label: 'Property Search', icon: Home },
  { key: 'under_contract', label: 'Under Contract', icon: FileCheck },
  { key: 'finance_approval', label: 'Finance Approval', icon: DollarSign },
  { key: 'settlement', label: 'Settlement', icon: CalendarDays },
  { key: 'settled', label: 'Settled', icon: CheckCircle2 },
];

function MessageSquareIcon(props: any) {
  return <Milestone {...props} />;
}

function formatCurrency(val?: number | null): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val);
}

function getStageIndex(currentStage?: string): number {
  if (!currentStage) return 0;
  const normalized = currentStage.toLowerCase().replace(/[\s-]+/g, '_');
  const idx = ACQUISITION_STAGES.findIndex(s => 
    s.key === normalized || s.label.toLowerCase() === currentStage.toLowerCase()
  );
  return idx >= 0 ? idx : 0;
}

function DealProgressCard({ deal }: { deal: any }) {
  const currentIdx = getStageIndex(deal.current_stage);
  const progress = Math.round(((currentIdx + 1) / ACQUISITION_STAGES.length) * 100);

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 shadow-sm">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{deal.property_address || 'Property Deal'}</CardTitle>
              <CardDescription className="capitalize text-xs mt-0.5">
                {deal.deal_type?.replace(/_/g, ' ') || 'Purchase'}
                {deal.loan_amount && ` • ${formatCurrency(deal.loan_amount)}`}
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="capitalize text-xs">
            {deal.current_stage || 'New'}
          </Badge>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Progress</span>
            <span className="font-semibold text-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {/* Visual Pipeline */}
        <div className="space-y-1">
          {ACQUISITION_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isFuture = idx > currentIdx;
            const StageIcon = stage.icon;

            return (
              <div key={stage.key} className="flex items-center gap-3">
                {/* Connector Line + Icon */}
                <div className="flex flex-col items-center">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/10'
                        : 'bg-muted text-muted-foreground/50'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Clock className="h-4 w-4 animate-pulse" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  {idx < ACQUISITION_STAGES.length - 1 && (
                    <div className={`w-0.5 h-4 ${isCompleted ? 'bg-emerald-500/50' : 'bg-border'}`} />
                  )}
                </div>
                {/* Label */}
                <div className={`flex-1 pb-3 ${isFuture ? 'opacity-40' : ''}`}>
                  <p className={`text-sm font-medium ${isCurrent ? 'text-foreground' : isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                    {stage.label}
                  </p>
                  {isCurrent && (
                    <p className="text-xs text-primary mt-0.5 font-medium">Current Stage</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Key Dates */}
        {(deal.settlement_date || deal.finance_expiry_date) && (
          <>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-3">
              {deal.settlement_date && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Settlement</p>
                  <p className="text-sm font-bold text-foreground mt-1">
                    {format(new Date(deal.settlement_date), 'dd MMM yyyy')}
                  </p>
                </div>
              )}
              {deal.finance_expiry_date && (
                <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Finance Expiry</p>
                  <p className="text-sm font-bold text-foreground mt-1">
                    {format(new Date(deal.finance_expiry_date), 'dd MMM yyyy')}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalDealProgress() {
  const { data, isLoading, error } = usePortalDealProgressData();
  const deals = data?.deals || [];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading deal progress...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Deal Progress
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track the progress of your property deals in real-time
        </p>
      </div>

      {deals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">No active deals</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              When you have active property deals, their progress will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {deals.map((deal: any) => (
            <DealProgressCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
