import type { ReactNode } from 'react';
import { FileText, FileWarning, Sparkles, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import { buildCommercialIndustrialReportPayload } from '@/utils/commercial/reportPayloadBuilder';

const fmt = (n?: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n?: number) => `${((n || 0) * 100).toFixed(1)}%`;
const title = (v?: string) => (v || 'Unknown').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
const badgeVariant = (r?: string) => (r === 'green' || r === 'supportable' ? 'default' : r === 'amber' || r === 'supportableSubjectToVerification' ? 'secondary' : 'destructive');

function Row({ label, value }: { label: string; value: string | number | undefined }) {
  return <div className="flex justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{typeof value === 'number' ? fmt(value) : value || 'Unknown'}</span></div>;
}

function Section({ title: heading, children }: { title: string; children: ReactNode }) {
  return <Card className="bg-card/95"><CardHeader className="pb-2"><CardTitle className="text-base">{heading}</CardTitle></CardHeader><CardContent className="space-y-2">{children}</CardContent></Card>;
}

export function CommercialIndustrialOverviewCard() {
  const profile = useCommercialDealState(s => s.profile);
  const borrowing = profile.borrowingOutputs;
  const reportPayload = buildCommercialIndustrialReportPayload(profile);
  const isIndustrial = profile.dealProfile.assetCategory === 'industrial';
  const docs = reportPayload.sections.find(s => s.title === 'Required Documents')?.data as any[] | undefined;
  const aiFields = Object.values(profile.aiEstimateMetadata).filter(e => e.confidenceTag === 'AI Estimate');
  const unknowns = Object.values(profile.assumptions).filter(a => a.confidenceTag === 'Unknown' || a.confidenceTag === 'Specialist Review Required');

  return <div className="space-y-4">
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Commercial / Industrial Assessment Overview</CardTitle><CardDescription>Read-only client-facing summary generated from the shared global deal state. Deterministic calculator outputs remain the source of truth.</CardDescription></div>
          <div className="flex flex-wrap gap-2"><Badge variant={badgeVariant(borrowing?.creditAssessmentStatus) as any}>{borrowing?.creditAssessmentStatusLabel ?? 'Credit status pending'}</Badge><Badge variant={badgeVariant(borrowing?.overallStatus) as any}>{borrowing?.purchaseAbilityStatusLabel ?? 'Purchase ability pending'}</Badge></div>
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-4 gap-3">
        <Row label="Asset domain" value={title(profile.dealProfile.assetCategory)} />
        <Row label="Asset subtype" value={profile.dealProfile.assetSubtype} />
        <Row label="Acquisition purpose" value={title(profile.dealProfile.acquisitionPurpose)} />
        <Row label="Purchase price" value={profile.propertyValuation.purchasePrice} />
        <Row label="Property value used" value={borrowing?.propertyValueUsedForLvr ?? profile.propertyValuation.estimatedMarketValue} />
        <Row label="Maximum risk-adjusted loan" value={borrowing?.finalRiskAdjustedLoan} />
        <Row label="Proposed loan" value={borrowing?.proposedLoan ? fmt(borrowing.proposedLoan) : 'No proposed loan entered'} />
        <Row label="Binding constraint" value={title(borrowing?.bindingConstraint)} />
        <Row label="Implied LVR" value={pct(borrowing?.impliedLvr)} />
        <Row label="Required equity" value={borrowing?.fundsToComplete.requiredEquity} />
        <Row label="Available equity" value={profile.purchaserStructure.availableCashEquity} />
        <Row label="Equity surplus / shortfall" value={borrowing?.fundsToComplete.equitySurplusShortfall} />
        <Row label="Post-settlement liquidity" value={borrowing?.fundsToComplete.postSettlementLiquidity} />
        <Row label="Key next action" value={borrowing?.requiredNextAction} />
      </CardContent>
    </Card>

    <div className="grid lg:grid-cols-2 gap-4">
      <Section title="Transaction Snapshot"><Row label="State / territory" value={profile.dealProfile.state} /><Row label="Lease status" value={title(profile.dealProfile.leaseStatus)} /><Row label="Data source mode" value="Global Sync On" /></Section>
      <Section title="Borrowing Outcome"><Row label="Maximum loan" value={borrowing?.finalRiskAdjustedLoan} /><Row label="LVR cap" value={borrowing?.componentCaps.lvrCap} /><Row label="ICR cap" value={borrowing?.componentCaps.icrCap} /><Row label="Debt-yield cap" value={borrowing?.componentCaps.debtYieldCap} /></Section>
      <Section title="Purchase Ability"><Row label="Total acquisition costs" value={borrowing?.fundsToComplete.totalAcquisitionCosts} /><Row label="Total cost base" value={borrowing?.fundsToComplete.totalCostBase} /><Row label="Liquidity months" value={borrowing?.fundsToComplete.monthsDebtServiceCovered == null ? 'N/A — equity shortfall exists before liquidity reserve can be assessed.' : `${borrowing.fundsToComplete.monthsDebtServiceCovered.toFixed(1)} months`} /></Section>
      <Section title="Income / NOI Summary"><Row label="Actual NOI" value={borrowing?.noi.actualNoi ?? profile.noiOutputs?.noi} /><Row label="Stabilised NOI" value={borrowing?.noi.stabilisedNoi} /><Row label="Lender-adjusted NOI" value={borrowing?.noi.lenderAdjustedNoi} /></Section>
      <Section title="Valuation / Cap Rate Summary"><Row label="Estimated market value" value={profile.propertyValuation.estimatedMarketValue} /><Row label="Valuation confidence" value={title(profile.propertyValuation.valuationConfidence)} /><Row label="Cap rate output" value={(profile.capRateOutputs as any)?.capitalisationRate ? pct((profile.capRateOutputs as any).capitalisationRate) : 'Pending'} /></Section>
      <Section title="ICR / DSCR / Debt Yield Summary"><Row label="ICR" value={borrowing ? `${borrowing.icr.toFixed(2)}x` : 'Pending'} /><Row label="DSCR" value={borrowing ? `${borrowing.dscr.toFixed(2)}x` : 'Pending'} /><Row label="Debt yield" value={pct(borrowing?.debtYield)} /></Section>
      <Section title="GST Summary"><Row label="GST treatment" value={title(profile.acquisitionCosts.gstTreatment ?? profile.gstInputs.treatment)} /><Row label="Settlement cashflow" value={borrowing?.fundsToComplete.gstCashflowRequirement} /><Row label="Economic cost" value={borrowing?.fundsToComplete.gst.economicCost} /></Section>
      <Section title="DCF Summary"><Row label="Hold period" value={profile.dcfInputs.holdPeriodYears ? `${profile.dcfInputs.holdPeriodYears} years` : 'Pending'} /><Row label="Rental growth" value={profile.dcfInputs.rentalGrowthPct ? `${profile.dcfInputs.rentalGrowthPct}%` : 'Pending'} /><Row label="Exit cap" value={profile.dcfInputs.terminalCapRatePct ? `${profile.dcfInputs.terminalCapRatePct}%` : 'Pending'} /></Section>
      {isIndustrial && <Section title="Industrial Metrics Summary"><Row label="GLA" value={profile.propertyValuation.lettableArea ? `${profile.propertyValuation.lettableArea} m²` : 'Unknown'} /><Row label="Site area" value={profile.propertyValuation.landArea ? `${profile.propertyValuation.landArea} m²` : 'Unknown'} /><Row label="Site cover" value={profile.propertyValuation.siteCoverageRatio ? pct(profile.propertyValuation.siteCoverageRatio) : 'Unknown'} /><Row label="Industrial usability" value={title(borrowing?.riskRating)} /></Section>}
      <Section title="Risk Summary"><p className="text-sm text-muted-foreground">{borrowing?.primaryReason ?? 'Run borrowing capacity to generate risk commentary.'}</p>{borrowing?.warnings.slice(0, 5).map((w, i) => <div key={i} className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">{w}</div>)}</Section>
      <Section title="Fix the Deal"><p className="text-sm text-muted-foreground">{borrowing?.commentarySections.fixTheDealSummary ?? 'No fix-the-deal strategy generated yet.'}</p><Row label="Required NOI" value={borrowing?.reverseCalculators.requiredNoiForProposedLoan} /><Row label="Required rent increase" value={borrowing?.reverseCalculators.requiredRentIncrease} /></Section>
      <Section title="Required Documents"><div className="grid sm:grid-cols-2 gap-2">{(docs?.slice(0, 10) ?? borrowing?.documentChecklist?.slice(0, 10) ?? []).map((d: any, i: number) => <div key={i} className="rounded border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">{typeof d === 'string' ? d : d.documentName ?? d.name}</div>)}</div></Section>
      <Section title="Report Actions"><div className="flex flex-wrap gap-2"><Button size="sm"><FileText className="h-4 w-4 mr-1" />Generate Client Report</Button><Button size="sm" variant="outline"><FileWarning className="h-4 w-4 mr-1" />Review Missing Data ({unknowns.length})</Button><Button size="sm" variant="outline"><Sparkles className="h-4 w-4 mr-1" />Review AI Estimates ({aiFields.length})</Button><Button size="sm" variant="outline">Save Back to Property</Button><Button size="sm" variant="outline">Export Summary</Button><Button size="sm" variant="outline"><UploadCloud className="h-4 w-4 mr-1" />Push to Client Portal</Button></div><Separator /><p className="text-xs text-muted-foreground">Report payload ready with {reportPayload.sections.length} sections, including verified values, manual estimates, AI estimates, unknown assumptions and specialist review items.</p></Section>
    </div>
  </div>;
}
