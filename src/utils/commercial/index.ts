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
