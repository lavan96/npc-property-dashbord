import { describe, expect, it } from 'vitest';
import { buildChartReportOptions } from './chartReportLabels';

describe('buildChartReportOptions', () => {
  it('deduplicates report records by stable ID rather than title', () => {
    const options = buildChartReportOptions([
      { id: 'report-1', title: 'Property Listings Report', created_at: '2025-09-12T10:00:00Z', listing_count: 12 },
      { id: 'report-1', title: 'Property Listings Report', created_at: '2025-09-12T10:00:00Z', listing_count: 12 },
      { id: 'report-2', title: 'Property Listings Report', created_at: '2025-09-13T10:00:00Z', listing_count: 8 },
    ]);

    expect(options).toHaveLength(2);
    expect(options.map(option => option.id)).toEqual(['report-1', 'report-2']);
    expect(new Set(options.map(option => option.label)).size).toBe(2);
    expect(options[0].label).toContain('12 listings');
    expect(options[1].label).toContain('8 listings');
  });

  it('uses an ID suffix only when authoritative display metadata still collides', () => {
    const options = buildChartReportOptions([
      { id: 'report-abcdef', title: 'Property Listings Report', created_at: '2025-09-12T10:00:00Z' },
      { id: 'report-uvwxyz', title: 'Property Listings Report', created_at: '2025-09-12T10:00:00Z' },
    ]);

    expect(options[0].label).toMatch(/abcdef$/);
    expect(options[1].label).toMatch(/uvwxyz$/);
  });

  it('provides a safe title when report metadata has no usable title', () => {
    const [option] = buildChartReportOptions([
      { id: 'report-1', title: '   ', created_at: 'invalid-date' },
    ]);

    expect(option.label).toBe('Untitled report');
  });
});
