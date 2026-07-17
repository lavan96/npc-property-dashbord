import { format } from 'date-fns';

export interface ChartSourceReport {
  id: string;
  title: string;
  created_at: string;
}

export interface ChartReportOption extends ChartSourceReport {
  label: string;
}

const cleanTitle = (title: string | null | undefined) => title?.trim() || 'Untitled report';

const formatGeneratedAt = (createdAt: string) => {
  const generatedAt = new Date(createdAt);
  return Number.isNaN(generatedAt.getTime())
    ? null
    : format(generatedAt, 'd MMM yyyy');
};

/**
 * Builds one deterministic filter option per authoritative report ID.
 * Generation metadata distinguishes separate instances without changing report data.
 */
export function buildChartReportOptions(reports: ChartSourceReport[]): ChartReportOption[] {
  const uniqueReports = Array.from(
    new Map(reports.filter(report => report.id).map(report => [report.id, report])).values(),
  );

  return uniqueReports.map(report => ({
    ...report,
    label: [cleanTitle(report.title), formatGeneratedAt(report.created_at)]
      .filter(Boolean)
      .join(' — '),
  }));
}
