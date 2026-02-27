import { useMemo, useState, useCallback } from 'react';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Building2,
  Home,
  RefreshCw,
  User,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  SkipForward,
  Play,
  Eye,
  Save,
  AlertTriangle,
  Clock,
  Edit3,
  ArrowRight,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RISK_STATUS_CONFIG } from '@/components/clients/deal-tracker/types';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
  isLoading: boolean;
  onDealClick?: (deal: DealWithClient) => void;
  onUpdateDeal?: (dealId: string, clientId: string, data: any) => void;
  onUpdateStage?: (stageId: string, clientId: string, data: any) => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);

function getDealTypeIcon(type: string) {
  switch (type) {
    case 'house_and_land': return <Home className="h-3 w-3" />;
    case 'refinance': return <RefreshCw className="h-3 w-3" />;
    default: return <Building2 className="h-3 w-3" />;
  }
}

function getDealTypeLabel(type: string) {
  switch (type) {
    case 'house_and_land': return 'H&L';
    case 'refinance': return 'Refi';
    default: return 'Existing';
  }
}

const STAGE_STATUS_ICONS: Record<string, React.ReactNode> = {
  complete: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  in_progress: <Play className="h-3.5 w-3.5 text-primary" />,
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-muted-foreground/30" />,
};

// ─── Inline Editable Field (defaultValue + onBlur pattern) ───
function InlineEditField({
  defaultValue,
  onSave,
  placeholder,
  type = 'text',
}: {
  defaultValue: string;
  onSave: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'textarea';
}) {
  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newVal = e.target.value.trim();
    if (newVal !== defaultValue) {
      onSave(newVal);
    }
  }, [defaultValue, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && type === 'text') {
      e.currentTarget.blur();
    }
  }, [type]);

  if (type === 'textarea') {
    return (
      <Textarea
        key={defaultValue}
        defaultValue={defaultValue}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="text-xs min-h-[60px] resize-none"
      />
    );
  }

  return (
    <Input
      key={defaultValue}
      defaultValue={defaultValue}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="h-7 text-xs"
    />
  );
}

// ─── Stage Quick Actions ───
function StageActions({
  stage,
  clientId,
  onUpdateStage,
}: {
  stage: any;
  clientId: string;
  onUpdateStage?: (stageId: string, clientId: string, data: any) => void;
}) {
  if (!onUpdateStage) return null;

  const actions: { label: string; status: string; icon: React.ReactNode; variant: any }[] = [];

  if (stage.status === 'pending') {
    actions.push({ label: 'Start', status: 'in_progress', icon: <Play className="h-2.5 w-2.5" />, variant: 'default' });
    actions.push({ label: 'Skip', status: 'skipped', icon: <SkipForward className="h-2.5 w-2.5" />, variant: 'ghost' });
  } else if (stage.status === 'in_progress') {
    actions.push({ label: 'Complete', status: 'complete', icon: <CheckCircle2 className="h-2.5 w-2.5" />, variant: 'default' });
    actions.push({ label: 'Skip', status: 'skipped', icon: <SkipForward className="h-2.5 w-2.5" />, variant: 'ghost' });
  } else if (stage.status === 'skipped') {
    actions.push({ label: 'Reopen', status: 'pending', icon: <Circle className="h-2.5 w-2.5" />, variant: 'outline' });
  }

  return (
    <div className="flex items-center gap-1">
      {actions.map(a => (
        <TooltipProvider key={a.status}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={a.variant}
                size="sm"
                className="h-5 px-1.5 text-[9px] gap-0.5"
                onClick={() => {
                  const data: any = { status: a.status };
                  if (a.status === 'in_progress') data.started_at = new Date().toISOString();
                  if (a.status === 'complete') data.completed_at = new Date().toISOString();
                  onUpdateStage(stage.id, clientId, data);
                }}
              >
                {a.icon}
                {a.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              Mark as {a.status.replace('_', ' ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}

// ─── Deal Management Row ───
function DealManageRow({
  deal,
  responsiblePersons,
  onDealClick,
  onUpdateDeal,
  onUpdateStage,
}: {
  deal: DealWithClient;
  responsiblePersons: string[];
  onDealClick?: () => void;
  onUpdateDeal?: (dealId: string, clientId: string, data: any) => void;
  onUpdateStage?: (stageId: string, clientId: string, data: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskCfg = RISK_STATUS_CONFIG[deal.risk_status];
  const stages = deal.stages || [];
  const completedStages = stages.filter(s => s.status === 'complete').length;
  const totalStages = stages.length;
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  const nextStage = stages.find(s => s.status === 'in_progress') || stages.find(s => s.status === 'pending');
  const ageInDays = differenceInDays(new Date(), new Date(deal.created_at));

  const handleUpdateField = useCallback((field: string, value: any) => {
    onUpdateDeal?.(deal.id, deal.client_id, { [field]: value });
  }, [deal.id, deal.client_id, onUpdateDeal]);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <TableRow className="group hover:bg-muted/30 transition-colors">
        {/* Expand */}
        <TableCell className="w-8 px-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
        </TableCell>

        {/* Client */}
        <TableCell className="cursor-pointer" onClick={onDealClick}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground">{getDealTypeIcon(deal.deal_type)}</span>
            <span className="text-xs font-semibold truncate">{deal.client_name}</span>
          </div>
          <span className="text-[9px] text-muted-foreground">{getDealTypeLabel(deal.deal_type)} · {ageInDays}d old</span>
        </TableCell>

        {/* Current Stage */}
        <TableCell>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[9px] px-1 h-4">S{deal.current_stage_number}</Badge>
            <span className="text-[10px] truncate max-w-[120px]">{deal.current_stage}</span>
          </div>
        </TableCell>

        {/* Progress */}
        <TableCell className="hidden sm:table-cell w-[100px]">
          <div className="space-y-0.5">
            <Progress value={progressPct} className="h-1.5" />
            <span className="text-[9px] text-muted-foreground">{completedStages}/{totalStages} · {progressPct}%</span>
          </div>
        </TableCell>

        {/* Responsible (inline edit) */}
        <TableCell className="hidden md:table-cell w-[140px]">
          <Select
            key={`${deal.id}-responsible`}
            defaultValue={deal.responsible_person || ''}
            onValueChange={(v) => handleUpdateField('responsible_person', v || null)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full">
              <SelectValue placeholder="Assign..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs italic">Unassigned</SelectItem>
              {responsiblePersons.map(p => (
                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        {/* Risk (inline edit) */}
        <TableCell className="hidden lg:table-cell w-[120px]">
          <Select
            key={`${deal.id}-risk`}
            defaultValue={deal.risk_status}
            onValueChange={(v) => handleUpdateField('risk_status', v)}
          >
            <SelectTrigger className={cn('h-7 text-[10px] w-full border', riskCfg.color)}>
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
        </TableCell>

        {/* Next Action */}
        <TableCell className="hidden xl:table-cell">
          {nextStage ? (
            <div className="flex items-center gap-1.5">
              <ArrowRight className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                {nextStage.internal_action || nextStage.stage_name}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-success font-medium">All complete</span>
          )}
        </TableCell>

        {/* Quick actions */}
        <TableCell className="w-20">
          <div className="flex items-center gap-1">
            {nextStage && nextStage.status === 'in_progress' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-5 px-1.5 text-[9px] gap-0.5"
                      onClick={() => onUpdateStage?.(nextStage.id, deal.client_id, { status: 'complete', completed_at: new Date().toISOString() })}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Done
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[10px]">Complete current stage</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {nextStage && nextStage.status === 'pending' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-1.5 text-[9px] gap-0.5"
                      onClick={() => onUpdateStage?.(nextStage.id, deal.client_id, { status: 'in_progress', started_at: new Date().toISOString() })}
                    >
                      <Play className="h-2.5 w-2.5" />
                      Start
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[10px]">Start next stage</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100" onClick={onDealClick}>
              <Eye className="h-3 w-3 text-primary" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded: Stage timeline + notes editor */}
      <TableRow className={cn(!expanded && 'hidden')}>
        <TableCell colSpan={8} className="bg-muted/20 p-0">
          <CollapsibleContent>
            <div className="p-4 space-y-4">
              {/* Stage timeline */}
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Settings2 className="h-3 w-3" /> Stage Management
                </p>
                <div className="grid gap-1.5">
                  {stages.map((stage, i) => (
                    <div
                      key={stage.id || i}
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-md border transition-colors',
                        stage.status === 'complete' && 'bg-success/5 border-success/20',
                        stage.status === 'in_progress' && 'bg-primary/5 border-primary/20',
                        stage.status === 'skipped' && 'bg-muted/50 border-border/30 opacity-60',
                        stage.status === 'pending' && 'border-border/50',
                      )}
                    >
                      <span className="shrink-0">{STAGE_STATUS_ICONS[stage.status] || <Circle className="h-3.5 w-3.5" />}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[8px] px-1 h-3.5 shrink-0">S{stage.stage_number}</Badge>
                          <span className={cn('text-xs font-medium truncate', stage.status === 'skipped' && 'line-through')}>{stage.stage_name}</span>
                        </div>
                        {stage.internal_action && (
                          <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{stage.internal_action}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {stage.completed_at && (
                          <span className="text-[9px] text-muted-foreground">{format(new Date(stage.completed_at), 'dd MMM')}</span>
                        )}
                        <StageActions stage={stage} clientId={deal.client_id} onUpdateStage={onUpdateStage} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inline notes editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Deal Notes
                  </p>
                  <InlineEditField
                    key={`${deal.id}-notes`}
                    defaultValue={deal.notes || ''}
                    onSave={(val) => handleUpdateField('notes', val || null)}
                    placeholder="Add notes about this deal..."
                    type="textarea"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <User className="h-3 w-3" /> Responsible Person
                    </p>
                    <InlineEditField
                      key={`${deal.id}-responsible-input`}
                      defaultValue={deal.responsible_person || ''}
                      onSave={(val) => handleUpdateField('responsible_person', val || null)}
                      placeholder="Enter name..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Deal Value</p>
                      <p className="text-xs font-medium">{deal.total_contract_price ? formatCurrency(deal.total_contract_price) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Settlement</p>
                      <p className="text-xs font-medium">{deal.settlement_date ? format(new Date(deal.settlement_date), 'dd MMM yyyy') : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </TableCell>
      </TableRow>
    </Collapsible>
  );
}

// ─── MAIN COMPONENT ───
export function DealManagement({ deals, isLoading, onDealClick, onUpdateDeal, onUpdateStage }: Props) {
  // Collect all responsible persons for the dropdown
  const responsiblePersons = useMemo(() => {
    const set = new Set<string>();
    for (const d of deals) {
      if (d.responsible_person) set.add(d.responsible_person);
    }
    return Array.from(set).sort();
  }, [deals]);

  // Summary stats
  const stats = useMemo(() => {
    const actionable = deals.filter(d => {
      const stages = d.stages || [];
      return stages.some(s => s.status === 'in_progress');
    }).length;
    const unassigned = deals.filter(d => !d.responsible_person).length;
    const urgent = deals.filter(d => d.risk_status === 'urgent').length;
    return { actionable, unassigned, urgent };
  }, [deals]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Edit3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No deals to manage</p>
          <p className="text-xs text-muted-foreground mt-1">Create deals to start managing them</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quick stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1">
          <Play className="h-3 w-3 text-primary" />
          {stats.actionable} in progress
        </Badge>
        {stats.unassigned > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
            <User className="h-3 w-3" />
            {stats.unassigned} unassigned
          </Badge>
        )}
        {stats.urgent > 0 && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            {stats.urgent} urgent
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          Click a row to expand stage management · Edits save on blur
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-2" />
                  <TableHead className="whitespace-nowrap text-xs">Client</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Stage</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden sm:table-cell">Progress</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden md:table-cell">Responsible</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden lg:table-cell">Risk</TableHead>
                  <TableHead className="whitespace-nowrap text-xs hidden xl:table-cell">Next Action</TableHead>
                  <TableHead className="whitespace-nowrap text-xs w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map(deal => (
                  <DealManageRow
                    key={deal.id}
                    deal={deal}
                    responsiblePersons={responsiblePersons}
                    onDealClick={() => onDealClick?.(deal)}
                    onUpdateDeal={onUpdateDeal}
                    onUpdateStage={onUpdateStage}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
