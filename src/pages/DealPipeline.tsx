import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  DollarSign,
  FileText,
  LayoutDashboard,
  Kanban,
  BarChart3,
  CalendarDays,
  ShieldAlert,
  Edit3,
} from "lucide-react";
import { useAllDeals } from "@/hooks/useAllDeals";
import { usePipelineMutations } from "@/hooks/usePipelineMutations";
import { usePipelineFilters } from "@/hooks/usePipelineFilters";
import {
  PipelineToolbar,
  DEFAULT_FILTERS,
} from "@/components/deals/PipelineToolbar";
import type { PipelineFilters } from "@/components/deals/PipelineToolbar";
import { DealExecutiveSummary } from "@/components/deals/DealExecutiveSummary";
import { CommissionDashboard } from "@/components/deals/CommissionDashboard";
import { BuilderInvoiceLog } from "@/components/deals/BuilderInvoiceLog";
import { PipelineKanbanBoard } from "@/components/deals/PipelineKanbanBoard";
import { PipelineAnalytics } from "@/components/deals/PipelineAnalytics";
import { PipelineTimeline } from "@/components/deals/PipelineTimeline";
import { ClawbackRiskMonitor } from "@/components/deals/ClawbackRiskMonitor";
import { DealManagement } from "@/components/deals/DealManagement";
import { PipelineValueSummaryBar } from "@/components/deals/PipelineValueSummaryBar";
import { SettlementCountdownCards } from "@/components/deals/SettlementCountdownCards";
import { CommissionForecastWidget } from "@/components/deals/CommissionForecastWidget";
import { AtRiskDealsPanel } from "@/components/deals/AtRiskDealsPanel";
import { LinkedFinanceFilesPanel } from "@/components/deals/LinkedFinanceFilesPanel";
import { toast } from "sonner";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import type { DealWithClient } from "@/hooks/useAllDeals";

export default function DealPipeline() {
  const { data: deals = [], isLoading, error } = useAllDeals();
  const { updateBuildPayment, updateDeal, updateDealStage } =
    usePipelineMutations();
  const [activeTab, setActiveTab] = useState("summary");
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const navigate = useNavigate();
  const { canEdit: canEditDeals } = useModulePermissions("deal_pipeline");

  // Apply global filters to deals
  const filteredDeals = usePipelineFilters(deals, filters);

  const handleDealClick = (deal: DealWithClient) => {
    navigate(`/clients?clientId=${deal.client_id}&tab=deals&dealId=${deal.id}`);
    toast.info(`Opening ${deal.client_name}'s deal`);
  };

  const handleUpdatePayment = (
    paymentId: string,
    clientId: string,
    data: any,
  ) => {
    if (!canEditDeals) {
      toast.error("You do not have edit permission for deals");
      return;
    }
    updateBuildPayment.mutate({ paymentId, clientId, data });
  };

  const handleUpdateDeal = (dealId: string, clientId: string, data: any) => {
    if (!canEditDeals) {
      toast.error("You do not have edit permission for deals");
      return;
    }
    updateDeal.mutate({ dealId, clientId, data });
  };

  const handleUpdateStage = (
    stageId: string,
    clientId: string,
    data: any,
    dealId?: string,
    allStages?: any[],
  ) => {
    if (!canEditDeals) {
      toast.error("You do not have edit permission for deals");
      return;
    }
    updateDealStage.mutate({ stageId, clientId, data, dealId, allStages });
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1800px] space-y-4 p-3 sm:p-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-amber-300 sm:h-6 sm:w-6" />
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">
            Deal Pipeline
          </h1>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Unable to load deals
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error
              ? error.message
              : "Please try refreshing the page or logging in again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1800px] space-y-5 overflow-hidden rounded-[2rem] border border-amber-300/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_32%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(24,24,27,0.92)_42%,rgba(10,10,10,0.98))] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:space-y-6 sm:p-6">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-40 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      <section className="relative overflow-hidden rounded-[1.5rem] border border-amber-300/15 bg-black/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur sm:p-5">
        <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700" />
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200/35 bg-amber-300/10 shadow-[0_0_30px_rgba(245,158,11,0.18)]">
            <TrendingUp className="h-5 w-5 text-amber-200 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/75">
              Deal command centre
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Deal Pipeline
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Cross-client deal tracking, commission monitoring, and builder
              invoice management.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline Value Summary Bar */}
      <PipelineValueSummaryBar deals={deals} />

      {/* Settlement Countdown & At-Risk Panel */}
      <section className="relative grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettlementCountdownCards
          deals={filteredDeals}
          onDealClick={handleDealClick}
        />
        <AtRiskDealsPanel deals={filteredDeals} onDealClick={handleDealClick} />
      </section>

      {/* Commission Forecast */}
      <section className="relative">
        <CommissionForecastWidget deals={deals} />
      </section>

      {/* Linked Finance Files */}
      <section className="relative">
        <LinkedFinanceFilesPanel deals={filteredDeals} />
      </section>

      {/* Global Pipeline Toolbar */}
      <section className="relative rounded-[1.35rem] border border-white/10 bg-black/25 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.22)] backdrop-blur">
        <PipelineToolbar
          deals={deals}
          filters={filters}
          onFiltersChange={setFilters}
          filteredCount={filteredDeals.length}
          isExpanded={filtersExpanded}
          onExpandedChange={setFiltersExpanded}
        />
      </section>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="relative rounded-[1.5rem] border border-white/10 bg-black/30 p-2 shadow-[0_22px_70px_rgba(0,0,0,0.26)] backdrop-blur sm:p-3"
      >
        <TabsList className="inline-flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/80 p-1.5 scrollbar-hide shadow-inner">
          <TabsTrigger
            value="summary"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Executive </span>Summary
          </TabsTrigger>
          <TabsTrigger
            value="kanban"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <Kanban className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Pipeline </span>Board
          </TabsTrigger>
          <TabsTrigger
            value="commissions"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Commissions
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger
            value="clawback"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <ShieldAlert className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Clawback
          </TabsTrigger>
          <TabsTrigger
            value="manage"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <Edit3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Manage
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            className="flex-shrink-0 gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs text-muted-foreground transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-300 data-[state=active]:to-yellow-500 data-[state=active]:text-amber-950 data-[state=active]:shadow-[0_10px_26px_rgba(245,158,11,0.24)] sm:gap-1.5 sm:text-sm"
          >
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Builder </span>Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="summary"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <DealExecutiveSummary
            deals={filteredDeals}
            allDeals={deals}
            isLoading={isLoading}
            onDealClick={handleDealClick}
          />
        </TabsContent>

        <TabsContent
          value="kanban"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <PipelineKanbanBoard
            deals={filteredDeals}
            isLoading={isLoading}
            onDealClick={handleDealClick}
          />
        </TabsContent>

        <TabsContent
          value="commissions"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <CommissionDashboard
            deals={filteredDeals}
            isLoading={isLoading}
            onUpdatePayment={handleUpdatePayment}
          />
        </TabsContent>

        <TabsContent
          value="analytics"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <PipelineAnalytics deals={filteredDeals} isLoading={isLoading} />
        </TabsContent>

        <TabsContent
          value="timeline"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <PipelineTimeline
            deals={filteredDeals}
            isLoading={isLoading}
            onDealClick={handleDealClick}
          />
        </TabsContent>

        <TabsContent
          value="clawback"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <ClawbackRiskMonitor
            deals={filteredDeals}
            isLoading={isLoading}
            onDealClick={handleDealClick}
          />
        </TabsContent>

        <TabsContent
          value="manage"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <DealManagement
            deals={filteredDeals}
            isLoading={isLoading}
            onDealClick={handleDealClick}
            onUpdateDeal={handleUpdateDeal}
            onUpdateStage={handleUpdateStage}
          />
        </TabsContent>

        <TabsContent
          value="invoices"
          className="mt-4 rounded-[1.25rem] border border-white/10 bg-zinc-950/35 p-3 shadow-inner sm:p-4"
        >
          <BuilderInvoiceLog
            deals={filteredDeals}
            isLoading={isLoading}
            onUpdatePayment={handleUpdatePayment}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
