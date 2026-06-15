import { useState, type ReactNode } from 'react';
import { FileText, FileWarning, Sparkles, UploadCloud, Save, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import { buildCommercialIndustrialReportPayload } from '@/utils/commercial/reportPayloadBuilder';
import { buildScenarioReportPayload } from '@/utils/commercial/scenarioReportBuilder';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';

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

function downloadFile(name: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CommercialIndustrialOverviewCard() {
  const profile = useCommercialDealState(s => s.profile);
  const updateGlobal = useCommercialDealState(s => s.updateGlobal);
  const borrowing = profile.borrowingOutputs;
  const reportPayload = buildCommercialIndustrialReportPayload(profile);
  const isIndustrial = profile.dealProfile.assetCategory === 'industrial';
  const docs = reportPayload.sections.find(s => s.title === 'Required Documents')?.data as any[] | undefined;
  const aiFields = Object.values(profile.aiEstimateMetadata).filter(e => e.confidenceTag === 'AI Estimate');
  const unknowns = Object.values(profile.assumptions).filter(a => a.confidenceTag === 'Unknown' || a.confidenceTag === 'Specialist Review Required');
  const tenYear = profile.tenYearCashFlowOutputs;
  const clientScenario = profile.clientScenarioOutputs;

  const { prefill, property, pushBack } = useCalculatorPrefill();
  const [showMissing, setShowMissing] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [busy, setBusy] = useState<null | 'report' | 'export' | 'save' | 'push'>(null);

  const fileSlug = (prefill?.address || profile.dealProfile.assetCategory || 'commercial-deal').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);

  const handleGenerateReport = () => {
    setBusy('report');
    try {
      downloadFile(`${fileSlug}-client-report.json`, JSON.stringify(reportPayload, null, 2));
      toast.success(`Client report payload generated (${reportPayload.sections.length} sections).`);
    } catch (e: any) {
      toast.error(`Report generation failed: ${e.message ?? e}`);
    } finally { setBusy(null); }
  };

  const handleExportSummary = () => {
    setBusy('export');
    try {
      const summary = {
        generatedAt: reportPayload.generatedAt,
        transactionSummary: reportPayload.transactionSummary,
        borrowingOutcome: reportPayload.borrowingOutcome,
        purchaseAbility: reportPayload.purchaseAbility,
        assumptions: reportPayload.assumptions,
      };
      downloadFile(`${fileSlug}-summary.json`, JSON.stringify(summary, null, 2));
      toast.success('Summary exported.');
    } finally { setBusy(null); }
  };

  const handleSaveBack = async () => {
    if (!property) { toast.error('Select a property first to save back.'); return; }
    setBusy('save');
    try {
      const patch: Record<string, unknown> = {};
      const purchase = profile.propertyValuation.purchasePrice;
      const valuation = borrowing?.propertyValueUsedForLvr ?? profile.propertyValuation.estimatedMarketValue;
      if (purchase) patch.purchase_price = purchase;
      if (valuation) {
        // commercial uses `valuation`, industrial uses `current_valuation`
        if (prefill?.domain === 'industrial') patch.current_valuation = valuation;
        else patch.valuation = valuation;
      }
      if (Object.keys(patch).length === 0) {
        toast.message('No calculator-derived values to save back yet.');
      } else {
        await pushBack(patch);
      }
    } finally { setBusy(null); }
  };


  const handleSaveScenarioStatus = (status: 'Draft' | 'Recommended' | 'Committed') => {
    if (!clientScenario) { toast.error('Run or select a client scenario before saving.'); return; }
    if (status === 'Committed' && !confirm('Commit this scenario to the client profile current position? Draft and Recommended scenarios will not overwrite current position.')) return;
    const nextScenario = {
      ...clientScenario,
      status,
      auditLog: [...clientScenario.auditLog, {
        timestamp: new Date().toISOString(),
        user: 'Calculator user',
        action: status === 'Committed' ? 'scenario_commit' : 'scenario_status_change',
        field: 'status',
        previousValue: clientScenario.status,
        newValue: status,
        source: 'Overview tab action',
        scenarioId: clientScenario.scenarioId,
      }],
    };
    updateGlobal('clientScenarioOutputs', nextScenario as any);
    toast.success(status === 'Committed' ? 'Scenario committed with audit trail.' : `Scenario saved as ${status}.`);
  };

  const handleExportScenarioReport = () => {
    if (!clientScenario) { toast.error('No client scenario is available to export.'); return; }
    downloadFile(`${fileSlug}-scenario-report.json`, JSON.stringify(buildScenarioReportPayload(clientScenario), null, 2));
    toast.success('Scenario report exported.');
  };

  const handleClientFacingSummary = () => {
    if (!clientScenario) { toast.error('No client scenario is available to summarise.'); return; }
    const report = buildScenarioReportPayload(clientScenario) as any;
    downloadFile(`${fileSlug}-client-facing-scenario-summary.json`, JSON.stringify({ generatedAt: report.generatedAt, scenario: report.scenario, summary: clientScenario.reportSummary, recommendedNextSteps: report.narrative.recommendedNextSteps, requiredDocuments: clientScenario.requiredDocuments, warnings: clientScenario.warnings }, null, 2));
    toast.success('Client-facing summary generated.');
  };

  const handlePushToPortal = () => {
    setBusy('push');
    try {
      // Stash payload so a future portal-sync surface can pick it up; until the
      // shared-portal edge function ships, give the operator a clear receipt.
      const key = `commercial-portal-pending:${prefill?.propertyId ?? 'unlinked'}`;
      sessionStorage.setItem(key, JSON.stringify(reportPayload));
      toast.success('Report queued for client portal sync.', {
        description: prefill?.propertyId ? `Linked to property ${prefill.address}` : 'No property linked — queued under "unlinked".',
      });
    } finally { setBusy(null); }
  };

  const ReportActions = (
    <Card className="border-primary/40 bg-card/95 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Report Actions</CardTitle>
        <CardDescription>Generate, review and distribute the commercial / industrial deal report.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleGenerateReport} disabled={busy === 'report'}>
            {busy === 'report' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Generate Client Report
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowMissing(true)}>
            <FileWarning className="h-4 w-4 mr-1" /> Review Missing Data ({unknowns.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAi(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> Review AI Estimates ({aiFields.length})
          </Button>
          <Button size="sm" variant="outline" onClick={handleSaveBack} disabled={!property || busy === 'save'}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save Back to Property
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportSummary} disabled={busy === 'export'}>
            <Download className="h-4 w-4 mr-1" /> Export Summary
          </Button>
          <Button size="sm" variant="outline" onClick={handlePushToPortal} disabled={busy === 'push'}>
            <UploadCloud className="h-4 w-4 mr-1" /> Push to Client Portal
          </Button>
        </div>
        <Separator />
        <p className="text-xs text-muted-foreground">
          Report payload ready with {reportPayload.sections.length} sections, including verified values, manual estimates, AI estimates, unknown assumptions and specialist review items.
          {!property && ' Link a property via ?propertyId= to enable Save Back.'}
        </p>
      </CardContent>
    </Card>
  );

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

    {ReportActions}

    <div className="grid lg:grid-cols-2 gap-4">
      <Section title="Transaction Snapshot"><Row label="State / territory" value={profile.dealProfile.state} /><Row label="Lease status" value={title(profile.dealProfile.leaseStatus)} /><Row label="Data source mode" value="Global Sync On" /></Section>
      <Section title="Borrowing Outcome"><Row label="Maximum loan" value={borrowing?.finalRiskAdjustedLoan} /><Row label="LVR cap" value={borrowing?.componentCaps.lvrCap} /><Row label="ICR cap" value={borrowing?.componentCaps.icrCap} /><Row label="Debt-yield cap" value={borrowing?.componentCaps.debtYieldCap} /></Section>
      <Section title="Purchase Ability"><Row label="Total acquisition costs" value={borrowing?.fundsToComplete.totalAcquisitionCosts} /><Row label="Total cost base" value={borrowing?.fundsToComplete.totalCostBase} /><Row label="Liquidity months" value={borrowing?.fundsToComplete.monthsDebtServiceCovered == null ? 'N/A — equity shortfall exists before liquidity reserve can be assessed.' : `${borrowing.fundsToComplete.monthsDebtServiceCovered.toFixed(1)} months`} /></Section>
      <Section title="Income / NOI Summary"><Row label="Actual NOI" value={borrowing?.noi.actualNoi ?? profile.noiOutputs?.actualNoi} /><Row label="Stabilised NOI" value={borrowing?.noi.stabilisedNoi} /><Row label="Lender-adjusted NOI" value={borrowing?.noi.lenderAdjustedNoi} /></Section>
      <Section title="Valuation / Cap Rate Summary"><Row label="Estimated market value" value={profile.propertyValuation.estimatedMarketValue} /><Row label="Valuation confidence" value={title(profile.propertyValuation.valuationConfidence)} /><Row label="Cap rate output" value={(profile.capRateOutputs as any)?.capitalisationRate ? pct((profile.capRateOutputs as any).capitalisationRate) : 'Pending'} /></Section>
      <Section title="ICR / DSCR / Debt Yield Summary"><Row label="ICR" value={borrowing ? `${borrowing.icr.toFixed(2)}x` : 'Pending'} /><Row label="DSCR" value={borrowing ? `${borrowing.dscr.toFixed(2)}x` : 'Pending'} /><Row label="Debt yield" value={pct(borrowing?.debtYield)} /></Section>
      <Section title="GST Summary"><Row label="GST treatment" value={title(profile.acquisitionCosts.gstTreatment ?? profile.gstInputs.treatment)} /><Row label="Settlement cashflow" value={borrowing?.fundsToComplete.gstCashflowRequirement} /><Row label="Economic cost" value={borrowing?.fundsToComplete.gst.economicCost} /></Section>
      <Section title="DCF Summary"><Row label="Hold period" value={profile.dcfInputs.holdPeriodYears ? `${profile.dcfInputs.holdPeriodYears} years` : 'Pending'} /><Row label="Rental growth" value={profile.dcfInputs.rentalGrowthPct ? `${profile.dcfInputs.rentalGrowthPct}%` : 'Pending'} /><Row label="Exit cap" value={profile.dcfInputs.terminalCapRatePct ? `${profile.dcfInputs.terminalCapRatePct}%` : 'Pending'} /></Section>
      <Section title="Client Scenario Summary"><Row label="Selected client" value={clientScenario?.clientId} /><Row label="Scenario name" value={clientScenario?.scenarioName} /><Row label="Scenario type" value={clientScenario?.scenarioType} /><Row label="Scenario status" value={clientScenario?.status} /><Row label="Borrowing capacity movement" value={clientScenario ? clientScenario.resultingPosition.borrowingCapacity - clientScenario.currentPositionSnapshot.borrowingCapacity : undefined} /><Row label="Purchase ability" value={borrowing?.purchaseAbilityStatusLabel} /><Row label="Key constraint" value={clientScenario?.resultingPosition.keyConstraint} /><Row label="Risk rating" value={clientScenario?.resultingPosition.riskRating} /><Row label="Recommended next action" value={borrowing?.requiredNextAction} /><div className="flex flex-wrap gap-2 pt-2"><Button size="sm" variant="outline" onClick={() => handleSaveScenarioStatus('Draft')}>Save Scenario</Button><Button size="sm" variant="outline" onClick={() => handleSaveScenarioStatus('Recommended')}>Mark as Recommended</Button><Button size="sm" variant="outline" onClick={() => handleSaveScenarioStatus('Committed')}>Commit to Client Profile</Button><Button size="sm" variant="outline" onClick={handleExportScenarioReport}>Export Scenario Report</Button><Button size="sm" variant="outline" onClick={handleClientFacingSummary}>Generate Client-Facing Summary</Button></div></Section>
      <Section title="10-Year Cash Flow Summary"><Row label="Cash flow mode" value={title(tenYear?.summary.mode)} /><Row label="Year 1 pre-tax cashflow" value={tenYear?.summary.year1PreTaxCashflow} /><Row label="Year 1 after-tax cashflow" value={tenYear?.summary.year1AfterTaxCashflow} /><Row label="Year 10 property value" value={tenYear?.summary.year10PropertyValue} /><Row label="Year 10 loan balance" value={tenYear?.summary.year10LoanBalance} /><Row label="Year 10 equity" value={tenYear?.summary.year10Equity} /><Row label="Cumulative cashflow" value={tenYear?.summary.cumulativeAfterTaxCashflow} /><Row label="Levered IRR" value={tenYear?.summary.leveredIrr == null ? 'N/A' : `${(tenYear.summary.leveredIrr * 100).toFixed(1)}%`} /><Row label="Equity multiple" value={tenYear?.summary.equityMultiple == null ? 'N/A' : `${tenYear.summary.equityMultiple.toFixed(2)}x`} /><Row label="Business DSCR" value={tenYear?.summary.businessDscr == null ? 'N/A' : `${tenYear.summary.businessDscr.toFixed(2)}x`} /><Row label="Occupancy cost ratio" value={tenYear?.summary.occupancyCostRatio == null ? 'N/A' : `${(tenYear.summary.occupancyCostRatio * 100).toFixed(1)}%`} />{tenYear?.warnings.slice(0, 4).map((w, i) => <div key={i} className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">{w}</div>)}</Section>
      {isIndustrial && <Section title="Industrial Metrics Summary"><Row label="GLA" value={profile.propertyValuation.lettableArea ? `${profile.propertyValuation.lettableArea} m²` : 'Unknown'} /><Row label="Site area" value={profile.propertyValuation.landArea ? `${profile.propertyValuation.landArea} m²` : 'Unknown'} /><Row label="Site cover" value={profile.propertyValuation.siteCoverageRatio ? pct(profile.propertyValuation.siteCoverageRatio) : 'Unknown'} /><Row label="Industrial usability" value={title(borrowing?.riskRating)} /></Section>}
      <Section title="Risk Summary"><p className="text-sm text-muted-foreground">{borrowing?.primaryReason ?? 'Run borrowing capacity to generate risk commentary.'}</p>{borrowing?.warnings.slice(0, 5).map((w, i) => <div key={i} className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">{w}</div>)}</Section>
      <Section title="Fix the Deal"><p className="text-sm text-muted-foreground">{borrowing?.commentarySections.fixTheDealSummary ?? 'No fix-the-deal strategy generated yet.'}</p><Row label="Required NOI" value={borrowing?.reverseCalculators.requiredNoiForProposedLoan} /><Row label="Required rent increase" value={borrowing?.reverseCalculators.requiredRentIncrease} /></Section>
      <Section title="Required Documents"><div className="grid sm:grid-cols-2 gap-2">{(docs?.slice(0, 10) ?? borrowing?.documentChecklist?.slice(0, 10) ?? []).map((d: any, i: number) => <div key={i} className="rounded border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">{typeof d === 'string' ? d : d.documentName ?? d.name}</div>)}</div></Section>
    </div>

    <Dialog open={showMissing} onOpenChange={setShowMissing}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Missing Data & Specialist Review Items</DialogTitle>
          <DialogDescription>{unknowns.length} field(s) require operator input or specialist confirmation.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-2">
            {unknowns.length === 0 ? <p className="text-sm text-muted-foreground">No outstanding unknowns. All assumptions are verified or manually estimated.</p> :
              unknowns.map((u, i) => (
                <div key={i} className="rounded border bg-muted/10 px-3 py-2 text-sm">
                  <div className="font-medium">{u.fieldKey}</div>
                  <div className="text-xs text-muted-foreground">Tag: {u.confidenceTag}{(u as any).rationale ? ` • ${(u as any).rationale}` : ''}</div>
                </div>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    <Dialog open={showAi} onOpenChange={setShowAi}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Estimated Fields</DialogTitle>
          <DialogDescription>{aiFields.length} field(s) were filled by AI estimates. Review and confirm before client delivery.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-2">
            {aiFields.length === 0 ? <p className="text-sm text-muted-foreground">No AI-estimated fields in this deal.</p> :
              aiFields.map((a: any, i) => (
                <div key={i} className="rounded border bg-muted/10 px-3 py-2 text-sm">
                  <div className="font-medium">{a.fieldKey}</div>
                  <div className="text-xs text-muted-foreground">Confidence: {a.confidenceTag}{a.rationale ? ` • ${a.rationale}` : ''}</div>
                </div>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </div>;
}
