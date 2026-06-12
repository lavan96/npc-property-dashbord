import type { CommercialIndustrialDealProfile } from './commercialDealState';
import { buildDynamicDocumentChecklist } from './documentChecklistEngine';
import { generateGlobalWarnings } from './warningEngine';
export interface ReportSectionPayload { title: string; data: unknown; verifiedInputs: string[]; aiEstimatedInputs: string[]; unknownInputs: string[]; specialistReviewItems: string[]; manualOverrides: string[]; }
export interface CommercialIndustrialReportPayload { sections: ReportSectionPayload[]; generatedAt: string; }
const keysByTag = (profile: CommercialIndustrialDealProfile, tag: string) => Object.values(profile.assumptions).filter(a => a.confidenceTag === tag).map(a => a.fieldKey);
export function buildCommercialIndustrialReportPayload(profile: CommercialIndustrialDealProfile): CommercialIndustrialReportPayload {
  const baseMeta = { verifiedInputs: keysByTag(profile, 'Verified'), aiEstimatedInputs: keysByTag(profile, 'AI Estimate'), unknownInputs: keysByTag(profile, 'Unknown'), specialistReviewItems: keysByTag(profile, 'Specialist Review Required'), manualOverrides: Object.keys(profile.scenarioOverrides).filter(k => Object.keys((profile.scenarioOverrides as any)[k] ?? {}).length) };
  const section = (title: string, data: unknown): ReportSectionPayload => ({ title, data, ...baseMeta });
  return { generatedAt: new Date().toISOString(), sections: [
    section('Executive Summary', { warningGroups: generateGlobalWarnings(profile) }),
    section('Transaction Profile', profile.dealProfile),
    section('Purchaser Structure', profile.purchaserStructure),
    section('Net Operating Income Assessment', { inputs: profile.leaseIncome, outputs: profile.noiOutputs }),
    section('Valuation and Capitalisation Rate Assessment', { valuation: profile.propertyValuation, outputs: profile.capRateOutputs }),
    section('Borrowing Capacity Assessment', { debtInputs: profile.debtInputs, lendingAssumptions: profile.lendingAssumptions, fundsToComplete: profile.fundsToComplete }),
    section('Goods and Services Tax and Acquisition Cost Assessment', { gstInputs: profile.gstInputs, gstOutputs: profile.gstOutputs, acquisitionCosts: profile.acquisitionCosts }),
    section('Discounted Cash Flow and Return Analysis', { inputs: profile.dcfInputs, outputs: profile.dcfOutputs }),
    section('Required Documents', buildDynamicDocumentChecklist(profile)),
    section('Assumptions and Disclaimers', { assumptions: profile.assumptions, aiEstimateAuditLog: profile.aiEstimateAuditLog }),
  ] };
}
