/**
 * Commercial Portfolio KPI Widget
 *
 * Pulls every commercial property the user owns, fetches their rent rolls,
 * and surfaces the headline portfolio metrics:
 *   - Asset count
 *   - Total valuation
 *   - Aggregate passing rent / NOI
 *   - Weighted passing yield
 *   - Portfolio WALE (by income)
 *   - Portfolio occupancy (by area)
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, ArrowRight, AlertTriangle } from 'lucide-react';
import {
  commercialApi,
  type CommercialProperty,
  type CommercialLease,
} from '@/hooks/useCommercialProperties';
import { calculateNoi, calculateWale } from '@/utils/commercial';

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
  totalRent: number;
  totalNoi: number;
  weightedYieldPct: number;
  waleYears: number;
  occupancyPct: number;
  upcomingExpiries12m: number;
}

const EMPTY: PortfolioMetrics = {
  count: 0,
  totalValuation: 0,
  totalRent: 0,
  totalNoi: 0,
  weightedYieldPct: 0,
  waleYears: 0,
  occupancyPct: 0,
  upcomingExpiries12m: 0,
};

export function CommercialPortfolioWidget() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PortfolioMetrics>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const propsRes = await commercialApi.listProperties();
      const props = propsRes.data || [];
      if (props.length === 0) {
        if (!cancelled) { setMetrics(EMPTY); setLoading(false); }
        return;
      }
      const leaseLists = await Promise.all(
        props.map(p => commercialApi.listLeases(p.id).then(r => r.data || []))
      );
      if (cancelled) return;
      setMetrics(aggregate(props, leaseLists));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const tiles = useMemo(() => ([
    { label: 'Assets', value: metrics.count.toString() },
    { label: 'Total Value', value: fmtAud(metrics.totalValuation) },
    { label: 'Passing Rent', value: `${fmtAud(metrics.totalRent)} pa` },
    { label: 'NOI (est.)', value: `${fmtAud(metrics.totalNoi)} pa` },
    { label: 'Weighted Yield', value: `${metrics.weightedYieldPct.toFixed(2)}%` },
    { label: 'WALE (income)', value: `${metrics.waleYears.toFixed(1)} yrs` },
    { label: 'Occupancy', value: `${metrics.occupancyPct.toFixed(1)}%` },
    { label: 'Expiries < 12m', value: metrics.upcomingExpiries12m.toString() },
  ]), [metrics]);

  return (
    <Card className="hover-scale">
      <CardHeader className="flex flex-row items-center justify-between pb-2 md:pb-4">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Commercial Portfolio
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/commercial')}>
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
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
            No commercial assets yet.
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => navigate('/commercial')}>
                Add your first commercial property
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tiles.map(t => (
                <div key={t.label} className="rounded-md bg-muted/30 border p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t.label}
                  </div>
                  <div className="text-base md:text-lg font-bold mt-0.5">{t.value}</div>
                </div>
              ))}
            </div>
            {metrics.upcomingExpiries12m > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-warning-foreground bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {metrics.upcomingExpiries12m} lease{metrics.upcomingExpiries12m === 1 ? '' : 's'} expiring in the next 12 months — review renewal strategy.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function aggregate(props: CommercialProperty[], leaseLists: CommercialLease[][]): PortfolioMetrics {
  let totalValuation = 0;
  let totalRent = 0;
  let totalNoi = 0;
  let totalNla = 0;
  let occupiedNla = 0;
  let upcomingExpiries = 0;
  const waleLeases: CommercialLease[] = [];
  const noiByProperty: number[] = [];
  const valByProperty: number[] = [];
  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
  const horizon = Date.now() + oneYearMs;

  props.forEach((p, idx) => {
    const leases = leaseLists[idx] || [];
    const grossRent = leases.reduce((s, l) => s + (l.base_rent_pa || 0), 0);
    const noiRes = calculateNoi({
      grossRentalIncome: grossRent,
      recoveredOutgoings: 0,
      vacancyAllowancePct: 5,
      outgoings: p.outgoings_recoverable || {},
    });
    totalRent += grossRent;
    totalNoi += noiRes.noi;
    totalValuation += p.valuation || 0;
    valByProperty.push(p.valuation || 0);
    noiByProperty.push(noiRes.noi);

    leases.forEach(l => {
      totalNla += l.nla_sqm || 0;
      if (l.status === 'occupied' || l.status === 'holdover') {
        occupiedNla += l.nla_sqm || 0;
        waleLeases.push(l);
      }
      if (l.lease_end) {
        const t = new Date(l.lease_end).getTime();
        if (!isNaN(t) && t > Date.now() && t <= horizon) upcomingExpiries++;
      }
    });
  });

  const weightedYieldPct = totalValuation > 0 ? (totalNoi / totalValuation) * 100 : 0;
  const wale = calculateWale(waleLeases.map(l => ({
    base_rent_pa: l.base_rent_pa || 0,
    nla_sqm: l.nla_sqm || 0,
    lease_end: l.lease_end || null,
    status: l.status,
  })));
  const occupancyPct = totalNla > 0 ? (occupiedNla / totalNla) * 100 : 0;

  return {
    count: props.length,
    totalValuation,
    totalRent,
    totalNoi,
    weightedYieldPct,
    waleYears: wale.waleByIncome,
    occupancyPct,
    upcomingExpiries12m: upcomingExpiries,
  };
}
