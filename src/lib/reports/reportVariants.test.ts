import { describe, expect, it } from 'vitest';
import {
  CLIENT_REPORT_VARIANTS,
  REPORT_VARIANT_ORDER,
  getReportVariantLabel,
  isClientReportVariant,
  resolveInvestmentReportType,
} from './reportVariants';

describe('resolveInvestmentReportType', () => {
  it('prefers an explicit specific tier over the legacy Compass engine', () => {
    expect(resolveInvestmentReportType({ report_variant: 'composite', report_tier: 'SNAP' })).toBe('snapshot');
    expect(resolveInvestmentReportType({ report_variant: 'compass', report_tier: 'BRIEF' })).toBe('briefing');
  });

  it('reads historical metadata aliases without exposing them', () => {
    const report = { report_variant: 'compass', metadata: { reportType: 'PLDD' } };
    expect(resolveInvestmentReportType(report)).toBe('strategic');
    expect(getReportVariantLabel(report)).toBe('Strategic');
  });

  it('keeps a genuine base report as Compass and unknown typed rows neutral', () => {
    expect(resolveInvestmentReportType({ report_variant: 'investment_report' })).toBe('compass');
    expect(resolveInvestmentReportType({ report_variant: 'experimental_v3' })).toBeUndefined();
    expect(getReportVariantLabel({ report_variant: 'experimental_v3' })).toBe('Report');
  });

  it('uses the fixed package-summary business order', () => {
    expect(REPORT_VARIANT_ORDER).toEqual(['compass', 'financial', 'strategic', 'snapshot', 'briefing']);
  });

  it('exposes only the four independently generated client report types as actions', () => {
    expect(CLIENT_REPORT_VARIANTS).toEqual(['financial', 'strategic', 'briefing', 'snapshot']);
    expect(CLIENT_REPORT_VARIANTS.every(isClientReportVariant)).toBe(true);
    expect(isClientReportVariant('compass')).toBe(false);
    expect(isClientReportVariant('PLDD')).toBe(false);
  });
});
