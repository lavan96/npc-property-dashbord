import { useMemo } from "react";
import {
  Building2,
  Home,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DealWithClient } from "@/hooks/useAllDeals";
import { cn } from "@/lib/utils";

interface Props {
  deals: DealWithClient[];
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  variant:
    | "headline"
    | "analytical"
    | "financial"
    | "existing"
    | "land"
    | "refinance"
    | "operations";
}

const metricCardStyles: Record<
  MetricCardProps["variant"],
  {
    card: string;
    iconWrap: string;
    icon: string;
    value: string;
    label: string;
  }
> = {
  headline: {
    card: "border-brand-200/45 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.38),transparent_44%),linear-gradient(145deg,rgba(180,83,9,0.48),rgba(24,24,27,0.98))] shadow-[0_18px_46px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.12)]",
    iconWrap: "border-brand-200/25 bg-brand-300/15 text-brand-100 shadow-[0_0_24px_rgba(251,191,36,0.22)]",
    icon: "text-brand-100",
    value: "text-white drop-shadow-[0_1px_14px_rgba(251,191,36,0.22)]",
    label: "text-brand-50/90",
  },
  analytical: {
    card: "border-sky-300/30 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.26),transparent_42%),linear-gradient(145deg,rgba(8,47,73,0.58),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-info/20 bg-info/10 text-info",
    icon: "text-info",
    value: "text-sky-50 drop-shadow-[0_1px_12px_rgba(56,189,248,0.16)]",
    label: "text-sky-100/88",
  },
  financial: {
    card: "border-emerald-300/30 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.26),transparent_42%),linear-gradient(145deg,rgba(6,95,70,0.50),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-success/20 bg-success/10 text-success shadow-[0_0_20px_rgba(16,185,129,0.18)]",
    icon: "text-emerald-50 drop-shadow-[0_1px_12px_rgba(16,185,129,0.16)]",
    value: "text-emerald-50 drop-shadow-[0_1px_12px_rgba(16,185,129,0.16)]",
    label: "text-emerald-100/88",
  },
  existing: {
    card: "border-violet-300/28 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.26),transparent_42%),linear-gradient(145deg,rgba(76,29,149,0.42),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-accent/20 bg-accent/10 text-accent",
    icon: "text-accent",
    value: "text-violet-50 drop-shadow-[0_1px_12px_rgba(139,92,246,0.16)]",
    label: "text-violet-100/88",
  },
  land: {
    card: "border-orange-300/30 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.27),transparent_42%),linear-gradient(145deg,rgba(124,45,18,0.46),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-warning/20 bg-warning/10 text-warning",
    icon: "text-warning",
    value: "text-orange-50 drop-shadow-[0_1px_12px_rgba(251,146,60,0.16)]",
    label: "text-orange-100/88",
  },
  refinance: {
    card: "border-cyan-300/30 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.24),transparent_42%),linear-gradient(145deg,rgba(8,47,73,0.52),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-info/20 bg-info/10 text-info",
    icon: "text-info",
    value: "text-sky-50 drop-shadow-[0_1px_12px_rgba(56,189,248,0.16)]",
    label: "text-cyan-100/88",
  },
  operations: {
    card: "border-slate-300/22 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.20),transparent_40%),linear-gradient(145deg,rgba(51,65,85,0.48),rgba(24,24,27,0.97))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
    iconWrap: "border-border/20 bg-muted/10 text-slate-200",
    icon: "text-slate-200",
    value: "text-slate-50 drop-shadow-[0_1px_12px_rgba(148,163,184,0.16)]",
    label: "text-slate-100/86",
  },
};

function MetricCard({ label, value, icon: Icon, variant }: MetricCardProps) {
  const styles = metricCardStyles[variant];

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-3xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/25 hover:shadow-[0_22px_58px_rgba(0,0,0,0.34),0_0_28px_rgba(251,191,36,0.14)]",
        "before:absolute before:inset-x-5 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent",
        "after:absolute after:-right-10 after:-top-12 after:h-24 after:w-24 after:rounded-full after:bg-brand-200/0 after:blur-2xl after:transition-colors after:duration-300 hover:after:bg-brand-200/12",
        styles.card,
      )}
    >
      <CardContent className="relative z-10 flex min-h-[118px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "max-w-[8.5rem] text-[0.72rem] font-medium uppercase leading-snug tracking-[0.14em]",
              styles.label,
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-sm transition-transform duration-300 group-hover:scale-105",
              styles.iconWrap,
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", styles.icon)} />
          </span>
        </div>
        <p
          className={cn(
            "mt-6 truncate text-[2rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.15rem] xl:text-[2.35rem]",
            styles.value,
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
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
    <section className="deal-pipeline-kpis grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <MetricCard
        label="Total Pipeline"
        value={fmt(stats.totalValue)}
        icon={DollarSign}
        variant="headline"
      />
      <MetricCard
        label="Avg Deal Size"
        value={fmt(stats.avgValue)}
        icon={BarChart3}
        variant="analytical"
      />
      <MetricCard
        label="Est. Commission"
        value={fmt(stats.totalCommission)}
        icon={TrendingUp}
        variant="financial"
      />
      <MetricCard
        label="Existing Property"
        value={stats.byType.existing_property}
        icon={Building2}
        variant="existing"
      />
      <MetricCard
        label="House & Land"
        value={stats.byType.house_and_land}
        icon={Home}
        variant="land"
      />
      <MetricCard
        label="Refinance"
        value={stats.byType.refinance}
        icon={RefreshCw}
        variant="refinance"
      />
      <MetricCard
        label="Team Members"
        value={stats.uniquePersons}
        icon={Users}
        variant="operations"
      />
    </section>
  );
}
