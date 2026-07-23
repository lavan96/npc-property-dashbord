import { describe, expect, it } from 'vitest';
import { getReportVariantLabel, normalizeReportVariant } from './reportVariants';

describe('report variant normalization', () => {
  it('uses structured report metadata before the Compass base engine alias', () => {
    expect(normalizeReportVariant({ report_variant: 'composite', report_tier: 'briefing' })).toBe('compass');
    expect(normalizeReportVariant({ report_variant: 'briefing', report_tier: 'compass' })).toBe('briefing');
  });

  it.each([
    ['FIN', 'financial'], ['PLDD', 'strategic'], ['client_briefing', 'briefing'], ['quick_snapshot', 'snapshot'], ['investment_report', 'compass'],
  ] as const)('normalizes legacy alias %s to %s', (alias, variant) => {
    expect(normalizeReportVariant(alias)).toBe(variant);
  });

  it('uses explicit historical template/title evidence as controlled fallback', () => {
    expect(normalizeReportVariant({ template_identifier: 'briefing' })).toBe('briefing');
    expect(normalizeReportVariant({ title: 'Property Snapshot — 23 Atlantis Avenue' })).toBe('snapshot');
    expect(getReportVariantLabel({ report_tier: 'PLDD' })).toBe('Strategic');
  });
});
