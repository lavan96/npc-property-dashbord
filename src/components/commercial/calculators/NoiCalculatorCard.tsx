import { useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calculateNoi, calculateNoiEngine, type LeaseType, type NoiBasis, type OutgoingsBreakdown } from '@/utils/commercial';
import { useApplyPrefill, useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { invokeSecureFunction } from '@/lib/secureInvoke';

interface NoiAiEstimate {
  marketRentPa?: number;
  grossPassingRentPa?: number;
  otherIncomePa?: number;
  recoveredOutgoingsPa?: number;
  vacancyAllowancePct?: number;
  incentiveAdjustment?: number;
  tenantRiskHaircut?: number;
  leaseTypeAssumed?: LeaseType | 'unknown';
  outgoings?: Partial<Record<keyof OutgoingsBreakdown, number>>;
  ratePerSqm?: number;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);

const num = (v: string) => (v === '' ? 0 : Number(v));

const OUTGOING_KEYS: Array<keyof OutgoingsBreakdown> = [
  'council', 'water', 'land_tax', 'insurance', 'management',
  'repairs_maintenance', 'utilities', 'cleaning', 'security', 'other',
];

const labelMap: Record<keyof OutgoingsBreakdown, string> = {
  council: 'Council Rates', water: 'Water', land_tax: 'Land Tax',
  insurance: 'Insurance', management: 'Management', repairs_maintenance: 'Repairs & Maint.',
  utilities: 'Utilities', cleaning: 'Cleaning', security: 'Security', other: 'Other',
};

export function NoiCalculatorCard() {
  const [grossRent, setGrossRent] = useState('250000');
  const [recovered, setRecovered] = useState('40000');
  const [other, setOther] = useState('5000');
  const [vacancy, setVacancy] = useState('5');
  const [leaseType, setLeaseType] = useState<LeaseType>('unknown');
  const [noiBasis, setNoiBasis] = useState<NoiBasis>('lenderAdjusted');
  const [marketRent, setMarketRent] = useState('260000');
  const [incentiveAdjustment, setIncentiveAdjustment] = useState('5000');
  const [tenantRiskHaircut, setTenantRiskHaircut] = useState('2500');
  const [outgoings, setOutgoings] = useState<Record<string, string>>({
    council: '12000', water: '4000', land_tax: '18000', insurance: '6000',
    management: '10000', repairs_maintenance: '8000', utilities: '0', cleaning: '3000',
    security: '0', other: '0',
  });

  const [aiEstimate, setAiEstimate] = useState<NoiAiEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const { prefill } = useCalculatorPrefill();

  // Prefill from linked property — recovered outgoings sum and any vendor-quoted gross rent
  useApplyPrefill((p) => {
    if (p.grossPassingRentPa != null) setGrossRent(String(p.grossPassingRentPa));
    if (p.marketRentPa != null) setMarketRent(String(p.marketRentPa));
    if (p.recoveredOutgoingsPa != null) setRecovered(String(p.recoveredOutgoingsPa));
    if (p.outgoings) {
      const og = p.outgoings;
      setOutgoings(prev => ({
        ...prev,
        council: og.council != null ? String(og.council) : prev.council,
        water: og.water != null ? String(og.water) : prev.water,
        land_tax: og.land_tax != null ? String(og.land_tax) : prev.land_tax,
        insurance: og.insurance != null ? String(og.insurance) : prev.insurance,
        management: og.management != null ? String(og.management) : prev.management,
        repairs_maintenance: og.repairs_maintenance != null ? String(og.repairs_maintenance) : prev.repairs_maintenance,
        utilities: og.utilities != null ? String(og.utilities) : prev.utilities,
        cleaning: og.cleaning != null ? String(og.cleaning) : prev.cleaning,
        security: og.security != null ? String(og.security) : prev.security,
        other: og.other != null ? String(og.other) : prev.other,
      }));
    }
  });

  const result = useMemo(() => {
    const o: OutgoingsBreakdown = {};
    OUTGOING_KEYS.forEach(k => { (o as any)[k] = num(outgoings[k] ?? '0'); });
    return calculateNoi({
      grossRentalIncome: num(grossRent),
      recoveredOutgoings: num(recovered),
      otherIncome: num(other),
      vacancyAllowancePct: num(vacancy),
      outgoings: o,
    });
  }, [grossRent, recovered, other, vacancy, outgoings]);

  const assessment = useMemo(() => calculateNoiEngine({
    dataSourceMode: 'global',
    leaseType,
    grossPassingRent: num(grossRent),
    otherIncome: num(other),
    marketRent: num(marketRent),
    vacancyAllowancePct: num(vacancy),
    recoveredOutgoings: num(recovered),
    outgoings: OUTGOING_KEYS.map(k => ({ name: labelMap[k], amount: num(outgoings[k] ?? '0'), recoverablePct: num(recovered) > 0 ? 100 : 0 })),
    incentiveAdjustment: num(incentiveAdjustment),
    tenantRiskHaircut: num(tenantRiskHaircut),
    leaseDocsVerified: leaseType !== 'unknown',
    confidenceTags: ['Manual Estimate'],
  }, noiBasis), [grossRent, recovered, other, vacancy, outgoings, leaseType, noiBasis, marketRent, incentiveAdjustment, tenantRiskHaircut]);

  const applyEstimate = (e: NoiAiEstimate) => {
    if (e.marketRentPa != null) setMarketRent(String(Math.round(e.marketRentPa)));
    if (e.grossPassingRentPa != null) setGrossRent(String(Math.round(e.grossPassingRentPa)));
    else if (e.marketRentPa != null) setGrossRent(String(Math.round(e.marketRentPa)));
    if (e.otherIncomePa != null) setOther(String(Math.round(e.otherIncomePa)));
    if (e.recoveredOutgoingsPa != null) setRecovered(String(Math.round(e.recoveredOutgoingsPa)));
    if (e.vacancyAllowancePct != null) setVacancy(String(e.vacancyAllowancePct));
    if (e.incentiveAdjustment != null) setIncentiveAdjustment(String(Math.round(e.incentiveAdjustment)));
    if (e.tenantRiskHaircut != null) setTenantRiskHaircut(String(Math.round(e.tenantRiskHaircut)));
    if (e.leaseTypeAssumed && e.leaseTypeAssumed !== 'unknown') setLeaseType(e.leaseTypeAssumed as LeaseType);
    if (e.outgoings) {
      setOutgoings(prev => {
        const next = { ...prev };
        OUTGOING_KEYS.forEach(k => {
          const v = (e.outgoings as any)?.[k];
          if (v != null && !Number.isNaN(Number(v))) next[k] = String(Math.round(Number(v)));
        });
        return next;
      });
    }
  };

  const requestEstimate = async () => {
    if (!prefill) {
      toast.error('Select a property in the Overview tab to anchor the AI estimate.');
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
        current: {
          grossRent: num(grossRent), marketRent: num(marketRent), recovered: num(recovered),
          other: num(other), vacancy: num(vacancy), leaseType,
          outgoings: Object.fromEntries(OUTGOING_KEYS.map(k => [k, num(outgoings[k] ?? '0')])),
        },
      };
      const { data, error } = await invokeSecureFunction<{ success: boolean; estimate?: NoiAiEstimate; error?: string }>(
        'estimate-commercial-noi',
        { snapshot },
      );
      if (error || !data?.success || !data.estimate) {
        toast.error(data?.error || error?.message || 'Failed to generate NOI estimate');
        return;
      }
      setAiEstimate(data.estimate);
      const conf = data.estimate.confidence ?? 'medium';
      toast.success(`AI estimate ready (${conf} confidence). Click "Accept AI estimate" to apply.`, {
        description: data.estimate.reasoning?.slice(0, 200),
      });
    } catch (err: any) {
      toast.error(err?.message || 'AI estimate failed');
    } finally {
      setEstimating(false);
    }
  };

  const acceptEstimate = () => {
    if (!aiEstimate) {
      toast.info('Run "Estimate for me" first to generate an AI estimate.');
      return;
    }
    applyEstimate(aiEstimate);
    toast.success('AI estimate applied to NOI inputs.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>NOI Calculator</CardTitle>
        <CardDescription>Effective Gross Income minus operating expenses, with Actual, Stabilised and Lender-Adjusted NOI connected to the global deal profile.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-2 items-center">
          <Badge variant="outline" className="border-primary/40 text-primary">Global Input Sync: On</Badge>
          <Badge variant="secondary">{assessment.confidenceTag}</Badge>
          {prefill ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 max-w-[260px] truncate" title={prefill.address}>Anchored: {prefill.address}</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400">No property selected</Badge>
          )}
          <Button size="sm" variant="outline" onClick={requestEstimate} disabled={estimating || !prefill}>
            {estimating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Estimate for me
          </Button>
          <Button size="sm" variant="outline" onClick={acceptEstimate} disabled={!aiEstimate}>Accept AI estimate</Button>
          <SaveBackButton build={() => ({ outgoings_recoverable: { council: num(outgoings.council ?? '0'), water: num(outgoings.water ?? '0'), land_tax: num(outgoings.land_tax ?? '0'), insurance: num(outgoings.insurance ?? '0'), management: num(outgoings.management ?? '0'), repairs_maintenance: num(outgoings.repairs_maintenance ?? '0'), utilities: num(outgoings.utilities ?? '0'), cleaning: num(outgoings.cleaning ?? '0'), security: num(outgoings.security ?? '0'), other: num(outgoings.other ?? '0') } })} />
        </div>
        {aiEstimate?.reasoning && (
          <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
            <span className="font-medium text-primary">AI rationale ({aiEstimate.confidence}):</span> {aiEstimate.reasoning}
            {aiEstimate.ratePerSqm ? <div className="mt-1">Implied rate: ${Math.round(aiEstimate.ratePerSqm)}/sqm</div> : null}
          </div>
        )}
      </CardHeader>
      </CardHeader>
      <CardContent className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Gross Rental Income (PA)</Label><Input type="number" value={grossRent} onChange={e => setGrossRent(e.target.value)} /></div>
            <div><Label>Recovered Outgoings</Label><Input type="number" value={recovered} onChange={e => setRecovered(e.target.value)} /></div>
            <div><Label>Other Income</Label><Input type="number" value={other} onChange={e => setOther(e.target.value)} /></div>
            <div><Label>Vacancy Allowance %</Label><Input type="number" value={vacancy} onChange={e => setVacancy(e.target.value)} /></div>
            <div><Label>Lease Type</Label><select className="w-full rounded-md border bg-background p-2" value={leaseType} onChange={e => setLeaseType(e.target.value as LeaseType)}><option value="unknown">Unknown</option><option value="gross">Gross</option><option value="net">Net</option><option value="semiGross">Semi-gross</option><option value="tripleNet">Triple net</option></select></div>
            <div><Label>NOI Basis</Label><select className="w-full rounded-md border bg-background p-2" value={noiBasis} onChange={e => setNoiBasis(e.target.value as NoiBasis)}><option value="actual">Actual NOI</option><option value="stabilised">Stabilised NOI</option><option value="lenderAdjusted">Lender-adjusted NOI</option></select></div>
            <div><Label>Market Rent</Label><Input type="number" value={marketRent} onChange={e => setMarketRent(e.target.value)} /></div>
            <div><Label>Tenant incentive adjustment</Label><Input type="number" value={incentiveAdjustment} onChange={e => setIncentiveAdjustment(e.target.value)} /></div>
            <div><Label>Tenant risk haircut</Label><Input type="number" value={tenantRiskHaircut} onChange={e => setTenantRiskHaircut(e.target.value)} /></div>
          </div>
          <Separator />
          <div>
            <Label className="mb-2 block">Operating Expenses (PA)</Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTGOING_KEYS.map(k => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground">{labelMap[k]}</Label>
                  <Input type="number" value={outgoings[k] ?? ''} onChange={e => setOutgoings(prev => ({ ...prev, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3 bg-muted/40 rounded-lg p-4">
          <Row label="Potential Gross Income" value={fmt(result.potentialGrossIncome)} />
          <Row label="Vacancy Loss" value={`- ${fmt(result.vacancyLoss)}`} />
          <Row label="Recovered Outgoings" value={`+ ${fmt(result.recoveredOutgoings)}`} />
          <Row label="Effective Gross Income" value={fmt(result.effectiveGrossIncome)} bold />
          <Separator />
          <Row label="Total Outgoings" value={`- ${fmt(result.totalOutgoings)}`} />
          <Row label="Owner-Borne Outgoings" value={fmt(result.netOutgoings)} muted />
          <Separator />
          <Row label="Legacy NOI" value={fmt(result.noi)} />
          <Row label="Actual NOI" value={fmt(assessment.actualNoi)} highlight />
          <Row label="Stabilised NOI" value={fmt(assessment.stabilisedNoi)} highlight />
          <Row label="Lender-Adjusted NOI" value={fmt(assessment.lenderAdjustedNoi)} highlight />
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1"><div className="font-medium text-foreground">NOI Bridge</div>{assessment.bridge.map(item => <div key={item.label} className="flex justify-between"><span>{item.label}</span><span>{fmt(item.amount)}</span></div>)}</div>
          {assessment.warnings.length > 0 && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">{assessment.warnings.map(w => <div key={w}>• {w}</div>)}</div>}
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
