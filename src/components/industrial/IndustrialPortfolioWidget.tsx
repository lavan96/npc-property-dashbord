/**
 * Industrial Portfolio KPI Widget — overview tile.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Factory, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  industrialApi,
  type IndustrialProperty,
  type IndustrialTenancy,
} from '@/hooks/useIndustrialProperties';
import { calculateIndustrialNoi, calculateIndustrialWale } from '@/utils/industrial';

const fmtAud = (n: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
    notation: n >= 1_000_000 ? 'compact' : 'standard',
  }).format(n || 0);

interface PortfolioMetrics {
  count: number;
  totalValuation: number;
  totalGla: number;
  totalRent: number;
  totalNoi: number;
  weightedYieldPct: number;
  waleYears: number;
  occupancyPct: number;
  upcomingExpiries12m: number;
}

const EMPTY: PortfolioMetrics = {
  count: 0, totalValuation: 0, totalGla: 0, totalRent: 0, totalNoi: 0,
  weightedYieldPct: 0, waleYears: 0, occupancyPct: 0, upcomingExpiries12m: 0,
};

export function IndustrialPortfolioWidget() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PortfolioMetrics>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const propsRes = await industrialApi.listProperties();
      const props = propsRes.data || [];
      if (props.length === 0) {
        if (!cancelled) { setMetrics(EMPTY); setLoading(false); }
        return;
      }
      const tenancyLists = await Promise.all(
        props.map(p => industrialApi.listTenancies(p.id).then(r => r.data || []))
      );
      if (cancelled) return;
      setMetrics(aggregate(props, tenancyLists));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const tiles = useMemo(() => ([
    { label: 'Assets', value: metrics.count.toString() },
    { label: 'Total Value', value: fmtAud(metrics.totalValuation) },
    { label: 'Total GLA', value: `${metrics.totalGla.toLocaleString()} m²` },
    { label: 'Passing Rent', value: `${fmtAud(metrics.totalRent)} pa` },
    { label: 'NOI (est.)', value: `${fmtAud(metrics.totalNoi)} pa` },
    { label: 'Weighted Yield', value: `${metrics.weightedYieldPct.toFixed(2)}%` },
    { label: 'WALE (income)', value: `${metrics.waleYears.toFixed(1)} yrs` },
    { label: 'Occupancy', value: `${metrics.occupancyPct.toFixed(1)}%` },
  ]), [metrics]);

  return (
    <Card className="hover-scale">
      <CardHeader className="flex flex-row items-center justify-between pb-2 md:pb-4">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Factory className="h-5 w-5 text-primary" />
          Industrial Portfolio
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/industrial')}>
          View <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : metrics.count === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Factory className="h-10 w-10 mx-auto mb-2 opacity-40" />
            No industrial assets yet.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => navigate('/industrial')}>
                Add your first industrial property
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tiles.map(t => (
                <div key={t.label} className="rounded-md bg-muted/30 border p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
                  <div className="text-base md:text-lg font-bold mt-0.5">{t.value}</div>
                </div>
              ))}
            </div>
            {metrics.upcomingExpiries12m > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warning-foreground bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {metrics.upcomingExpiries12m} tenancy{metrics.upcomingExpiries12m === 1 ? '' : 'ies'} expiring in the next 12 months.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function aggregate(props: IndustrialProperty[], tenancyLists: IndustrialTenancy[][]): PortfolioMetrics {
  let totalValuation = 0;
  let totalRent = 0;
  let totalNoi = 0;
  let totalGla = 0;
  let occupiedGla = 0;
  let upcomingExpiries = 0;
  const waleTenancies: IndustrialTenancy[] = [];
  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
  const horizon = Date.now() + oneYearMs;

  props.forEach((p, idx) => {
    const tenancies = tenancyLists[idx] || [];
    const grossRent = tenancies.reduce((s, t) => s + (Number(t.base_rent_pa) || 0), 0);
    const noi = calculateIndustrialNoi({
      grossRentalIncome: grossRent,
      vacancyAllowancePct: 4,
      outgoings: { management: grossRent * 0.025 },
    });
    totalRent += grossRent;
    totalNoi += noi.noi;
    totalValuation += Number(p.current_valuation) || Number(p.purchase_price) || 0;
    totalGla += Number(p.gla_sqm) || 0;

    tenancies.forEach(t => {
      const area = Number(t.gla_sqm) || 0;
      occupiedGla += area;
      waleTenancies.push(t);
      if (t.lease_end) {
        const ts = new Date(t.lease_end).getTime();
        if (!isNaN(ts) && ts > Date.now() && ts <= horizon) upcomingExpiries++;
      }
    });
  });

  const weightedYieldPct = totalValuation > 0 ? (totalNoi / totalValuation) * 100 : 0;
  const wale = calculateIndustrialWale(waleTenancies.map(t => ({
    base_rent_pa: Number(t.base_rent_pa) || 0,
    gla_sqm: Number(t.gla_sqm) || 0,
    lease_end: t.lease_end || null,
  })));
  const occupancyPct = totalGla > 0 ? Math.min(100, (occupiedGla / totalGla) * 100) : 0;

  return {
    count: props.length,
    totalValuation,
    totalGla,
    totalRent,
    totalNoi,
    weightedYieldPct,
    waleYears: wale.waleByIncome,
    occupancyPct,
    upcomingExpiries12m: upcomingExpiries,
  };
}
