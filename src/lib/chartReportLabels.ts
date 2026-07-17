import { format } from 'date-fns';

export interface ChartSourceReport {
  id: string;
  title: string;
  created_at: string;
  listing_count?: number | null;
}

export interface ChartReportOption extends ChartSourceReport {
  label: string;
}

const cleanTitle = (title: string | null | undefined) => title?.trim() || 'Untitled report';

const formatGeneratedAt = (createdAt: string) => {
  const generatedAt = new Date(createdAt);
  return Number.isNaN(generatedAt.getTime())
    ? null
    : format(generatedAt, 'd MMM yyyy, h:mm a');
};

/**
 * Builds one deterministic filter option per authoritative report ID.
 * Generation metadata distinguishes separate instances without changing report data.
 */
export function buildChartReportOptions(reports: ChartSourceReport[]): ChartReportOption[] {
  const uniqueReports = Array.from(
    new Map(reports.filter(report => report.id).map(report => [report.id, report])).values(),
  );

  const candidates = uniqueReports.map(report => {
    const details = [
      typeof report.listing_count === 'number'
        ? `${report.listing_count.toLocaleString()} ${report.listing_count === 1 ? 'listing' : 'listings'}`
        : null,
      formatGeneratedAt(report.created_at),
    ].filter(Boolean);

    return {
      report,
      label: [cleanTitle(report.title), ...details].join(' · '),
    };
  });

  const labelCounts = new Map<string, number>();
  candidates.forEach(({ label }) => labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1));

  return candidates.map(({ report, label }) => ({
    ...report,
    label: labelCounts.get(label) === 1 ? label : `${label} · ${report.id.slice(-6)}`,
  }));
}
