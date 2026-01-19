import { PortfolioAnalysisReportsList } from '@/components/clients/PortfolioAnalysisReportsList';

export default function PortfolioReports() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portfolio Performance Reports</h1>
        <p className="text-muted-foreground">
          View all generated portfolio performance analysis reports across clients
        </p>
      </div>

      {/* Reports List */}
      <PortfolioAnalysisReportsList showHeader={true} />
    </div>
  );
}
