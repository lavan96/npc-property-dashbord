import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateYields, valueFromCap, calculateCapRateEngine } from '@/utils/commercial';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { invokeSecureFunction } from '@/lib/secureInvoke';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

interface CapRateAiEstimate {
  capRateLowPct: number;
  capRateMidPct: number;
  capRateHighPct: number;
  targetCapRatePct: number;
  impliedValueAtTarget?: number;
  evidenceBasis?: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export function CapRateCalculatorCard() {
  const { prefill } = useCalculatorPrefill();
  const [passingNoi, setPassingNoi] = useState('180000');
  const [marketNoi, setMarketNoi] = useState('210000');
  const [price, setPrice] = useState('3000000');
  const [targetCap, setTargetCap] = useState('6.5');
  const [estimating, setEstimating] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<CapRateAiEstimate | null>(null);

  useApplyPrefill((p) => {
    if (p.passingNoi != null) setPassingNoi(String(p.passingNoi));
    if (p.marketNoi != null) setMarketNoi(String(p.marketNoi));
    const px = p.purchasePrice ?? p.valuation;
    if (px != null) setPrice(String(px));
    // Reset AI estimate when property changes so figures stay tied to the anchor.
    setAiEstimate(null);
  });

  const yields = useMemo(() => calculateYields({
    passingNoi: num(passingNoi), marketNoi: num(marketNoi), price: num(price),
  }), [passingNoi, marketNoi, price]);

  const valuation = useMemo(() => valueFromCap(num(marketNoi), num(targetCap)), [marketNoi, targetCap]);

  const sensitivityRates = useMemo(() => {
    if (aiEstimate) {
      const set = new Set([
        +aiEstimate.capRateLowPct.toFixed(2),
        +((aiEstimate.capRateLowPct + aiEstimate.capRateMidPct) / 2).toFixed(2),
        +aiEstimate.capRateMidPct.toFixed(2),
        +((aiEstimate.capRateMidPct + aiEstimate.capRateHighPct) / 2).toFixed(2),
        +aiEstimate.capRateHighPct.toFixed(2),
      ]);
      return Array.from(set).sort((a, b) => a - b);
    }
    return [5.5, 6, 6.5, 7, 7.5];
  }, [aiEstimate]);

  const capAssessment = useMemo(() => calculateCapRateEngine({
    passingNoi: num(passingNoi),
    marketNoi: num(marketNoi),
    selectedNoi: num(marketNoi),
    price: num(price),
    targetCapRatePct: num(targetCap),
    sensitivityCapRatesPct: sensitivityRates,
    aiBenchmark: true,
  }), [passingNoi, marketNoi, price, targetCap, sensitivityRates]);

  const reversionarySpread = (yields.reversionaryYield - yields.passingYield).toFixed(2);

  const requestEstimate = async () => {
    if (!prefill) {
      toast.error('Select a property in the Overview tab to anchor the AI cap-rate estimate.');
      return;
    }
    setEstimating(true);
    try {
      const snapshot = {
        propertyId: prefill.propertyId,
        address: prefill.address,
        state: prefill.state,
        assetCategory: prefill.assetCategory,
        assetSubtype: prefill.assetSubtype,
        gstTreatment: prefill.gstTreatment,
        purchasePrice: prefill.purchasePrice,
        valuation: prefill.valuation,
        gfaSqm: prefill.gfaSqm,
        nlaSqm: prefill.nlaSqm,
        glaSqm: prefill.glaSqm,
        siteAreaSqm: prefill.siteAreaSqm,
        hardstandSqm: prefill.hardstandSqm,
        officePct: prefill.officePct,
        parkingBays: prefill.parkingBays,
        clearanceMetres: prefill.clearanceMetres,
        yearBuilt: prefill.yearBuilt,
        zoning: prefill.zoning,
        walesYears: prefill.walesYears,
        passingNoi: num(passingNoi) || prefill.passingNoi,
        marketNoi: num(marketNoi) || prefill.marketNoi,
        current: {
          passingNoi: num(passingNoi),
          marketNoi: num(marketNoi),
          price: num(price),
          targetCapRatePct: num(targetCap),
        },
      };
      const { data, error } = await invokeSecureFunction<{ success: boolean; estimate?: CapRateAiEstimate; error?: string }>(
        'estimate-commercial-caprate',
        { snapshot },
      );
      if (error || !data?.success || !data.estimate) {
        toast.error(data?.error || error?.message || 'Failed to generate cap-rate estimate');
        return;
      }
      setAiEstimate(data.estimate);
      setTargetCap(String(data.estimate.targetCapRatePct));
      toast.success(`AI cap-rate range ready (${data.estimate.confidence} confidence).`, {
        description: `${data.estimate.capRateLowPct}% – ${data.estimate.capRateHighPct}% · target ${data.estimate.targetCapRatePct}%`,
      });
    } catch (err: any) {
      toast.error(err?.message || 'AI estimate failed');
    } finally {
      setEstimating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap Rate & Yield</CardTitle>
        <CardDescription>Passing, reversionary and Blended Yield / Simple Average Yield. Benchmark only — valuer confirmation required.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2 items-center">
          <Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge>
          <Badge variant="secondary">AI Estimate benchmark only</Badge>
          {prefill ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 max-w-[260px] truncate" title={prefill.address}>Anchored: {prefill.address}</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400">No property selected</Badge>
          )}
          <Button size="sm" variant="outline" onClick={requestEstimate} disabled={estimating || !prefill}>
            {estimating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Estimate cap rate range
          </Button>
          <SaveBackButton build={() => ({ purchase_price: num(price), valuation: valuation || undefined })} />
        </div>
        {aiEstimate && (
          <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
            <div><span className="font-medium text-primary">AI cap-rate range ({aiEstimate.confidence}):</span> {aiEstimate.capRateLowPct}% – {aiEstimate.capRateHighPct}% · target <span className="font-semibold text-primary">{aiEstimate.targetCapRatePct}%</span>{aiEstimate.evidenceBasis ? ` · ${aiEstimate.evidenceBasis}` : ''}</div>
            <div className="mt-1">{aiEstimate.reasoning}</div>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div><Label>Passing NOI (PA)</Label><Input type="number" value={passingNoi} onChange={e => setPassingNoi(e.target.value)} /></div>
          <div><Label>Market NOI (PA)</Label><Input type="number" value={marketNoi} onChange={e => setMarketNoi(e.target.value)} /></div>
          <div><Label>Price / Value</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <Separator />
          <div><Label>Target Cap Rate %</Label><Input type="number" step="0.1" value={targetCap} onChange={e => setTargetCap(e.target.value)} /></div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Passing Yield" value={`${yields.passingYield}%`} />
          <Row label="Reversionary Yield" value={`${yields.reversionaryYield}%`} />
          <Row label="Blended Yield / Simple Average Yield" value={`${yields.blendedYield}%`} bold />
          <Row label="Reversion Spread" value={`${reversionarySpread}%`} muted />
          <Separator />
          <Row label={`Implied Value @ ${targetCap || 0}%`} value={fmt(valuation)} highlight />
          <Row label="Valuation Gap" value={fmt(capAssessment.valuationGap)} />
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">Value Sensitivity</div>
            {capAssessment.valueSensitivity.map(row => (
              <div key={row.capRatePct} className="flex justify-between">
                <span>{row.capRatePct}%</span><span>{fmt(row.impliedValue)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-200">Benchmark only — valuer confirmation required.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, muted, highlight }: { label: string; value: string; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'text-lg font-bold text-primary' : bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground text-sm' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
