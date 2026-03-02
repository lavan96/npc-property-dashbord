import { useMemo } from 'react';
import { Building2, Home, RefreshCw, TrendingUp, DollarSign, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DealWithClient } from '@/hooks/useAllDeals';

interface Props {
  deals: DealWithClient[];
}

export function PipelineValueSummaryBar({ deals }: Props) {
  const stats = useMemo(() => {
    const totalValue = deals.reduce((s, d) => s + (d.total_contract_price || 0), 0);
    const avgValue = deals.length > 0 ? totalValue / deals.length : 0;
    const totalCommission = deals.reduce((s, d) => s + (d.commission_estimate || 0), 0);

    const byType = {
      existing_property: deals.filter(d => d.deal_type === 'existing_property').length,
      house_and_land: deals.filter(d => d.deal_type === 'house_and_land').length,
      refinance: deals.filter(d => d.deal_type === 'refinance').length,
    };

    // Stage distribution for conversion
    const stageGroups = { early: 0, mid: 0, late: 0 };
    deals.forEach(d => {
      if (d.current_stage_number <= 2) stageGroups.early++;
      else if (d.current_stage_number <= 5) stageGroups.mid++;
      else stageGroups.late++;
    });

    const uniquePersons = new Set(deals.map(d => d.responsible_person).filter(Boolean)).size;

    return { totalValue, avgValue, totalCommission, byType, stageGroups, uniquePersons };
  }, [deals]);

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v);

  const total = deals.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-2.5 sm:p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-sm sm:text-lg font-bold">{fmt(stats.totalValue)}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Total Pipeline</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2.5 sm:p-3 text-center">
          <BarChart3 className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{fmt(stats.avgValue)}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Avg Deal Size</p>
        </CardContent>
      </Card>

      <Card className="bg-green-500/5 border-green-500/20">
        <CardContent className="p-2.5 sm:p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto text-green-600 mb-1" />
          <p className="text-sm sm:text-lg font-bold text-green-600">{fmt(stats.totalCommission)}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Est. Commission</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2.5 sm:p-3 text-center">
          <Building2 className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{stats.byType.existing_property}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Existing Property</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2.5 sm:p-3 text-center">
          <Home className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{stats.byType.house_and_land}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">House & Land</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2.5 sm:p-3 text-center">
          <RefreshCw className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{stats.byType.refinance}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Refinance</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2.5 sm:p-3 text-center">
          <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm sm:text-lg font-bold">{stats.uniquePersons}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground">Team Members</p>
        </CardContent>
      </Card>
    </div>
  );
}
