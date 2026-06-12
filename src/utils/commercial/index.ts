// Legacy single-purpose calculators are the default re-exports because lots of
// existing UI (NoiCalculatorCard, GstCalculatorCard, CommercialPortfolioWidget,
// commercialReportPdf, etc.) relies on their shapes.
export * from './noiCalculator';
export * from './capRateCalculator';
export * from './icrDscrCalculator';
export * from './waleCalculator';
export * from './gstCommercial';
export * from './dcfEngine';
export * from './commercialBorrowingCapacity';

// Newer borrowing engine — re-export everything *except* the names that would
// clash with the legacy modules above. Consumers that need the borrowing
// variants of these types should import them via the explicit `*Borrowing`
// aliases below, or import directly from './borrowing/calculatorTypes'.
export {
  type BindingConstraint as BorrowingBindingConstraint,
  type GstTreatment as BorrowingGstTreatment,
  type NoiResult as BorrowingNoiResult,
  type AcquisitionPurpose,
  type AssetCategory,
  type BorrowingInputs,
  type FundsToCompleteResult,
  type LeaseStatus,
  type LendingAssumptions,
  type LenderPolicyProfileKey,
  type PurchaseAbilityStatus,
  type PurchaserStructure,
  type RiskRating,
  type TriState,
  type AcquisitionCosts,
  type BorrowingResult,
} from './borrowing/calculatorTypes';
export * from './borrowing/lenderPolicyProfiles';
export {
  calculateNoi as calculateBorrowingNoi,
} from './borrowing/noiAdjustmentEngine';
export * from './borrowing/fundsToCompleteEngine';
export * from './borrowing/riskOverlayEngine';
export * from './borrowing/documentChecklistEngine';
export * from './borrowing/commentaryGenerator';
export * from './borrowing/commercialBorrowingEngine';
export * from './assumptionRegistry';
export * from './commercialDealState';
export * from './calculatorDataSync';
export * from './calculatorAssumptionRegistry';
export * from './aiEstimateEngine';
export * from './aiModelRouter';
export * from './aiEstimateConfidence';
export * from './assumptionProvenance';
export * from './aiEstimatePromptTemplates';
export * from './aiEstimateAuditLog';
export * from './noiEngine';
export * from './capRateEngine';
export * from './icrDscrEngine';
export * from './gstEngine';
export * from './dcfAssessmentEngine';
export * from './warningEngine';
export * from './documentChecklistEngine';
export * from './commentaryGenerator';
export * from './reportPayloadBuilder';
