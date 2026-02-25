import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, DollarSign, FileText, LayoutDashboard } from 'lucide-react';
import { useAllDeals } from '@/hooks/useAllDeals';
import { DealExecutiveSummary } from '@/components/deals/DealExecutiveSummary';
import { CommissionDashboard } from '@/components/deals/CommissionDashboard';
import { BuilderInvoiceLog } from '@/components/deals/BuilderInvoiceLog';

export default function DealPipeline() {
  const { data: deals = [], isLoading, error } = useAllDeals();
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deal Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Cross-client deal tracking, commission monitoring, and builder invoice management.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            Executive Summary
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            Commission Dashboard
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Builder Invoice Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <DealExecutiveSummary deals={deals} isLoading={isLoading} />
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
