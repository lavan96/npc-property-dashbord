import { useSearchParams, useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { PortfolioAnalysisReportsList } from '@/components/clients/PortfolioAnalysisReportsList';
import { Button } from '@/components/ui/button';
import { BarChart3, Sparkles, X } from 'lucide-react';

export default function PortfolioReports() {
  const { canEdit: canEditPortfolio, canDelete: canDeletePortfolio } = useModulePermissions('portfolio_reports');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clientId = searchParams.get('clientId');

  return (
    <div className="relative -mx-2 overflow-hidden rounded-[2rem] border border-amber-500/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.13),transparent_34%),linear-gradient(135deg,rgba(8,8,10,0.96),rgba(20,20,24,0.9)_48%,rgba(8,8,10,0.98))] px-3 py-4 shadow-2xl shadow-black/30 sm:mx-0 sm:px-5 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7">
        {/* Header */}
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/35 p-5 shadow-xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-200 shadow-lg shadow-amber-950/30">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                <Sparkles className="h-3.5 w-3.5" />
                Portfolio Intelligence
              </div>
              <h1 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl lg:text-5xl">Portfolio Performance Reports</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300/90 sm:text-base">
                {clientId
                  ? 'Viewing reports for selected client'
                  : 'View all generated portfolio performance analysis reports across clients'}
              </p>
            </div>
          </div>
          {clientId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/portfolio-reports')}
              className="border-amber-400/30 bg-black/30 text-amber-100 transition-all hover:border-amber-300 hover:bg-amber-400/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/35 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <X className="mr-2 h-4 w-4" />
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
    </div>
  );
}
