import { useSearchParams, useNavigate } from 'react-router-dom';
import { PortfolioAnalysisReportsList } from '@/components/clients/PortfolioAnalysisReportsList';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function PortfolioReports() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clientId = searchParams.get('clientId');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio Performance Reports</h1>
          <p className="text-muted-foreground">
            {clientId 
              ? 'Viewing reports for selected client' 
              : 'View all generated portfolio performance analysis reports across clients'}
          </p>
        </div>
        {clientId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/portfolio-reports')}
          >
            <X className="h-4 w-4 mr-2" />
            Clear Filter
          </Button>
        )}
      </div>

      {/* Reports List */}
      <PortfolioAnalysisReportsList 
        clientId={clientId || undefined} 
        showHeader={true} 
      />
    </div>
  );
}
