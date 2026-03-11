import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Home,
  RefreshCw,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Deal, RiskStatus, RISK_STATUS_CONFIG, DEAL_TYPE_LABELS } from './types';
import { DealStageTimeline } from './DealStageTimeline';
import { BuildPaymentTracker } from './BuildPaymentTracker';
import { DealFinancialControls } from './DealFinancialControls';
import { DealCriticalDates } from './DealCriticalDates';
import { useDealActions } from './useDealActions';
import { TeamUserSelect } from '@/components/ui/TeamUserSelect';
import { useTeamUsers } from '@/hooks/useTeamUsers';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/hooks/useAuth';

function ResponsiblePersonSelect({ deal, onUpdate }: { deal: Deal; onUpdate: (data: Partial<Deal>) => void }) {
  const { data: teamUsers = [] } = useTeamUsers();
  const { addNotification } = useNotifications();
  const { user } = useAuth();

  const handleChange = (value: string) => {
    const newUserId = value === 'unassigned' ? null : value;
    const oldUserId = deal.responsible_person;
    if (newUserId === oldUserId) return;
    onUpdate({ responsible_person: newUserId } as any);
    if (newUserId && newUserId !== user?.id) {
      addNotification({
        type: 'deal_assigned',
        title: 'Deal Reassigned to You',
        message: `You are now responsible for the ${deal.property_address || DEAL_TYPE_LABELS[deal.deal_type]} deal`,
        entityId: deal.id,
        targetUserId: newUserId,
      });
    }
  };

  return (
    <TeamUserSelect
      value={deal.responsible_person || 'unassigned'}
      onValueChange={handleChange}
      placeholder="Responsible"
      className="h-8 text-xs w-full sm:w-[160px]"
    />
  );
}
interface DealDetailViewProps {
  deal: Deal;
  clientId: string;
  onBack: () => void;
}

export function DealDetailView({ deal, clientId, onBack }: DealDetailViewProps) {
  const { updateDeal, updateStage, updateBuildPayment, deleteDeal } = useDealActions(clientId);
  const [openSections, setOpenSections] = useState({
    stages: true,
    financial: true,
    dates: true,
    build: true,
    notes: false,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDealUpdate = (data: Partial<Deal>) => {
    updateDeal.mutate({ dealId: deal.id, data });
  };

  const isHnL = deal.deal_type === 'house_and_land';
  const isRefinance = deal.deal_type === 'refinance';
  const riskConfig = RISK_STATUS_CONFIG[deal.risk_status];

  const completedStages = (deal.stages || []).filter(s => s.status === 'complete').length;
  const totalStages = (deal.stages || []).length;

  const getDealIcon = () => {
    if (isRefinance) return <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />;
    if (isHnL) return <Home className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />;
    return <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />;
  };

  const getStagesLabel = () => {
    if (isRefinance) return 'Refinance Lifecycle Stages';
    if (isHnL) return 'Land Acquisition Stages';
    return 'Property Acquisition Stages';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-1.5">
            {getDealIcon()}
            <h3 className="font-semibold text-sm sm:text-lg">
              {DEAL_TYPE_LABELS[deal.deal_type]} Deal
            </h3>
          </div>
          <Badge variant="outline" className="text-[10px] sm:text-xs">
            S{deal.current_stage_number}: {deal.current_stage}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={deal.risk_status}
            onValueChange={(v) => handleDealUpdate({ risk_status: v as RiskStatus })}
          >
            <SelectTrigger className={cn('h-8 w-full sm:w-[180px] text-xs border', riskConfig.color)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RISK_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {cfg.emoji} {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ResponsiblePersonSelect
            deal={deal}
            onUpdate={handleDealUpdate}
          />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive h-8 shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[calc(100vw-24px)] sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the deal, all stages, build payments, and invoices. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { deleteDeal.mutate(deal.id); onBack(); }}
                  className="bg-destructive text-destructive-foreground"
                >
                  Delete Deal
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Property Address */}
      <div className="flex items-center gap-2 px-1">
        <Label className="text-xs text-muted-foreground whitespace-nowrap shrink-0">Property Address:</Label>
        <Input
          key={deal.id + '-property-address'}
          defaultValue={deal.property_address || ''}
          onBlur={(e) => {
            if (e.target.value !== (deal.property_address || '')) {
              handleDealUpdate({ property_address: e.target.value });
            }
          }}
          placeholder="Enter property address..."
          className="h-8 text-xs flex-1"
        />
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: totalStages > 0 ? `${(completedStages / totalStages) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{completedStages}/{totalStages} stages</span>
      </div>

      <Separator />

      {/* Stages Timeline */}
      <Collapsible open={openSections.stages} onOpenChange={() => toggleSection('stages')}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between h-9 text-sm font-medium">
            {getStagesLabel()}
            <ChevronDown className={cn('h-4 w-4 transition-transform', openSections.stages && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DealStageTimeline
            stages={deal.stages || []}
            onUpdateStage={(stageId, data) => {
              updateStage.mutate({ stageId, data });
              if (data.status === 'complete' || data.status === 'in_progress') {
                const stage = deal.stages?.find(s => s.id === stageId);
                if (stage && data.status === 'in_progress') {
                  handleDealUpdate({
                    current_stage: stage.stage_name,
                    current_stage_number: stage.stage_number,
                  });
                }
              }
            }}
          />
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* Critical Dates */}
      <Collapsible open={openSections.dates} onOpenChange={() => toggleSection('dates')}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between h-9 text-sm font-medium">
            Critical Dates
            <ChevronDown className={cn('h-4 w-4 transition-transform', openSections.dates && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DealCriticalDates deal={deal} onUpdate={handleDealUpdate} />
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* Financial Controls */}
      <Collapsible open={openSections.financial} onOpenChange={() => toggleSection('financial')}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between h-9 text-sm font-medium">
            Financial Controls
            <ChevronDown className={cn('h-4 w-4 transition-transform', openSections.financial && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <DealFinancialControls deal={deal} onUpdate={handleDealUpdate} />
        </CollapsibleContent>
      </Collapsible>

      {/* Build Payment Tracker (H&L only) */}
      {isHnL && (
        <>
          <Separator />
          <Collapsible open={openSections.build} onOpenChange={() => toggleSection('build')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-9 text-sm font-medium">
                Build Progress Payments
                <ChevronDown className={cn('h-4 w-4 transition-transform', openSections.build && 'rotate-180')} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <BuildPaymentTracker
                payments={deal.buildPayments || []}
                buildPrice={deal.build_price}
                onUpdatePayment={(paymentId, data) => updateBuildPayment.mutate({ paymentId, data })}
              />
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* Notes */}
      <Separator />
      <Collapsible open={openSections.notes} onOpenChange={() => toggleSection('notes')}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between h-9 text-sm font-medium">
            Notes
            <ChevronDown className={cn('h-4 w-4 transition-transform', openSections.notes && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            key={deal.id + '-notes'}
            defaultValue={deal.notes || ''}
            onBlur={(e) => {
              if (e.target.value !== (deal.notes || '')) {
                handleDealUpdate({ notes: e.target.value });
              }
            }}
            placeholder="Add deal notes..."
            rows={3}
            className="text-sm"
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
