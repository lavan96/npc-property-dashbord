import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, DollarSign, FileText, LayoutDashboard, Kanban, BarChart3 } from 'lucide-react';
import { useAllDeals } from '@/hooks/useAllDeals';
import { usePipelineMutations } from '@/hooks/usePipelineMutations';
import { usePipelineFilters } from '@/hooks/usePipelineFilters';
import { PipelineToolbar, DEFAULT_FILTERS } from '@/components/deals/PipelineToolbar';
import type { PipelineFilters } from '@/components/deals/PipelineToolbar';
import { DealExecutiveSummary } from '@/components/deals/DealExecutiveSummary';
import { CommissionDashboard } from '@/components/deals/CommissionDashboard';
import { BuilderInvoiceLog } from '@/components/deals/BuilderInvoiceLog';
import { PipelineKanbanBoard } from '@/components/deals/PipelineKanbanBoard';
import { PipelineAnalytics } from '@/components/deals/PipelineAnalytics';
import { toast } from 'sonner';
import type { DealWithClient } from '@/hooks/useAllDeals';

export default function DealPipeline() {
  const { data: deals = [], isLoading, error } = useAllDeals();
  const { updateBuildPayment } = usePipelineMutations();
  const [activeTab, setActiveTab] = useState('summary');
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const navigate = useNavigate();

  // Apply global filters to deals
  const filteredDeals = usePipelineFilters(deals, filters);

  const handleDealClick = (deal: DealWithClient) => {
    navigate(`/clients?clientId=${deal.client_id}&tab=deals`);
    toast.info(`Opening ${deal.client_name}'s deal`);
  };

  const handleUpdatePayment = (paymentId: string, clientId: string, data: any) => {
    updateBuildPayment.mutate({ paymentId, clientId, data });
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Deal Pipeline</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Cross-client deal tracking, commission monitoring, and builder invoice management.
          </p>
        </div>
      </div>

      {/* Global Pipeline Toolbar */}
      <PipelineToolbar
        deals={deals}
        filters={filters}
        onFiltersChange={setFilters}
        filteredCount={filteredDeals.length}
        isExpanded={filtersExpanded}
        onExpandedChange={setFiltersExpanded}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full inline-flex overflow-x-auto scrollbar-hide">
          <TabsTrigger value="summary" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Executive </span>Summary
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <Kanban className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Pipeline </span>Board
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Commissions
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Builder </span>Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <DealExecutiveSummary deals={filteredDeals} allDeals={deals} isLoading={isLoading} onDealClick={handleDealClick} />
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <PipelineKanbanBoard deals={filteredDeals} isLoading={isLoading} onDealClick={handleDealClick} />
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <CommissionDashboard deals={filteredDeals} isLoading={isLoading} onUpdatePayment={handleUpdatePayment} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <PipelineAnalytics deals={filteredDeals} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <BuilderInvoiceLog deals={filteredDeals} isLoading={isLoading} onUpdatePayment={handleUpdatePayment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
