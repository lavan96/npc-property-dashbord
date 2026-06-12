// Legacy single-purpose calculators (renamed to avoid clashing with the newer
// borrowing/ engine, which is the authoritative source for `NoiResult`,
// `calculateNoi`, `BindingConstraint`, and `GstTreatment`).
export {
  type NoiInputs as LegacyNoiInputs,
  type NoiResult as LegacyNoiResult,
  calculateNoi as calculateLegacyNoi,
} from './noiCalculator';
export * from './capRateCalculator';
export * from './icrDscrCalculator';
export * from './waleCalculator';
export * from './dcfEngine';

export {
  type GstInputs,
  type GstResult,
  calculateCommercialGst,
  type GstTreatment as LegacyGstTreatment,
} from './gstCommercial';
export {
  type CommercialBcInputs,
  type CommercialBcResult,
  calculateCommercialBc,
  type BindingConstraint as LegacyBindingConstraint,
} from './commercialBorrowingCapacity';

// Authoritative borrowing engine.
export * from './borrowing/calculatorTypes';
export * from './borrowing/lenderPolicyProfiles';
export * from './borrowing/noiAdjustmentEngine';
export * from './borrowing/fundsToCompleteEngine';
export * from './borrowing/riskOverlayEngine';
export * from './borrowing/documentChecklistEngine';
export * from './borrowing/commentaryGenerator';
export * from './borrowing/commercialBorrowingEngine';
