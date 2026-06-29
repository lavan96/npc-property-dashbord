import { useMemo } from "react";
import {
  Building2,
  Home,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DealWithClient } from "@/hooks/useAllDeals";

interface Props {
  deals: DealWithClient[];
}

export function PipelineValueSummaryBar({ deals }: Props) {
  const stats = useMemo(() => {
    const totalValue = deals.reduce(
      (s, d) => s + (d.total_contract_price || 0),
      0,
    );
    const avgValue = deals.length > 0 ? totalValue / deals.length : 0;
    const totalCommission = deals.reduce(
      (s, d) => s + (d.commission_estimate || 0),
      0,
    );

    const byType = {
      existing_property: deals.filter(
        (d) => d.deal_type === "existing_property",
      ).length,
      house_and_land: deals.filter((d) => d.deal_type === "house_and_land")
        .length,
      refinance: deals.filter((d) => d.deal_type === "refinance").length,
    };

    // Stage distribution for conversion
    const stageGroups = { early: 0, mid: 0, late: 0 };
    deals.forEach((d) => {
      if (d.current_stage_number <= 2) stageGroups.early++;
      else if (d.current_stage_number <= 5) stageGroups.mid++;
      else stageGroups.late++;
    });

    const uniquePersons = new Set(
      deals.map((d) => d.responsible_person).filter(Boolean),
    ).size;

    return {
      totalValue,
      avgValue,
      totalCommission,
      byType,
      stageGroups,
      uniquePersons,
    };
  }, [deals]);

  const fmt = (v: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <Card className="group overflow-hidden rounded-2xl border-amber-300/25 bg-[linear-gradient(145deg,rgba(245,158,11,0.16),rgba(24,24,27,0.9))] shadow-[0_16px_42px_rgba(0,0,0,0.24)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <DollarSign className="mx-auto mb-1 h-4 w-4 text-amber-200" />
          <p className="text-sm font-bold text-amber-50 sm:text-lg">
            {fmt(stats.totalValue)}
          </p>
          <p className="text-[9px] uppercase tracking-wide text-amber-100/70 sm:text-[10px]">
            Total Pipeline
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-zinc-950/55 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <BarChart3 className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{fmt(stats.avgValue)}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            Avg Deal Size
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-emerald-400/25 bg-emerald-500/10 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <TrendingUp className="h-4 w-4 mx-auto text-emerald-300 mb-1" />
          <p className="text-sm sm:text-lg font-bold text-emerald-300">
            {fmt(stats.totalCommission)}
          </p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            Est. Commission
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-zinc-950/55 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <Building2 className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">
            {stats.byType.existing_property}
          </p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            Existing Property
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-zinc-950/55 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <Home className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">
            {stats.byType.house_and_land}
          </p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            House & Land
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-zinc-950/55 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <RefreshCw className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">
            {stats.byType.refinance}
          </p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            Refinance
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-zinc-950/55 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
        <CardContent className="p-3 text-center sm:p-3.5">
          <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{stats.uniquePersons}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">
            Team Members
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
