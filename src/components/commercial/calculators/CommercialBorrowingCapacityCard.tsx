import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Building2, Check, ChevronsUpDown, Circle, CheckCircle2, Factory, FileCheck2, Link2, Search, ShieldAlert, Sparkles, UserRound, GitBranch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCommercialDealState } from '@/utils/commercial/commercialDealState';
import { buildGlobalSyncLabel } from '@/utils/commercial/calculatorDataSync';
import { calculateCommercialIndustrialBorrowing, lenderPolicyProfiles, type AcquisitionPurpose, type AssetCategory, type BorrowingInputs, type LenderPolicyProfileKey, type LeaseStatus, type PurchaserStructure } from '@/utils/commercial';
import { useApplyPrefill } from '@/contexts/CalculatorPrefillContext';
import { SaveBackButton } from '@/components/commercial/SaveBackButton';
import { sampleClientProfiles, summarizeClientPortfolio } from '@/utils/commercial/clientPortfolioEngine';
import { fetchClientProfile, persistClientScenario, persistCommittedScenarioAssessment, searchClientProfiles, type ClientProfileOption } from '@/utils/commercial/clientPortfolioRepository';
import { buildClientScenario, type ProposedScenarioInputs } from '@/utils/commercial/scenarioModellingEngine';
import { comparePortfolioScenario } from '@/utils/commercial/scenarioComparisonEngine';
import { buildScenarioReportPayload } from '@/utils/commercial/scenarioReportBuilder';
import { CommercialBCScenarioAgent, type CommercialScenarioProposal } from '@/components/commercial/calculators/CommercialBCScenarioAgent';
import { applyCommercialScenarioProposal } from '@/utils/commercial/scenarioApplyEngine';
import { toast } from 'sonner';
import type { ClientProfile, ClientScenario, ScenarioStatus, ScenarioType } from '@/utils/commercial/clientPortfolioTypes';


const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${((n || 0) * 100).toFixed(1)}%`;
const num = (v: string) => (v === '' ? 0 : Number(v));
const set = (setter: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => setter(e.target.value);
const badgeVariant = (r: string) => (r === 'green' ? 'default' : r === 'amber' ? 'secondary' : 'destructive');
const title = (v: string) => v.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

const commercialSubtypes = ['Office', 'Retail', 'Medical', 'Childcare', 'Showroom', 'Hospitality', 'Mixed-use commercial', 'Other commercial'];
const industrialSubtypes = ['Warehouse', 'Factory', 'Logistics facility', 'Cold storage', 'Workshop', 'Storage yard', 'Manufacturing facility', 'Last-mile facility', 'Other industrial'];

function MoneyRow({ label, value, emph }: { label: string; value: number | string; emph?: boolean }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={emph ? 'font-semibold text-primary' : 'font-medium'}>{typeof value === 'number' ? fmt(value) : value}</span></div>;
}

function StatusIcon({ status = 'Manual Estimate' }: { status?: string }) {
  if (status === 'Verified') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Verified" />;
  if (status === 'Client Profile Source') return <Link2 className="h-3.5 w-3.5 text-primary" aria-label="Client Profile Source" />;
  if (status === 'AI Estimate') return <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-label="AI Estimate" />;
  if (status === 'Overridden') return <GitBranch className="h-3.5 w-3.5 text-sky-300" aria-label="Overridden" />;
  if (status === 'Specialist Review Required') return <ShieldAlert className="h-3.5 w-3.5 text-red-400" aria-label="Specialist Review Required" />;
  if (status === 'Unknown') return <AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-label="Unknown" />;
  return <Circle className="h-2.5 w-2.5 text-muted-foreground" aria-label="Manual Estimate" />;
}
function Field({ label, value, onChange, step = '1', status = 'Manual Estimate' }: { label: string; value: string; onChange: (v: string) => void; step?: string; status?: string }) {
  return <div><Label className="flex items-center gap-1.5">{label}<StatusIcon status={status} /></Label><Input type="number" step={step} value={value} onChange={set(onChange)} /></div>;
}

function SelectField({ label, value, onChange, options, status = 'Manual Estimate' }: { label: string; value: string; onChange: (v: any) => void; options: Array<{ value: string; label: string }>; status?: string }) {
  return <div><Label className="flex items-center gap-1.5">{label}<StatusIcon status={status} /></Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>;
}

export function CommercialBorrowingCapacityCard({ initialAssetCategory = 'commercial' }: { initialAssetCategory?: AssetCategory }) {
  const updateGlobal = useCommercialDealState(s => s.updateGlobal);
  const sourceMode = useCommercialDealState(s => s.sourceModes.borrowing);
  const [assetCategory, setAssetCategory] = useState<AssetCategory>(initialAssetCategory);
  const [assetSubtype, setAssetSubtype] = useState(initialAssetCategory === 'industrial' ? 'Warehouse' : 'Office');
  const [purpose, setPurpose] = useState<AcquisitionPurpose>('investment');
  const [leaseStatus, setLeaseStatus] = useState<LeaseStatus>('fullyLeased');
  const [state, setState] = useState<'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT'>('NSW');
  const [proposedLoan, setProposedLoan] = useState('');
  const [purchaserType, setPurchaserType] = useState<PurchaserStructure>('company');
  const [entityName, setEntityName] = useState('Acquisition SPV Pty Ltd');
  const [guarantees, setGuarantees] = useState<'yes' | 'no' | 'unknown'>('yes');
  const [gstRegistered, setGstRegistered] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [relatedPartyTenant, setRelatedPartyTenant] = useState<'yes' | 'no'>('no');
  const [availableEquity, setAvailableEquity] = useState('1100000');
  const [sponsorLiquidity, setSponsorLiquidity] = useState('500000');
  const [liquidityMult, setLiquidityMult] = useState('0');
  const [businessDebt, setBusinessDebt] = useState('0');
  const [businessEbitda, setBusinessEbitda] = useState('0');
  const [currentRent, setCurrentRent] = useState('0');
  const [proposedRent, setProposedRent] = useState('0');
  const [smsfBalance, setSmsfBalance] = useState('0');

  const [purchasePrice, setPurchasePrice] = useState('3500000');
  const [estimatedValue, setEstimatedValue] = useState('3500000');
  const [bankValue, setBankValue] = useState('');
  const [conservativeValue, setConservativeValue] = useState<'yes' | 'no'>('yes');
  const [landArea, setLandArea] = useState('1200');
  const [buildingArea, setBuildingArea] = useState('900');
  const [lettableArea, setLettableArea] = useState('850');
  const [valuationConfidence, setValuationConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [clearance, setClearance] = useState('7.5');
  const [rollerDoors, setRollerDoors] = useState('2');
  const [truckAccess, setTruckAccess] = useState<'poor' | 'average' | 'good' | 'excellent'>('good');
  const [powerCapacity, setPowerCapacity] = useState<'unknown' | 'singlePhase' | 'threePhase' | 'highCapacity' | 'substationPresent'>('unknown');
  const [slabCondition, setSlabCondition] = useState<'unknown' | 'good' | 'average' | 'poor'>('good');
  const [roofCondition, setRoofCondition] = useState<'unknown' | 'good' | 'average' | 'poor'>('good');

  const [passingRent, setPassingRent] = useState('250000');
  const [otherIncome, setOtherIncome] = useState('0');
  const [recoveries, setRecoveries] = useState('45000');
  const [marketRent, setMarketRent] = useState('250000');
  const [vacancy, setVacancy] = useState('3');
  const [incentives, setIncentives] = useState('0');
  const [arrearsAdj, setArrearsAdj] = useState('0');
  const [nonRecoverable, setNonRecoverable] = useState('15000');
  const [rates, setRates] = useState('12000');
  const [water, setWater] = useState('2500');
  const [landTax, setLandTax] = useState('8000');
  const [insurance, setInsurance] = useState('6000');
  const [management, setManagement] = useState('7000');
  const [repairs, setRepairs] = useState('5000');
  const [wale, setWale] = useState('3.5');
  const [tenantCovenant, setTenantCovenant] = useState<'government' | 'nationalTenant' | 'listedCompany' | 'establishedSme' | 'newBusiness' | 'relatedParty' | 'weakUnknown'>('establishedSme');
  const [rentOverMarket, setRentOverMarket] = useState<'yes' | 'no' | 'unknown'>('no');
  const [aboveMarketPct, setAboveMarketPct] = useState('0');
  const [noiBasis, setNoiBasis] = useState<'actual' | 'stabilised' | 'lenderAdjusted'>('lenderAdjusted');

  const [stampDuty, setStampDuty] = useState('175000');
  const [transferRegistrationFee, setTransferRegistrationFee] = useState('180');
  const [mortgageRegistrationFee, setMortgageRegistrationFee] = useState('180');
  const [pexaSettlementFee, setPexaSettlementFee] = useState('150');
  const [autoEstimatedAcquisitionCosts, setAutoEstimatedAcquisitionCosts] = useState('0');
  const [legal, setLegal] = useState('12000');
  const [bankLegal, setBankLegal] = useState('8000');
  const [valuationFee, setValuationFee] = useState('6000');
  const [dueDiligence, setDueDiligence] = useState('10000');
  const [environmentalCost, setEnvironmentalCost] = useState('0');
  const [asbestosCost, setAsbestosCost] = useState('0');
  const [capexReserve, setCapexReserve] = useState('50000');
  const [workingCapital, setWorkingCapital] = useState('25000');
  const [otherCosts, setOtherCosts] = useState('0');
  const [gstTreatment, setGstTreatment] = useState<'gstInclusive' | 'plusGst' | 'gstFreeGoingConcern' | 'marginScheme' | 'unknown'>('unknown');
  const [gstCashflow, setGstCashflow] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [gstClaimable, setGstClaimable] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [goingConcernConfirmed, setGoingConcernConfirmed] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [landholderAcquisition, setLandholderAcquisition] = useState<'yes' | 'no' | 'unknown'>('no');

  const [profile, setProfile] = useState<LenderPolicyProfileKey>('mainstreamCommercialBank');
  const [rate, setRate] = useState('7.25');
  const [buffer, setBuffer] = useState('1.00');
  const [floorRate, setFloorRate] = useState('0');
  const [assessmentBasis, setAssessmentBasis] = useState<'contractPlusBuffer' | 'higherOfBufferAndFloor' | 'interestOnlyAssessment' | 'principalAndInterestAssessment' | 'custom'>('contractPlusBuffer');
  const [term, setTerm] = useState('25');
  const [ioPeriod, setIoPeriod] = useState('0');
  const [amortisation, setAmortisation] = useState('25');
  const [maxLvr, setMaxLvr] = useState('0.65');
  const [minIcr, setMinIcr] = useState('1.50');
  const [minDscr, setMinDscr] = useState('1.25');
  const [minDebtYield, setMinDebtYield] = useState('0.09');

  const [tenantStrength, setTenantStrength] = useState<'strong' | 'established' | 'weak' | 'unknown'>('established');
  const [vacancyLevel, setVacancyLevel] = useState<'none' | 'minor' | 'major'>('minor');
  const [buildingCondition, setBuildingCondition] = useState<'good' | 'average' | 'poor'>('good');
  const [zoning, setZoning] = useState<'clear' | 'uncertain' | 'notPermitted'>('clear');
  const [leaseDocs, setLeaseDocs] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [environmentalRisk, setEnvironmentalRisk] = useState<'low' | 'unknown' | 'present' | 'knownContamination'>('unknown');
  const [asbestosRisk, setAsbestosRisk] = useState<'low' | 'unknown' | 'likely' | 'confirmed'>('unknown');
  const [capexRequired, setCapexRequired] = useState<'none' | 'some' | 'heavy'>('some');
  const [selectedClientId, setSelectedClientId] = useState('client-001');
  const [scenarioName, setScenarioName] = useState('Proposed commercial / industrial acquisition');
  const [scenarioType, setScenarioType] = useState<ScenarioType>('Acquire Commercial Asset');
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>('Draft');
  const [savedScenario, setSavedScenario] = useState<ClientScenario | null>(null);
  const [assessmentMode, setAssessmentMode] = useState<'propertyOnly' | 'clientScenario'>('propertyOnly');
  const [includeResidential, setIncludeResidential] = useState(true);
  const [includeCommercial, setIncludeCommercial] = useState(true);
  const [includeIndustrial, setIncludeIndustrial] = useState(true);
  const [includeShares, setIncludeShares] = useState(true);
  const [includeCash, setIncludeCash] = useState(true);
  const [includeBusinessFinancials, setIncludeBusinessFinancials] = useState(true);
  const [includeLiabilities, setIncludeLiabilities] = useState(true);
  const [includeIncome, setIncludeIncome] = useState(true);
  const [profileImported, setProfileImported] = useState(false);
  const [clientOptions, setClientOptions] = useState<ClientProfileOption[]>(sampleClientProfiles.map(c => ({ clientId: c.clientId, clientName: c.clientName, source: 'sample' as const })));
  const [selectedClientProfile, setSelectedClientProfile] = useState<ClientProfile>(sampleClientProfiles[0]);
  const [clientLoading, setClientLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Client profile data has not been imported yet.');
  const [pendingImportOpen, setPendingImportOpen] = useState(false);
  const [lastPersistedScenarioId, setLastPersistedScenarioId] = useState<string | null>(null);

  useEffect(() => { setAssetCategory(initialAssetCategory); setAssetSubtype(initialAssetCategory === 'industrial' ? 'Warehouse' : 'Office'); }, [initialAssetCategory]);

  const showBusinessFields = ['company', 'discretionaryTrust', 'unitTrust', 'holdingCompany', 'spv', 'operatingBusiness'].includes(purchaserType) || purpose === 'ownerOccupied' || purpose === 'relatedPartyLease';

  useEffect(() => {
    let alive = true;
    searchClientProfiles().then(options => { if (alive) setClientOptions(options); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setClientLoading(true);
    fetchClientProfile(selectedClientId).then(profile => {
      if (!alive) return;
      setSelectedClientProfile(profile);
      setSyncMessage(`Loaded ${profile.clientName} from client profile source. Import to apply values to this scenario.`);
    }).catch(err => {
      if (alive) setSyncMessage(`Client profile load failed: ${err?.message || 'Unknown error'}`);
    }).finally(() => { if (alive) setClientLoading(false); });
    return () => { alive = false; };
  }, [selectedClientId]);

  useApplyPrefill((p) => {
    setAssetCategory(p.assetCategory);
    if (p.assetSubtype) setAssetSubtype(p.assetSubtype);
    if (p.state && ['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'].includes(p.state)) setState(p.state as any);
    if (p.purchasePrice != null) setPurchasePrice(String(p.purchasePrice));
    if (p.valuation != null) setEstimatedValue(String(p.valuation));
    if (p.siteAreaSqm != null) setLandArea(String(p.siteAreaSqm));
    if (p.gfaSqm != null) setBuildingArea(String(p.gfaSqm));
    if (p.nlaSqm != null) setLettableArea(String(p.nlaSqm));
    if (p.clearanceMetres != null) setClearance(String(p.clearanceMetres));
    if (p.dockDoors != null) setRollerDoors(String(p.dockDoors));
    if (p.grossPassingRentPa != null) setPassingRent(String(p.grossPassingRentPa));
    if (p.marketRentPa != null) setMarketRent(String(p.marketRentPa));
    if (p.recoveredOutgoingsPa != null) setRecoveries(String(p.recoveredOutgoingsPa));
    if (p.outgoings?.council != null) setRates(String(p.outgoings.council));
    if (p.outgoings?.water != null) setWater(String(p.outgoings.water));
    if (p.outgoings?.land_tax != null) setLandTax(String(p.outgoings.land_tax));
    if (p.outgoings?.insurance != null) setInsurance(String(p.outgoings.insurance));
    if (p.outgoings?.management != null) setManagement(String(p.outgoings.management));
    if (p.outgoings?.repairs_maintenance != null) setRepairs(String(p.outgoings.repairs_maintenance));
    if (p.gstTreatment) {
      const map: Record<string, typeof gstTreatment> = { going_concern: 'gstFreeGoingConcern', margin_scheme: 'marginScheme', standard: 'gstInclusive', input_taxed: 'unknown' };
      const v = map[p.gstTreatment]; if (v) setGstTreatment(v);
    }
  });

  const result = useMemo(() => {
    const inputs: BorrowingInputs = {
      dealProfile: { assetCategory, assetSubtype, acquisitionPurpose: purpose, leaseStatus, state, proposedLoan: proposedLoan ? num(proposedLoan) : undefined },
      purchaserStructure: { purchaserType, borrowerEntityName: entityName, corporateTrustee: purchaserType.includes('Trust') ? 'yes' : 'notApplicable', guaranteesAvailable: guarantees, relatedPartyTenant: relatedPartyTenant === 'yes', gstRegistered, availableCashEquity: num(availableEquity), sponsorLiquidity: num(sponsorLiquidity), liquidityMultiplier: num(liquidityMult), existingBusinessDebts: num(businessDebt), existingBusinessEbitda: num(businessEbitda), existingRentPaid: num(currentRent), proposedRentPayable: num(proposedRent), smsfBalance: num(smsfBalance), smsfSpecialistReviewRequired: purchaserType === 'smsf' },
      propertyValuation: { purchasePrice: num(purchasePrice), estimatedMarketValue: num(estimatedValue), bankValuation: bankValue ? num(bankValue) : undefined, useConservativeValuation: conservativeValue === 'yes', landArea: num(landArea), buildingArea: num(buildingArea), lettableArea: num(lettableArea), valuationConfidence, clearanceHeight: num(clearance), rollerDoors: num(rollerDoors), truckAccessQuality: truckAccess, powerCapacity, slabCondition, roofCondition },
      income: { grossPassingRent: num(passingRent), otherIncome: num(otherIncome), recoveredOutgoings: num(recoveries), marketRent: num(marketRent), vacancyAllowancePct: num(vacancy), incentivesAdjustment: num(incentives), tenantArrearsAdjustment: num(arrearsAdj), nonRecoverableExpenses: num(nonRecoverable), councilRates: num(rates), water: num(water), landTax: num(landTax), insurance: num(insurance), strataOwnersCorp: 0, managementFees: num(management), repairsMaintenance: num(repairs), utilities: 0, cleaning: 0, security: 0, otherExpenses: 0, wale: num(wale), tenantCovenant, rentOverMarket, percentageAboveMarket: num(aboveMarketPct), noiBasis },
      acquisitionCosts: { depositPaid: 0, stampDuty: num(stampDuty), transferRegistrationFee: num(transferRegistrationFee), mortgageRegistrationFee: num(mortgageRegistrationFee), pexaSettlementFee: num(pexaSettlementFee), legalConveyancingFee: num(legal), bankLegalFee: num(bankLegal), valuationFee: num(valuationFee), loanApplicationFee: 0, buyersAgentFee: 0, buildingInspection: 0, pestInspection: 0, structuralInspection: assetCategory === 'industrial' ? 5000 : 0, fireComplianceInspection: 2500, planningZoningReview: 2500, environmentalReport: num(environmentalCost), asbestosReport: num(asbestosCost), dueDiligence: num(dueDiligence), capexReserve: num(capexReserve), workingCapitalReserve: num(workingCapital), otherAcquisitionCosts: num(otherCosts) + num(autoEstimatedAcquisitionCosts), gstTreatment, gstAmount: 0, gstClaimable, gstCashflowRequired: gstCashflow, goingConcernConfirmed, landholderAcquisition, vicCommercialIndustrialPropertyTax: state === 'VIC' ? 'yes' : 'no', saQualifyingNonResidentialLand: state === 'SA' ? 'yes' : 'no' },
      lendingAssumptions: { profile, contractInterestRatePct: num(rate), assessmentBufferPct: num(buffer), assessmentFloorRatePct: num(floorRate), assessmentBasis, repaymentType: assessmentBasis === 'interestOnlyAssessment' ? 'interestOnly' : 'principalAndInterest', exitStrategy: 'unknown', loanTermYears: num(term), interestOnlyPeriodYears: num(ioPeriod), amortisationYears: num(amortisation), maxLvr: num(maxLvr), minIcr: num(minIcr), minDscr: num(minDscr), minDebtYield: num(minDebtYield), debtYieldEnabled: true },
      riskInputs: { tenantStrength, vacancyLevel, buildingCondition, zoningCertainty: zoning, leaseDocumentationComplete: leaseDocs, environmentalRisk, asbestosRisk, capexRequired, rentComparedToMarket: rentOverMarket === 'yes' ? 'materiallyOver' : 'belowOrAtMarket' },
    };
    return calculateCommercialIndustrialBorrowing(inputs);
  }, [assetCategory, assetSubtype, purpose, leaseStatus, state, proposedLoan, purchaserType, entityName, guarantees, gstRegistered, relatedPartyTenant, availableEquity, sponsorLiquidity, liquidityMult, businessDebt, businessEbitda, currentRent, proposedRent, smsfBalance, purchasePrice, estimatedValue, bankValue, conservativeValue, landArea, buildingArea, lettableArea, valuationConfidence, clearance, rollerDoors, truckAccess, powerCapacity, slabCondition, roofCondition, passingRent, otherIncome, recoveries, marketRent, vacancy, incentives, arrearsAdj, nonRecoverable, rates, water, landTax, insurance, management, repairs, wale, tenantCovenant, rentOverMarket, aboveMarketPct, noiBasis, stampDuty, legal, bankLegal, valuationFee, dueDiligence, environmentalCost, asbestosCost, capexReserve, workingCapital, otherCosts, autoEstimatedAcquisitionCosts, transferRegistrationFee, mortgageRegistrationFee, pexaSettlementFee, gstTreatment, gstCashflow, gstClaimable, goingConcernConfirmed, landholderAcquisition, profile, rate, buffer, floorRate, assessmentBasis, term, ioPeriod, amortisation, maxLvr, minIcr, minDscr, minDebtYield, tenantStrength, vacancyLevel, buildingCondition, zoning, leaseDocs, environmentalRisk, asbestosRisk, capexRequired]);


  const selectedClient = selectedClientProfile;
  const currentPortfolio = useMemo(() => summarizeClientPortfolio(selectedClient), [selectedClient]);
  const scenarioInputs: ProposedScenarioInputs = useMemo(() => ({
    scenarioName,
    scenarioType,
    status: scenarioStatus,
    purchasePrice: num(purchasePrice),
    proposedDebt: result.finalRiskAdjustedLoan,
    requiredEquity: result.fundsToComplete.requiredEquity,
    annualNoi: result.noi.actualNoi,
    annualDebtService: result.annualDebtService,
    annualCashflow: result.noi.actualNoi - result.annualDebtService,
    selectedProperty: assetSubtype,
    borrowingResult: result,
  }), [scenarioName, scenarioType, scenarioStatus, purchasePrice, result, assetSubtype]);
  const activeScenario = useMemo(() => buildClientScenario(selectedClient, scenarioInputs), [selectedClient, scenarioInputs]);
  const scenarioComparison = useMemo(() => comparePortfolioScenario(activeScenario.currentPositionSnapshot, activeScenario.resultingPosition), [activeScenario]);

  const importClientProfile = () => setPendingImportOpen(true);
  const applyClientProfileImport = (mode: 'replace' | 'scenario') => {
    setAssessmentMode('clientScenario');
    if (mode === 'replace' || !availableEquity) setAvailableEquity(String(currentPortfolio.availableLiquidity));
    if (mode === 'replace' || !sponsorLiquidity) setSponsorLiquidity(String(selectedClient.cashAndOffsets.cashBalance + selectedClient.cashAndOffsets.offsetBalance));
    if (includeBusinessFinancials && selectedClient.businessFinancials.ebitdaNpbt != null && (mode === 'replace' || !num(businessEbitda))) setBusinessEbitda(String(selectedClient.businessFinancials.ebitdaNpbt));
    if (includeLiabilities && (mode === 'replace' || !num(businessDebt))) setBusinessDebt(String(selectedClient.liabilities.businessLoans + selectedClient.liabilities.equipmentFinance + selectedClient.liabilities.vehicleFinance + selectedClient.liabilities.creditCards + selectedClient.liabilities.overdrafts));
    if (includeIncome && (mode === 'replace' || !num(currentRent))) setCurrentRent(String(selectedClient.businessFinancials.existingRent));
    // Anchor commercial/industrial property data (richest matching asset) into property/income fields.
    const anchor = assetCategory === 'industrial'
      ? selectedClient.industrialAssets?.slice().sort((a: any, b: any) => (b.currentValue ?? 0) - (a.currentValue ?? 0))[0]
      : selectedClient.commercialAssets?.slice().sort((a: any, b: any) => (b.currentValue ?? 0) - (a.currentValue ?? 0))[0];
    if (anchor) {
      if (anchor.currentValue && (mode === 'replace' || !num(purchasePrice))) setPurchasePrice(String(Math.round(anchor.currentValue)));
      if (anchor.currentValue && (mode === 'replace' || !num(estimatedValue))) setEstimatedValue(String(Math.round(anchor.currentValue)));
      if (anchor.annualRent && (mode === 'replace' || !num(passingRent))) setPassingRent(String(Math.round(anchor.annualRent)));
      if (anchor.annualRent && (mode === 'replace' || !num(marketRent))) setMarketRent(String(Math.round(anchor.annualRent)));
      if ((anchor as any).gla && (mode === 'replace' || !num(lettableArea))) setLettableArea(String(Math.round((anchor as any).gla)));
      if ((anchor as any).siteArea && (mode === 'replace' || !num(landArea))) setLandArea(String(Math.round((anchor as any).siteArea)));
      if ((anchor as any).loanBalance && (mode === 'replace' || !num(proposedLoan))) setProposedLoan(String(Math.round((anchor as any).loanBalance)));
    }
    setProfileImported(true);
    setPendingImportOpen(false);
    setSyncMessage(mode === 'replace'
      ? `Replaced calculator inputs with ${selectedClient.clientName}'s portfolio${anchor ? ` (anchor asset: ${anchor.address})` : ''}.`
      : `Applied ${selectedClient.clientName}'s portfolio to blank fields only${anchor ? `; anchor asset ${anchor.address}.` : '.'}`);
  };


  const saveScenario = async (status: ScenarioStatus) => {
    const scenario = { ...activeScenario, status, auditLog: [...activeScenario.auditLog, { timestamp: new Date().toISOString(), user: 'Calculator user', action: `Scenario saved as ${status}`, source: 'Commercial / Industrial calculator', scenarioId: activeScenario.scenarioId }] };
    setScenarioStatus(status);
    setSavedScenario(scenario);
    setSyncMessage(`Saving scenario as ${status}...`);
    const saved = await persistClientScenario(scenario);
    if (!saved.ok) { setSyncMessage(`Scenario could not be persisted: ${saved.error}`); return; }
    setLastPersistedScenarioId(saved.id ?? scenario.scenarioId);
    if (status === 'Committed') {
      const committed = await persistCommittedScenarioAssessment({ ...scenario, scenarioId: saved.id ?? scenario.scenarioId, status: 'Committed' });
      setSyncMessage(committed.ok ? 'Scenario committed to client profile and latest borrowing assessment saved.' : `Scenario saved, but commit assessment failed: ${committed.error}`);
    } else {
      setSyncMessage(`Scenario saved to client profile as ${status}.`);
    }
  };

  const exportScenarioReport = () => {
    try {
      const payload = buildScenarioReportPayload(activeScenario);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (scenarioName || 'commercial-bc-scenario').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.href = url; a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Scenario report downloaded.');
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const applyAIProposal = (proposal: CommercialScenarioProposal) => {
    const changed = applyCommercialScenarioProposal(proposal, {
      setPurchasePrice, setEstimatedValue, setProposedLoan, setAvailableEquity, setSponsorLiquidity,
      setBusinessEbitda, setBusinessDebt, setCurrentRent, setProposedRent,
      setPassingRent, setMarketRent, setVacancy, setRecoveries, setRates, setWater, setLandTax, setInsurance, setManagement, setRepairs,
      setRate, setBuffer, setTerm, setIoPeriod, setAmortisation,
      setMaxLvr, setMinIcr, setMinDscr, setMinDebtYield,
      applyProfile: (k: string) => applyProfile(k as LenderPolicyProfileKey),
      setGstTreatment, setLeaseStatus, setGuarantees, setRelatedPartyTenant, setScenarioType,
    });
    setScenarioName(proposal.name);
    setAssessmentMode('clientScenario');
    setSyncMessage(`AI cascade applied (${changed.length} field${changed.length === 1 ? '' : 's'}): ${changed.join(', ') || 'no recognised fields'}.`);
  };


  const assumptionRows = [
    { field: 'Available equity', value: fmt(num(availableEquity)), status: profileImported ? 'Client Profile Source' : 'Manual Estimate', source: profileImported ? selectedClient.clientName : 'Calculator input', document: 'Bank statements / portfolio evidence' },
    { field: 'Business EBITDA / NPBT', value: num(businessEbitda) ? fmt(num(businessEbitda)) : 'Unknown', status: profileImported && num(businessEbitda) ? 'Client Profile Source' : 'Unknown', source: profileImported ? 'Client business financials' : 'Not provided', document: 'Business financial statements / tax returns' },
    { field: 'Existing liabilities', value: fmt(num(businessDebt)), status: profileImported ? 'Client Profile Source' : 'Manual Estimate', source: profileImported ? 'Client liabilities' : 'Calculator input', document: 'Loan statements / debt schedule' },
    { field: 'Purchase price', value: fmt(num(purchasePrice)), status: 'Manual Estimate', source: 'Calculator input', document: 'Contract of sale' },
    { field: 'GST treatment', value: title(gstTreatment), status: gstTreatment === 'unknown' ? 'Specialist Review Required' : 'Manual Estimate', source: 'Calculator input', document: 'GST treatment confirmation' },
    { field: 'Lease documents', value: title(leaseDocs), status: leaseDocs === 'yes' ? 'Verified' : leaseDocs === 'unknown' ? 'Unknown' : 'Specialist Review Required', source: 'Calculator input', document: 'Lease agreement / rent ledger' },
  ];
  useEffect(() => { updateGlobal('clientScenarioOutputs', activeScenario as any); }, [activeScenario, updateGlobal]);

  const scenarioRows = [
    ['Total asset value', currentPortfolio.totalAssetValue, scenarioComparison.proposed.totalAssetValue, scenarioComparison.difference.totalAssetValue],
    ['Total debt', currentPortfolio.totalDebt, scenarioComparison.proposed.totalDebt, scenarioComparison.difference.totalDebt],
    ['Net equity', currentPortfolio.netEquity, scenarioComparison.proposed.netEquity, scenarioComparison.difference.netEquity],
    ['Weighted LVR', currentPortfolio.weightedLvr, scenarioComparison.proposed.weightedLvr, scenarioComparison.difference.weightedLvr, 'pct'],
    ['Annual NOI', currentPortfolio.annualNoi, scenarioComparison.proposed.annualNoi, scenarioComparison.difference.annualNoi],
    ['Annual debt service', currentPortfolio.annualDebtService, scenarioComparison.proposed.annualDebtService, scenarioComparison.difference.annualDebtService],
    ['Portfolio DSCR', currentPortfolio.portfolioDscr, scenarioComparison.proposed.portfolioDscr, scenarioComparison.difference.portfolioDscr, 'ratio'],
    ['Available liquidity', currentPortfolio.availableLiquidity, scenarioComparison.proposed.availableLiquidity, scenarioComparison.difference.availableLiquidity],
    ['Post-settlement liquidity', currentPortfolio.postSettlementLiquidity, scenarioComparison.proposed.postSettlementLiquidity, scenarioComparison.difference.postSettlementLiquidity],
    ['Borrowing capacity', currentPortfolio.borrowingCapacity, scenarioComparison.proposed.borrowingCapacity, scenarioComparison.difference.borrowingCapacity],
  ];
  const formatScenarioValue = (value: any, kind?: string) => value == null ? 'N/A' : kind === 'pct' ? pct(value) : kind === 'ratio' ? `${Number(value).toFixed(2)}x` : fmt(Number(value));


  useEffect(() => {
    updateGlobal('dealProfile', { assetCategory, assetSubtype, acquisitionPurpose: purpose, leaseStatus, state, proposedLoan: proposedLoan ? num(proposedLoan) : undefined });
    updateGlobal('purchaserStructure', { purchaserType, borrowerEntityName: entityName, guaranteesAvailable: guarantees, relatedPartyTenant: relatedPartyTenant === 'yes', gstRegistered, availableCashEquity: num(availableEquity), sponsorLiquidity: num(sponsorLiquidity), liquidityMultiplier: num(liquidityMult), existingBusinessDebts: num(businessDebt), existingBusinessEbitda: num(businessEbitda) });
    updateGlobal('propertyValuation', { purchasePrice: num(purchasePrice), estimatedMarketValue: num(estimatedValue), bankValuation: bankValue ? num(bankValue) : undefined, useConservativeValuation: conservativeValue === 'yes', landArea: num(landArea), buildingArea: num(buildingArea), lettableArea: num(lettableArea), valuationConfidence, clearanceHeight: num(clearance), rollerDoors: num(rollerDoors), truckAccessQuality: truckAccess, powerCapacity, slabCondition, roofCondition, siteCoverageRatio: num(landArea) > 0 ? num(buildingArea) / num(landArea) : undefined });
    updateGlobal('leaseIncome', { grossPassingRent: num(passingRent), otherIncome: num(otherIncome), recoveredOutgoings: num(recoveries), marketRent: num(marketRent), vacancyAllowancePct: num(vacancy) });
    updateGlobal('lendingAssumptions', { profile, contractInterestRatePct: num(rate), assessmentBufferPct: num(buffer), assessmentFloorRatePct: num(floorRate), loanTermYears: num(term), interestOnlyPeriodYears: num(ioPeriod), amortisationYears: num(amortisation), maxLvr: num(maxLvr), minIcr: num(minIcr), minDscr: num(minDscr), minDebtYield: num(minDebtYield), debtYieldEnabled: true });
    updateGlobal('acquisitionCosts', { stampDuty: num(stampDuty), transferRegistrationFee: num(transferRegistrationFee), mortgageRegistrationFee: num(mortgageRegistrationFee), pexaSettlementFee: num(pexaSettlementFee), legalConveyancingFee: num(legal), bankLegalFee: num(bankLegal), valuationFee: num(valuationFee), dueDiligence: num(dueDiligence), capexReserve: num(capexReserve), workingCapitalReserve: num(workingCapital), otherAcquisitionCosts: num(otherCosts) + num(autoEstimatedAcquisitionCosts), gstTreatment });
    updateGlobal('fundsToComplete', result.fundsToComplete);
    updateGlobal('borrowingOutputs', result);
    updateGlobal('industrialMetrics', { netRentPerSqm: num(lettableArea) ? num(passingRent) / num(lettableArea) : undefined, grossRentPerSqm: num(lettableArea) ? (num(passingRent) + num(recoveries)) / num(lettableArea) : undefined, siteCover: num(landArea) ? num(buildingArea) / num(landArea) : undefined, gla: num(lettableArea), siteArea: num(landArea) });
  }, [updateGlobal, result, assetCategory, assetSubtype, purpose, leaseStatus, state, proposedLoan, purchaserType, entityName, guarantees, relatedPartyTenant, gstRegistered, availableEquity, sponsorLiquidity, liquidityMult, businessDebt, businessEbitda, purchasePrice, estimatedValue, bankValue, conservativeValue, landArea, buildingArea, lettableArea, valuationConfidence, clearance, rollerDoors, truckAccess, powerCapacity, slabCondition, roofCondition, passingRent, otherIncome, recoveries, marketRent, vacancy, profile, rate, buffer, floorRate, term, ioPeriod, amortisation, maxLvr, minIcr, minDscr, minDebtYield, stampDuty, transferRegistrationFee, mortgageRegistrationFee, pexaSettlementFee, legal, bankLegal, valuationFee, dueDiligence, capexReserve, workingCapital, otherCosts, autoEstimatedAcquisitionCosts, gstTreatment]);

  const applyProfile = (next: LenderPolicyProfileKey) => {
    setProfile(next);
    const p = lenderPolicyProfiles[next];
    setMaxLvr(String(p.maxLvr)); setMinIcr(String(p.minIcr)); setMinDscr(String(p.minDscr)); setBuffer(String(p.assessmentBufferPct)); setFloorRate(String(p.assessmentFloorRatePct ?? 0)); setAssessmentBasis(p.assessmentBasis ?? 'contractPlusBuffer'); setMinDebtYield(String(p.minDebtYield));
    if (next === 'smsfCommercial') setPurchaserType('smsf');
  };

  return (
    <Card className="bg-card/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">{assetCategory === 'industrial' ? <Factory className="h-5 w-5 text-primary" /> : <Building2 className="h-5 w-5 text-primary" />} Borrowing Capacity</CardTitle>
            <CardDescription>Shared lending engine with commercial and industrial profiles, funds-to-complete, risk overlays, commentary and document checklist.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 text-sm">{buildGlobalSyncLabel(sourceMode)}</Badge><Badge variant={badgeVariant(result.riskRating) as any} className="px-3 py-1 text-sm">{title(result.riskRating)}</Badge>
            <Sheet><SheetTrigger asChild><Button size="sm" variant="outline">Assumption Status</Button></SheetTrigger><SheetContent className="w-full sm:max-w-3xl overflow-y-auto"><SheetHeader><SheetTitle>Assumption Status Drawer</SheetTitle><SheetDescription>Review source, status and verification requirements without cluttering each input.</SheetDescription></SheetHeader><div className="mt-4 space-y-3">{assumptionRows.map(row => <div key={row.field} className="rounded-md border bg-muted/20 p-3 text-sm"><div className="flex items-center justify-between gap-3"><div className="font-medium">{row.field}</div><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusIcon status={row.status} />{row.status}</div></div><div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground"><div>Current value: <span className="text-foreground">{row.value}</span></div><div>Source: <span className="text-foreground">{row.source}</span></div><div>Last updated: <span className="text-foreground">Current session</span></div><div>Updated by: <span className="text-foreground">Calculator user</span></div><div>Verification required: <span className="text-foreground">{row.status === 'Verified' ? 'No' : 'Yes'}</span></div><div>Required document: <span className="text-foreground">{row.document}</span></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSyncMessage(`${row.field}: AI estimate queued for review; value will not update until accepted.`)}>Estimate with AI</Button><Button size="sm" variant="outline" onClick={() => setSyncMessage(`${row.field}: marked verified for this scenario audit trail.`)}>Mark as verified</Button><Button size="sm" variant="outline" onClick={() => setSyncMessage(`${row.field}: manual replacement mode selected.`)}>Replace manual value</Button><Button size="sm" variant="outline" onClick={() => applyClientProfileImport('scenario')}>Revert to client profile</Button><Button size="sm" variant="ghost" onClick={() => setSyncMessage(`${row.field} source: ${row.source}; required document: ${row.document}.`)}>View source</Button></div></div>)}</div></SheetContent></Sheet>
            <SaveBackButton build={() => ({
              purchase_price: num(purchasePrice),
              valuation: num(estimatedValue),
              gfa_sqm: num(buildingArea) || undefined,
              nla_sqm: num(lettableArea) || undefined,
              site_area_sqm: num(landArea) || undefined,
              state: state,
              asset_class: assetCategory === 'industrial' ? 'industrial' : undefined,
              industrial_specs: assetCategory === 'industrial' ? {
                clearance_metres: num(clearance) || undefined,
                dock_doors: num(rollerDoors) || undefined,
              } : undefined,
            })} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)] gap-6">
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Client Profile Integration</CardTitle><CardDescription>Import a verified client portfolio, run property-only or client-profile scenario assessment, and save scenario outcomes without overwriting verified client data.</CardDescription></div><Badge variant={assessmentMode === 'clientScenario' ? 'default' : 'outline'}>{assessmentMode === 'clientScenario' ? 'Client-profile scenario assessment' : 'Property-only assessment'}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid md:grid-cols-3 gap-3"><div><Label className="flex items-center gap-1.5">Select client profile<StatusIcon status="Client Profile Source" /></Label><ClientProfileCombobox value={selectedClientId} options={clientOptions} loading={clientLoading} onChange={setSelectedClientId} /></div><SelectField label="Scenario type" value={scenarioType} onChange={setScenarioType} status="Overridden" options={['Acquire Commercial Asset','Acquire Industrial Asset','Owner-Occupied Business Premises','Related-Party Lease Structure','Sell Existing Asset','Refinance Existing Debt','Equity Release','Debt Restructure','Cash Injection','Interest Rate Stress','Vacancy / Rent Stress','Capex Shock','Multi-Asset Strategy'].map(v => ({ value: v, label: v }))} /><div><Label>Scenario name</Label><Input value={scenarioName} onChange={e => setScenarioName(e.target.value)} /></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" checked={includeResidential} onChange={e => setIncludeResidential(e.target.checked)} />Residential investments</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeCommercial} onChange={e => setIncludeCommercial(e.target.checked)} />Commercial investments</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeIndustrial} onChange={e => setIncludeIndustrial(e.target.checked)} />Industrial investments</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeShares} onChange={e => setIncludeShares(e.target.checked)} />Shares / liquid investments</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeCash} onChange={e => setIncludeCash(e.target.checked)} />Cash / offsets</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeBusinessFinancials} onChange={e => setIncludeBusinessFinancials(e.target.checked)} />Business financials</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeLiabilities} onChange={e => setIncludeLiabilities(e.target.checked)} />Liabilities / loans</label><label className="flex items-center gap-2"><input type="checkbox" checked={includeIncome} onChange={e => setIncludeIncome(e.target.checked)} />Income / rent</label></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={importClientProfile} disabled={clientLoading}>{clientLoading ? 'Loading profile...' : 'Import current portfolio'}</Button><Button size="sm" variant="outline" onClick={() => setAssessmentMode('propertyOnly')}>Run property-only</Button><Button size="sm" variant="outline" onClick={() => saveScenario('Draft')}>Save Scenario</Button><Button size="sm" variant="outline" onClick={() => saveScenario('Recommended')}>Mark Recommended</Button><Button size="sm" variant="outline" onClick={() => saveScenario('Committed')}>Commit to Client Profile</Button><Button size="sm" variant="outline" onClick={exportScenarioReport}>Export Scenario Report</Button></div><div className="rounded-md border border-primary/20 bg-background/40 p-2 text-xs text-muted-foreground">{syncMessage}{lastPersistedScenarioId ? ` Persisted scenario ID: ${lastPersistedScenarioId}.` : ''}</div>{savedScenario && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">Scenario saved as {savedScenario.status}. Current profile data is not overwritten unless committed.</div>}<Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Current Position</TableHead><TableHead className="text-right">Proposed Scenario</TableHead><TableHead className="text-right">Difference</TableHead></TableRow></TableHeader><TableBody>{scenarioRows.map(([label, current, proposed, diff, kind]) => <TableRow key={String(label)}><TableCell>{label}</TableCell><TableCell className="text-right">{formatScenarioValue(current, kind as string)}</TableCell><TableCell className="text-right">{formatScenarioValue(proposed, kind as string)}</TableCell><TableCell className="text-right">{formatScenarioValue(diff, kind as string)}</TableCell></TableRow>)}</TableBody></Table><div className="grid md:grid-cols-4 gap-2 text-xs"><div className="rounded border bg-muted/20 p-2">Borrowing capacity movement: <span className="font-medium text-primary">{fmt(scenarioComparison.difference.borrowingCapacity)}</span></div><div className="rounded border bg-muted/20 p-2">New limiting factor: <span className="font-medium">{scenarioComparison.proposed.keyConstraint}</span></div><div className="rounded border bg-muted/20 p-2">Portfolio risk: <Badge variant={badgeVariant(scenarioComparison.proposed.riskRating) as any}>{title(scenarioComparison.proposed.riskRating)}</Badge></div><div className="rounded border bg-muted/20 p-2">Audit trail: <span className="font-medium">{activeScenario.auditLog.length} event(s)</span></div></div></CardContent></Card>

          <CommercialBCScenarioAgent
            clientId={selectedClientId}
            snapshot={{
              assetCategory, assetSubtype, state, purpose, leaseStatus,
              purchasePrice: num(purchasePrice),
              estimatedValue: num(estimatedValue),
              proposedLoan: num(proposedLoan),
              availableEquity: num(availableEquity),
              sponsorLiquidity: num(sponsorLiquidity),
              businessEbitda: num(businessEbitda),
              businessDebt: num(businessDebt),
              marketRent: num(marketRent),
              vacancy: num(vacancy),
              rate: num(rate), buffer: num(buffer), term: num(term),
              maxLvr: num(maxLvr), minDscr: num(minDscr), minIcr: num(minIcr),
              profile, gstTreatment,
              riskRating: result.riskRating,
              borrowingCapacity: result.finalRiskAdjustedLoan,
              dscr: result.dscr, icr: result.icr,
              noi: result.noi.actualNoi,
              client: { id: selectedClientId, name: selectedClient.clientName },
            }}
            onApply={applyAIProposal}
          />


          <AlertDialog open={pendingImportOpen} onOpenChange={setPendingImportOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Import client profile values?</AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedClient.clientName} has current portfolio values available. Choose whether to replace scenario inputs or only fill blank fields. Verified client profile values are tagged as Client Profile Source and are not committed back to Current Position unless you commit the scenario.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                Import preview: available liquidity {fmt(currentPortfolio.availableLiquidity)}, business EBITDA {selectedClient.businessFinancials.ebitdaNpbt == null ? 'N/A' : fmt(selectedClient.businessFinancials.ebitdaNpbt)}, liabilities {fmt(selectedClient.liabilities.businessLoans + selectedClient.liabilities.equipmentFinance + selectedClient.liabilities.vehicleFinance + selectedClient.liabilities.creditCards + selectedClient.liabilities.overdrafts)}.
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep current values</AlertDialogCancel>
                <Button variant="outline" onClick={() => applyClientProfileImport('scenario')}>Create scenario override</Button>
                <AlertDialogAction onClick={() => applyClientProfileImport('replace')}>Replace calculator values</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Accordion type="multiple" defaultValue={['deal', 'income', 'assumptions', 'risk']} className="rounded-lg border px-4">
            <AccordionItem value="deal"><AccordionTrigger>1. Deal Profile</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <SelectField label="Asset category" value={assetCategory} onChange={(v) => { setAssetCategory(v); setAssetSubtype(v === 'industrial' ? 'Warehouse' : 'Office'); }} options={[{ value: 'commercial', label: 'Commercial Asset Borrowing Capacity' }, { value: 'industrial', label: 'Industrial Asset Borrowing Capacity' }]} />
              <SelectField label="Asset subtype" value={assetSubtype} onChange={setAssetSubtype} options={(assetCategory === 'commercial' ? commercialSubtypes : industrialSubtypes).map(s => ({ value: s, label: s }))} />
              <SelectField label="Acquisition purpose" value={purpose} onChange={setPurpose} options={[['investment', 'Arm’s-length investment'], ['ownerOccupied', 'Owner-occupied business premises'], ['relatedPartyLease', 'Related-party lease'], ['vacant', 'Vacant possession'], ['partiallyVacant', 'Partially vacant'], ['mixedUse', 'Mixed-use'], ['development', 'Development / repositioning']].map(([value, label]) => ({ value: value as AcquisitionPurpose, label }))} />
              <SelectField label="Lease status" value={leaseStatus} onChange={setLeaseStatus} options={[['fullyLeased', 'Fully leased'], ['partiallyLeased', 'Partially leased'], ['vacant', 'Vacant'], ['monthToMonth', 'Month-to-month'], ['relatedPartyLease', 'Related-party lease'], ['leasePending', 'Lease pending']].map(([value, label]) => ({ value: value as LeaseStatus, label }))} />
              <SelectField label="State / Territory" value={state} onChange={setState} options={['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(s => ({ value: s as typeof state, label: s }))} />
              <Field label="Proposed loan amount (optional)" value={proposedLoan} onChange={setProposedLoan} />
            </AccordionContent></AccordionItem>

            <AccordionItem value="purchaser"><AccordionTrigger>2. Purchaser Structure</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <SelectField label="Purchaser type" value={purchaserType} onChange={setPurchaserType} options={[['individual', 'Individual'], ['company', 'Company'], ['discretionaryTrust', 'Discretionary trust'], ['unitTrust', 'Unit trust'], ['smsf', 'SMSF'], ['holdingCompany', 'Holding company'], ['spv', 'SPV'], ['operatingBusiness', 'Operating business entity'], ['other', 'Other']].map(([value, label]) => ({ value: value as PurchaserStructure, label }))} />
              <div><Label>Borrower entity name</Label><Input value={entityName} onChange={e => setEntityName(e.target.value)} /></div>
              <SelectField label="Guarantees available?" value={guarantees} onChange={setGuarantees} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              <SelectField label="Related-party tenant?" value={relatedPartyTenant} onChange={setRelatedPartyTenant} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
              <SelectField label="GST registered?" value={gstRegistered} onChange={setGstRegistered} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              <Field label="Available cash / equity" value={availableEquity} onChange={setAvailableEquity} />
              <Field label="Sponsor liquidity" value={sponsorLiquidity} onChange={setSponsorLiquidity} />
              <Field label="Liquidity multiplier" value={liquidityMult} onChange={setLiquidityMult} step="0.5" />
              {showBusinessFields && <><Field label="Existing business debts" value={businessDebt} onChange={setBusinessDebt} /><Field label="Business EBITDA / NPBT" value={businessEbitda} onChange={setBusinessEbitda} /><Field label="Current business rent" value={currentRent} onChange={setCurrentRent} /><Field label="Proposed related-party rent" value={proposedRent} onChange={setProposedRent} /></>}
              {purchaserType === 'smsf' && <><Field label="SMSF balance" value={smsfBalance} onChange={setSmsfBalance} /><div className="md:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">SMSF / LRBA placeholder only — specialist review is required before relying on this output.</div></>}
            </AccordionContent></AccordionItem>

            <AccordionItem value="property"><AccordionTrigger>3. Property / Valuation</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <Field label="Purchase price" value={purchasePrice} onChange={setPurchasePrice} /><Field label="Estimated market value" value={estimatedValue} onChange={setEstimatedValue} /><Field label="Bank valuation" value={bankValue} onChange={setBankValue} />
              <SelectField label="Use conservative valuation?" value={conservativeValue} onChange={setConservativeValue} options={[{ value: 'yes', label: 'Yes — lowest available' }, { value: 'no', label: 'No' }]} />
              <Field label="Land area sqm" value={landArea} onChange={setLandArea} /><Field label="Building area sqm" value={buildingArea} onChange={setBuildingArea} /><Field label="Lettable area sqm" value={lettableArea} onChange={setLettableArea} />
              <SelectField label="Valuation confidence" value={valuationConfidence} onChange={setValuationConfidence} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
              {assetCategory === 'industrial' && <><Field label="Clearance height m" value={clearance} onChange={setClearance} step="0.1" /><Field label="Roller doors" value={rollerDoors} onChange={setRollerDoors} /><SelectField label="Truck access" value={truckAccess} onChange={setTruckAccess} options={[{ value: 'poor', label: 'Poor' }, { value: 'average', label: 'Average' }, { value: 'good', label: 'Good' }, { value: 'excellent', label: 'Excellent' }]} /><SelectField label="Power capacity" value={powerCapacity} onChange={setPowerCapacity} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'singlePhase', label: 'Single phase' }, { value: 'threePhase', label: '3 phase' }, { value: 'highCapacity', label: 'High capacity' }, { value: 'substationPresent', label: 'Substation present' }]} /><SelectField label="Slab condition" value={slabCondition} onChange={setSlabCondition} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'good', label: 'Good' }, { value: 'average', label: 'Average' }, { value: 'poor', label: 'Poor' }]} /><SelectField label="Roof condition" value={roofCondition} onChange={setRoofCondition} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'good', label: 'Good' }, { value: 'average', label: 'Average' }, { value: 'poor', label: 'Poor' }]} /></>}
            </AccordionContent></AccordionItem>

            <AccordionItem value="income"><AccordionTrigger>4. Income / NOI</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <Field label="Gross passing rent p.a." value={passingRent} onChange={setPassingRent} /><Field label="Other income p.a." value={otherIncome} onChange={setOtherIncome} /><Field label="Recovered outgoings p.a." value={recoveries} onChange={setRecoveries} />
              <Field label="Market rent p.a." value={marketRent} onChange={setMarketRent} /><Field label="Vacancy allowance %" value={vacancy} onChange={setVacancy} step="0.1" /><Field label="Incentives / rent-free adjustment" value={incentives} onChange={setIncentives} />
              <Field label="Tenant arrears adjustment" value={arrearsAdj} onChange={setArrearsAdj} /><Field label="Non-recoverable expenses" value={nonRecoverable} onChange={setNonRecoverable} /><Field label="Council rates" value={rates} onChange={setRates} />
              <Field label="Water" value={water} onChange={setWater} /><Field label="Land tax" value={landTax} onChange={setLandTax} /><Field label="Insurance" value={insurance} onChange={setInsurance} />
              <Field label="Management fees" value={management} onChange={setManagement} /><Field label="Repairs and maintenance" value={repairs} onChange={setRepairs} /><Field label="WALE years" value={wale} onChange={setWale} step="0.1" />
              <SelectField label="Tenant covenant" value={tenantCovenant} onChange={setTenantCovenant} options={[['government', 'Government'], ['nationalTenant', 'National tenant'], ['listedCompany', 'Listed company'], ['establishedSme', 'Established SME'], ['newBusiness', 'New business'], ['relatedParty', 'Related party'], ['weakUnknown', 'Weak / unknown']].map(([value, label]) => ({ value: value as typeof tenantCovenant, label }))} />
              <SelectField label="Rent over market?" value={rentOverMarket} onChange={setRentOverMarket} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'unknown', label: 'Unknown' }]} />
              {rentOverMarket === 'yes' && <Field label="% above market" value={aboveMarketPct} onChange={setAboveMarketPct} step="0.1" />}
              <SelectField label="NOI basis for borrowing" value={noiBasis} onChange={setNoiBasis} options={[{ value: 'actual', label: 'Actual NOI' }, { value: 'stabilised', label: 'Stabilised NOI' }, { value: 'lenderAdjusted', label: 'Lender-adjusted NOI' }]} />
            </AccordionContent></AccordionItem>

            <AccordionItem value="costs"><AccordionTrigger>5. Acquisition Costs & Funds to Complete</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <Field label="Stamp duty estimate" value={stampDuty} onChange={setStampDuty} /><Field label="Legal / conveyancing" value={legal} onChange={setLegal} /><Field label="Bank legal fee" value={bankLegal} onChange={setBankLegal} />
              <Field label="Valuation fee" value={valuationFee} onChange={setValuationFee} /><Field label="Due diligence allowance" value={dueDiligence} onChange={setDueDiligence} /><Field label="Capex reserve" value={capexReserve} onChange={setCapexReserve} />
              <Field label="Working capital reserve" value={workingCapital} onChange={setWorkingCapital} /><Field label="Environmental report" value={environmentalCost} onChange={setEnvironmentalCost} /><Field label="Asbestos report" value={asbestosCost} onChange={setAsbestosCost} />
              <Field label="Transfer registration fee" value={transferRegistrationFee} onChange={setTransferRegistrationFee} />
              <Field label="Mortgage registration fee" value={mortgageRegistrationFee} onChange={setMortgageRegistrationFee} />
              <Field label="PEXA / settlement fee" value={pexaSettlementFee} onChange={setPexaSettlementFee} />
              <Field label="Other statutory fees" value={otherCosts} onChange={setOtherCosts} />
              <Field label="Auto-estimated acquisition costs" value={autoEstimatedAcquisitionCosts} onChange={setAutoEstimatedAcquisitionCosts} />
              <SelectField label="GST treatment" value={gstTreatment} onChange={setGstTreatment} options={[['gstInclusive', 'GST inclusive'], ['plusGst', 'Plus GST'], ['gstFreeGoingConcern', 'GST-free going concern'], ['marginScheme', 'Margin scheme'], ['unknown', 'Unknown']].map(([value, label]) => ({ value: value as typeof gstTreatment, label }))} />
              <SelectField label="GST cashflow at settlement?" value={gstCashflow} onChange={setGstCashflow} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              <SelectField label="GST claimable as ITC?" value={gstClaimable} onChange={setGstClaimable} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              <SelectField label="Going concern confirmed?" value={goingConcernConfirmed} onChange={setGoingConcernConfirmed} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              <SelectField label="Landholder acquisition?" value={landholderAcquisition} onChange={setLandholderAcquisition} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'unknown', label: 'Unknown' }]} />
            </AccordionContent></AccordionItem>

            <AccordionItem value="assumptions"><AccordionTrigger>6. Lending Assumptions</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <SelectField label="Lender policy profile" value={profile} onChange={applyProfile} options={[['conservativeBank', 'Conservative bank'], ['mainstreamCommercialBank', 'Mainstream commercial bank'], ['nonBankCommercial', 'Non-bank commercial lender'], ['privateCreditShortTerm', 'Private credit / short-term'], ['smsfCommercial', 'SMSF commercial lender'], ['ownerOccupiedBusinessLending', 'Owner-occupied business lending'], ['custom', 'Custom']].map(([value, label]) => ({ value: value as LenderPolicyProfileKey, label }))} />
              <Field label="Contract interest rate %" value={rate} onChange={setRate} step="0.05" /><Field label="Assessment buffer %" value={buffer} onChange={setBuffer} step="0.05" />
              <Field label="Assessment floor rate %" value={floorRate} onChange={setFloorRate} step="0.05" />
              <SelectField label="Assessment basis" value={assessmentBasis} onChange={setAssessmentBasis} options={[['contractPlusBuffer', 'Contract rate plus buffer'], ['higherOfBufferAndFloor', 'Higher of buffer and floor'], ['interestOnlyAssessment', 'Interest-only assessment'], ['principalAndInterestAssessment', 'Principal-and-interest assessment'], ['custom', 'Custom']].map(([value, label]) => ({ value, label }))} />
              <Field label="Loan term years" value={term} onChange={setTerm} /><Field label="Interest-only years" value={ioPeriod} onChange={setIoPeriod} /><Field label="Amortisation years" value={amortisation} onChange={setAmortisation} />
              <Field label="Max LVR (0–1)" value={maxLvr} onChange={setMaxLvr} step="0.01" /><Field label="Minimum ICR (x)" value={minIcr} onChange={setMinIcr} step="0.05" /><Field label="Minimum DSCR (x)" value={minDscr} onChange={setMinDscr} step="0.05" />
              <Field label="Minimum debt yield (0–1)" value={minDebtYield} onChange={setMinDebtYield} step="0.01" />
              <div className="md:col-span-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">{result.assessmentRateEngine.helpNote}</div>
            </AccordionContent></AccordionItem>

            <AccordionItem value="risk"><AccordionTrigger>7. {assetCategory === 'industrial' ? 'Industrial' : 'Commercial'} Risk Assessment</AccordionTrigger><AccordionContent className="grid md:grid-cols-3 gap-3">
              <SelectField label="Tenant strength" value={tenantStrength} onChange={setTenantStrength} options={[{ value: 'strong', label: 'Strong' }, { value: 'established', label: 'Established' }, { value: 'weak', label: 'Weak' }, { value: 'unknown', label: 'Unknown' }]} />
              <SelectField label="Vacancy level" value={vacancyLevel} onChange={setVacancyLevel} options={[{ value: 'none', label: 'None' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }]} />
              <SelectField label="Building condition" value={buildingCondition} onChange={setBuildingCondition} options={[{ value: 'good', label: 'Good' }, { value: 'average', label: 'Average' }, { value: 'poor', label: 'Poor' }]} />
              <SelectField label="Zoning / permitted use" value={zoning} onChange={setZoning} options={[{ value: 'clear', label: 'Clear' }, { value: 'uncertain', label: 'Uncertain' }, { value: 'notPermitted', label: 'Not permitted' }]} />
              <SelectField label="Lease docs complete?" value={leaseDocs} onChange={setLeaseDocs} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Unknown' }]} />
              {assetCategory === 'industrial' && <><SelectField label="Environmental risk" value={environmentalRisk} onChange={setEnvironmentalRisk} options={[{ value: 'low', label: 'Low' }, { value: 'unknown', label: 'Unknown' }, { value: 'present', label: 'Present' }, { value: 'knownContamination', label: 'Known contamination' }]} /><SelectField label="Asbestos risk" value={asbestosRisk} onChange={setAsbestosRisk} options={[{ value: 'low', label: 'Low' }, { value: 'unknown', label: 'Unknown' }, { value: 'likely', label: 'Likely' }, { value: 'confirmed', label: 'Confirmed' }]} /><SelectField label="Capex required" value={capexRequired} onChange={setCapexRequired} options={[{ value: 'none', label: 'None' }, { value: 'some', label: 'Some' }, { value: 'heavy', label: 'Heavy' }]} /></>}
            </AccordionContent></AccordionItem>
          </Accordion>
        </div>

        <div className="space-y-4">
          <Card className="border-primary/30 bg-primary/5"><CardContent className="pt-6 space-y-4">
            <div className="flex justify-between gap-4"><div><p className="text-sm text-muted-foreground">Maximum risk-adjusted loan</p><p className="text-3xl font-bold text-primary">{fmt(result.finalRiskAdjustedLoan)}</p></div><div className="space-y-2 text-right"><div><p className="text-sm text-muted-foreground">Credit assessment</p><Badge variant={badgeVariant(result.creditAssessmentStatus) as any}>{result.creditAssessmentStatusLabel}</Badge></div><div><p className="text-sm text-muted-foreground">Purchase ability</p><Badge variant={badgeVariant(result.overallStatus) as any}>{result.purchaseAbilityStatusLabel}</Badge></div></div></div>
            <Separator />
            <p className="rounded-md border border-primary/20 bg-background/50 p-2 text-xs text-muted-foreground">{result.proposedLoanSupportabilityMessage}{proposedLoan ? ` Supportability gap: ${fmt(result.loanSupportabilityGap)}` : ""}</p><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"><MoneyRow label="Property-supported loan" value={result.propertySupportedLoan} /><MoneyRow label="Sponsor-supported uplift" value={result.sponsorSupportedUplift} /><MoneyRow label="Binding constraint" value={title(result.bindingConstraint)} /><MoneyRow label="Implied LVR" value={pct(result.impliedLvr)} /><MoneyRow label="Assessment rate" value={pct(result.assessmentRate)} /><MoneyRow label="Debt yield" value={pct(result.debtYield)} /><MoneyRow label="ICR" value={`${result.icr.toFixed(2)}x`} /><MoneyRow label="DSCR" value={`${result.dscr.toFixed(2)}x`} /></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Borrowing Capacity Output</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><MoneyRow label="LVR cap" value={result.componentCaps.lvrCap} /><MoneyRow label="ICR cap" value={result.componentCaps.icrCap} /><MoneyRow label="DSCR cap" value={result.componentCaps.dscrCap} /><MoneyRow label="Debt yield cap" value={result.componentCaps.debtYieldCap} />{result.componentCaps.liquidityCap != null && <MoneyRow label="Liquidity cap" value={result.componentCaps.liquidityCap} />}<Separator /><MoneyRow label="Annual interest" value={result.annualInterest} /><MoneyRow label="Annual debt service" value={result.annualDebtService} /></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Base vs Risk-Adjusted Lending Criteria</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">
            <MoneyRow label="Base Max LVR" value={pct(result.baseRiskAdjustedCriteria.baseMaxLvr)} /><MoneyRow label="LVR risk adjustment" value={pct(result.baseRiskAdjustedCriteria.lvrRiskAdjustment)} /><MoneyRow label="Final Max LVR used" value={pct(result.baseRiskAdjustedCriteria.finalMaxLvrUsed)} />
            <MoneyRow label="Base Minimum ICR" value={`${result.baseRiskAdjustedCriteria.baseMinimumIcr.toFixed(2)}x`} /><MoneyRow label="ICR risk adjustment" value={`${result.baseRiskAdjustedCriteria.icrRiskAdjustment.toFixed(2)}x`} /><MoneyRow label="Final Minimum ICR used" value={`${result.baseRiskAdjustedCriteria.finalMinimumIcrUsed.toFixed(2)}x`} />
            <MoneyRow label="Base Minimum DSCR" value={`${result.baseRiskAdjustedCriteria.baseMinimumDscr.toFixed(2)}x`} /><MoneyRow label="DSCR risk adjustment" value={`${result.baseRiskAdjustedCriteria.dscrRiskAdjustment.toFixed(2)}x`} /><MoneyRow label="Final Minimum DSCR used" value={`${result.baseRiskAdjustedCriteria.finalMinimumDscrUsed.toFixed(2)}x`} />
            <MoneyRow label="Base Minimum Debt Yield" value={pct(result.baseRiskAdjustedCriteria.baseMinimumDebtYield)} /><MoneyRow label="Debt-yield risk adjustment" value={pct(result.baseRiskAdjustedCriteria.debtYieldRiskAdjustment)} /><MoneyRow label="Final Minimum Debt Yield used" value={pct(result.baseRiskAdjustedCriteria.finalMinimumDebtYieldUsed)} />
            <Separator /><MoneyRow label="Actual NOI" value={result.baseRiskAdjustedCriteria.actualNoi} /><MoneyRow label="Stabilised NOI" value={result.baseRiskAdjustedCriteria.stabilisedNoi} /><MoneyRow label="Lender-adjusted NOI" value={result.baseRiskAdjustedCriteria.lenderAdjustedNoi} /><MoneyRow label="NOI haircut amount" value={result.baseRiskAdjustedCriteria.noiHaircutAmount} /><MoneyRow label="NOI haircut percentage" value={pct(result.baseRiskAdjustedCriteria.noiHaircutPercentage)} /><Separator /><MoneyRow label="LVR adjustment driver" value={result.baseRiskAdjustedCriteria.lvrAdjustmentDriver ?? "Profile Default"} /><MoneyRow label="ICR adjustment driver" value={result.baseRiskAdjustedCriteria.icrAdjustmentDriver ?? "Profile Default"} /><MoneyRow label="DSCR adjustment driver" value={result.baseRiskAdjustedCriteria.dscrAdjustmentDriver ?? "Profile Default"} /><MoneyRow label="Debt-yield adjustment driver" value={result.baseRiskAdjustedCriteria.debtYieldAdjustmentDriver ?? "Profile Default"} /><MoneyRow label="NOI haircut driver" value={result.baseRiskAdjustedCriteria.noiHaircutDriver ?? "Profile Default"} />
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Business Servicing & Group Debt</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><MoneyRow label="Business status" value={title(result.businessServicing.status)} /><MoneyRow label="Business debt service available" value={result.businessServicing.businessDebtServiceAvailable} /><MoneyRow label="Business DSCR" value={`${result.businessServicing.businessDscr.toFixed(2)}x`} /><MoneyRow label="Combined property/business DSCR" value={`${result.businessServicing.combinedPropertyBusinessDscr.toFixed(2)}x`} /><Separator /><MoneyRow label="Total existing debt" value={result.groupDebt.totalExistingDebt} /><MoneyRow label="Total group debt after acquisition" value={result.groupDebt.totalGroupDebtAfterAcquisition} /><MoneyRow label="Debt to EBITDA" value={result.groupDebt.debtToEbitda == null ? "N/A — EBITDA not provided." : `${result.groupDebt.debtToEbitda.toFixed(2)}x`} /><MoneyRow label="Group DSCR" value={`${result.groupDebt.groupDscr.toFixed(2)}x`} /></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Covenant Pressure / Fix the Deal</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><MoneyRow label="Covenant pressure" value={title(result.covenantPressure.status)} /><MoneyRow label="LVR headroom" value={pct(result.covenantPressure.lvrHeadroom)} /><MoneyRow label="ICR headroom" value={`${result.covenantPressure.icrHeadroom.toFixed(2)}x`} /><MoneyRow label="DSCR headroom" value={`${result.covenantPressure.dscrHeadroom.toFixed(2)}x`} /><Separator /><MoneyRow label="Required NOI for proposed loan" value={result.reverseCalculators.requiredNoiForProposedLoan} /><MoneyRow label="Required equity" value={result.reverseCalculators.requiredEquityForCurrentPurchasePrice} /><MoneyRow label="Indicative equity gap / price-reduction equivalent" value={result.reverseCalculators.indicativeEquityGapPriceReductionEquivalent} /><MoneyRow label="Required purchase price to fit available equity" value={result.reverseCalculators.requiredPurchasePriceToFitAvailableEquity} /><MoneyRow label="Required rent increase" value={result.reverseCalculators.requiredRentIncrease} /></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Purchase Ability / Funds to Complete</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><MoneyRow label="Purchase price" value={num(purchasePrice)} /><MoneyRow label="Acquisition costs" value={result.fundsToComplete.totalAcquisitionCosts} /><MoneyRow label="GST settlement cashflow requirement" value={result.fundsToComplete.gstCashflowRequirement} /><MoneyRow label="GST economic cost" value={result.fundsToComplete.gst.economicCost} /><MoneyRow label="GST claimable amount" value={result.fundsToComplete.gst.claimableAmount} /><MoneyRow label="Total cost base" value={result.fundsToComplete.totalCostBase} emph /><MoneyRow label="Final loan" value={result.finalRiskAdjustedLoan} /><MoneyRow label="Required equity" value={result.fundsToComplete.requiredEquity} emph /><MoneyRow label="Available equity" value={num(availableEquity)} /><MoneyRow label="Equity surplus / shortfall" value={result.fundsToComplete.equitySurplusShortfall} emph /><MoneyRow label="Post-settlement liquidity" value={result.fundsToComplete.postSettlementLiquidity} /><MoneyRow label="Liquidity surplus / shortfall" value={result.fundsToComplete.liquiditySurplusShortfall} /><MoneyRow label="Months debt service covered" value={result.fundsToComplete.monthsDebtServiceCovered == null ? "N/A — equity shortfall exists before liquidity reserve can be assessed." : `${result.fundsToComplete.monthsDebtServiceCovered.toFixed(1)} months`} /><MoneyRow label="Months outgoings covered" value={result.fundsToComplete.monthsOutgoingsCovered == null ? "N/A — equity shortfall exists before liquidity reserve can be assessed." : `${result.fundsToComplete.monthsOutgoingsCovered.toFixed(1)} months`} /></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Risk Summary & Commentary</CardTitle><CardDescription>{result.primaryReason}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{Object.entries(result.commentarySections).map(([heading, text]) => text ? <p key={heading}><span className="font-semibold text-foreground">{title(heading)}:</span> {text}</p> : null)}</div>{result.warnings.length > 0 && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3"><div className="flex items-center gap-2 text-sm font-medium text-amber-200"><AlertTriangle className="h-4 w-4" /> Grouped warnings</div><div className="mt-2 space-y-2 text-xs text-muted-foreground">{Object.entries(result.warningGroups).map(([group, items]) => items.length ? <div key={group}><span className="font-medium text-foreground">{title(group)}</span><ul>{items.slice(0, 4).map((w, i) => <li key={i}>• {w}</li>)}</ul></div> : null)}</div></div>}<p className="text-sm font-medium">Next action: {result.requiredNextAction}</p></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-primary" /> Required Documents / Next Steps</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">{result.documentChecklist.slice(0, 18).map(item => <div key={item} className="rounded border bg-muted/20 px-2 py-1">{item}</div>)}</div></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">Scenario Comparison</CardTitle></CardHeader><CardContent className="space-y-2 text-xs">{result.scenarios.map(s => <div key={s.name} className="grid grid-cols-4 gap-2 rounded border p-2"><span className="font-medium">{s.name}</span><span>{fmt(s.maxLoan)}</span><span>{s.proposedLoanSupportability}</span><span>{title(s.bindingConstraint)}</span><span>{pct(s.impliedLvr)}</span><span>{s.icr.toFixed(2)}x ICR</span><span>{s.dscr.toFixed(2)}x DSCR</span><span>{title(s.purchaseAbilityStatus)}</span><span className="col-span-4 text-muted-foreground">{s.explanation}</span></div>)}</CardContent></Card>
        </div>
      </CardContent>
    </Card>
  );
}
