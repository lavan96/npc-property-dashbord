import { describe, expect, it } from 'vitest';
import { buildGeneratedReportGroups } from './generatedReportGroups';

describe('buildGeneratedReportGroups', () => {
  it('creates one safe package row for report variants and tolerates legacy fields', () => {
    const groups = buildGeneratedReportGroups([
      { id: '1', property_address: '7 Example St', property_listing_id: 'property-1', created_at: '2026-01-01T00:00:00Z', current_version: 1, report_variant: 'compass' },
      { id: '2', property_address: '7 Example St', property_listing_id: 'property-1', created_at: '2026-01-02T00:00:00Z', current_version: 2, report_variant: 'financial', is_archived: true },
      { id: '3', property_address: '', property_listing_id: null, created_at: 'not-a-date', current_version: 0 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ propertyAddress: '7 Example St', reportCount: 2, isPartiallyArchived: true, latestStatus: 'Unknown' });
    expect(groups[0].reportTypes).toEqual(['compass', 'financial']);
    expect(groups[1].propertyAddress).toBe('Address unavailable');
  });
});
