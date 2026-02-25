import { useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Plus,
  Building2,
  Home,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Deal, DealType, RISK_STATUS_CONFIG } from './types';
import { DealDetailView } from './DealDetailView';
import { useDealActions } from './useDealActions';

interface DealTrackerTabProps {
  clientId: string;
  deals: Deal[];
  properties: any[];
}

export function DealTrackerTab({ clientId, deals, properties }: DealTrackerTabProps) {
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDealType, setNewDealType] = useState<DealType>('existing_property');
  const { createDeal } = useDealActions(clientId);

  const selectedDeal = deals.find(d => d.id === selectedDealId);

  const handleCreate = () => {
    createDeal.mutate(
      { dealType: newDealType },
      { onSuccess: (result) => {
        setShowCreateDialog(false);
        setSelectedDealId(result.id);
      }}
    );
  };

  // If viewing a specific deal
  if (selectedDeal) {
    return (
      <DealDetailView
        deal={selectedDeal}
        clientId={clientId}
        onBack={() => setSelectedDealId(null)}
      />
    );
  }

  // Deal list view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Deal Tracker
        </h3>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Deal
        </Button>
      </div>

      {deals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No deals yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create a deal to start tracking the client's property acquisition lifecycle.</p>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create First Deal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {deals.map((deal) => {
            const riskConfig = RISK_STATUS_CONFIG[deal.risk_status];
            const completedStages = (deal.stages || []).filter(s => s.status === 'complete').length;
            const totalStages = (deal.stages || []).length;
            const progressPercent = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
            const isHnL = deal.deal_type === 'house_and_land';

            return (
              <Card
                key={deal.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedDealId(deal.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isHnL ? <Home className="h-4 w-4 text-primary" /> : <Building2 className="h-4 w-4 text-primary" />}
                      <span className="font-medium text-sm">
                        {isHnL ? 'House & Land' : 'Existing Property'}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Stage {deal.current_stage_number}
                      </Badge>
                    </div>
                    <Badge className={cn('text-[10px] border', riskConfig.color)}>
                      {riskConfig.emoji} {riskConfig.label}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">{deal.current_stage}</p>

                  {/* Progress */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{completedStages}/{totalStages}</span>
                  </div>

                  {/* Key info */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {deal.responsible_person && (
                      <span>👤 {deal.responsible_person}</span>
                    )}
                    {deal.total_contract_price && (
                      <span>💰 {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(deal.total_contract_price)}</span>
                    )}
                    {deal.settlement_date && (
                      <span>📅 Settlement: {format(new Date(deal.settlement_date), 'dd MMM yyyy')}</span>
                    )}
                    <span className="ml-auto">Created {format(new Date(deal.created_at), 'dd MMM yyyy')}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Deal Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Choose the deal type to set up the appropriate tracking workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            <Card
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50',
                newDealType === 'existing_property' && 'border-primary ring-2 ring-primary/20'
              )}
              onClick={() => setNewDealType('existing_property')}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <Building2 className="h-8 w-8 text-primary" />
                <span className="font-medium text-sm">Existing Property</span>
                <span className="text-xs text-muted-foreground">7-stage acquisition workflow</span>
              </CardContent>
            </Card>

            <Card
              className={cn(
                'cursor-pointer transition-all hover:border-primary/50',
                newDealType === 'house_and_land' && 'border-primary ring-2 ring-primary/20'
              )}
              onClick={() => setNewDealType('house_and_land')}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <Home className="h-8 w-8 text-primary" />
                <span className="font-medium text-sm">House & Land</span>
                <span className="text-xs text-muted-foreground">7 land + 6 build stages</span>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createDeal.isPending}>
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
