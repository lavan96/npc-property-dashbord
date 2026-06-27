/**
 * Phase 6 — Repair loop barrel.
 *
 * The loop is the consumer of `recommendedAction` from Phase 4: when a page
 * resolves to `repair`, we run pluggable solvers, apply patches, and re-score
 * with the diff harness. Capped at 2 passes per the visual-quality contract.
 */
export {
  runRepairLoop,
  type RunRepairLoopOptions,
} from './runRepairLoop';

export {
  applyPatch,
  applyPatches,
  type ApplyPatchResult,
} from './applyPatch';

export {
  doclingRepairSolver,
} from './doclingSolver';

export type {
  RepairOp,
  RepairPatch,
  RepairSolver,
  RepairContext,
  RepairPassReport,
  RepairLoopResult,
} from './repairTypes';

export {
  REPAIR_ISSUE_CLASSIFIER_VERSION,
  classifyPageRepairIssues,
  classifyVisualQualityRepairIssues,
  isFallbackAction,
  isRepairAction,
  summarizeRepairIssues,
  type ClassifiedRepairIssues,
  type RepairIssue,
  type RepairIssueCategory,
  type RepairIssueSeverity,
  type RepairIssueSummary,
  type RepairSuggestion,
} from './issueClassifier';

export {
  REPAIR_ELIGIBILITY_VERSION,
  evaluatePageRepairEligibility,
  evaluateVisualRepairEligibility,
  type PageRepairEligibility,
  type RepairEligibilityBlockReason,
  type RepairEligibilityDecision,
  type RepairFallbackMode,
  type VisualRepairEligibility,
} from './repairEligibility';

export {
  REPAIR_LOOP_BRIDGE_VERSION,
  buildCdirSelfExpectations,
  buildRepairLoopBridgeInput,
  generatedRastersToRenderedPageRasters,
  sourceRenderRastersToVisualDiffSourceRasters,
  type BuildRepairLoopBridgeOptions,
  type RepairExpectationStrategy,
  type RepairLoopBridgeInput,
} from './repairBridge';
