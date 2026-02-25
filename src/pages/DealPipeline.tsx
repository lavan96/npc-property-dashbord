import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, DollarSign, FileText, LayoutDashboard } from 'lucide-react';
import { useAllDeals } from '@/hooks/useAllDeals';
import { DealExecutiveSummary } from '@/components/deals/DealExecutiveSummary';
import { CommissionDashboard } from '@/components/deals/CommissionDashboard';
import { BuilderInvoiceLog } from '@/components/deals/BuilderInvoiceLog';
import { toast } from 'sonner';
import type { DealWithClient } from '@/hooks/useAllDeals';

export default function DealPipeline() {
  const { data: deals = [], isLoading, error } = useAllDeals();
  const [activeTab, setActiveTab] = useState('summary');
  const navigate = useNavigate();

  const handleDealClick = (deal: DealWithClient) => {
    // Navigate to clients page with the client selected
    navigate(`/clients?clientId=${deal.client_id}&tab=deals`);
    toast.info(`Opening ${deal.client_name}'s deal`);
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full inline-flex overflow-x-auto scrollbar-hide">
          <TabsTrigger value="summary" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Executive </span>Summary
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Commissions
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1 sm:gap-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0">
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Builder </span>Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <DealExecutiveSummary deals={deals} isLoading={isLoading} onDealClick={handleDealClick} />
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <CommissionDashboard deals={deals} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <BuilderInvoiceLog deals={deals} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
