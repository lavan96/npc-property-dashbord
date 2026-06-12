export * from './noiCalculator';
export * from './capRateCalculator';
export * from './icrDscrCalculator';
export * from './waleCalculator';
export * from './dcfEngine';

// Legacy modules: re-export concrete entry points but rename the type aliases
// that collide with the newer borrowing/ definitions below.
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

// Authoritative borrowing engine (wins the `BindingConstraint` / `GstTreatment`
// names because the CommercialBorrowingCapacityCard and the rest of the
// borrowing/ pipeline rely on these wider unions).
export * from './borrowing/calculatorTypes';
export * from './borrowing/lenderPolicyProfiles';
export * from './borrowing/noiAdjustmentEngine';
export * from './borrowing/fundsToCompleteEngine';
export * from './borrowing/riskOverlayEngine';
export * from './borrowing/documentChecklistEngine';
export * from './borrowing/commentaryGenerator';
export * from './borrowing/commercialBorrowingEngine';
