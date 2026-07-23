import { ArrowLeft, Calculator, Download, Edit, FolderOpen, Images, MoreHorizontal, Send, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { ReportVariantControls } from '@/components/reports/ReportVariantControls';
import type { ClientInfo, InvestmentReport } from './types';
import { getReportTierLabel } from './utils';

interface Props {
  report: InvestmentReport;
  clientInfo: ClientInfo | null;
  isClientReport: boolean;
  onBack: () => void;
  onReportsHome: () => void;
  onBackToClient: () => void;
  onNavigateToReport: (reportId: string) => void;
  onSendToClient: () => void;
  onCashFlow: () => void;
  onEdit: () => void;
  onOverride: () => void;
  onManageHeroImages: () => void;
  onDownload: () => void;
}

export function InvestmentReportCommandHeader({
  report,
  clientInfo,
  isClientReport,
  onBack,
  onReportsHome,
  onBackToClient,
  onNavigateToReport,
  onSendToClient,
  onCashFlow,
  onEdit,
  onOverride,
  onManageHeroImages,
  onDownload,
}: Props) {
  const reportTierLabel = getReportTierLabel(report);

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 flex-shrink-0 sm:px-4">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="sm" onClick={onReportsHome} className="shrink-0 bg-background/80 px-2 shadow-sm sm:px-3">
            <FolderOpen className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Generated Reports</span>
            <span className="sr-only sm:hidden">Generated Reports home</span>
          </Button>
          {isClientReport && clientInfo ? (
            <Button variant="ghost" size="sm" onClick={onBackToClient} className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to {clientInfo.primary_first_name} {clientInfo.primary_surname}</span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          )}
          <Separator orientation="vertical" className="hidden h-7 sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">Report Workspace</p>
              {isClientReport && <Badge variant="secondary" className="hidden text-xs sm:inline-flex">Client Report</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{report.property_address}</p>
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-center gap-2 xl:flex">
          <Badge variant="outline" className="max-w-[140px] truncate capitalize">
            {reportTierLabel}
          </Badge>
          <div className="rounded-lg border bg-card/70 p-1 shadow-sm">
            <ReportVariantControls
              compositeReportId={report.derived_from_report_id || report.id}
              reportVariant={report.report_variant}
              derivedFromReportId={report.derived_from_report_id}
              onNavigate={onNavigateToReport}
            />
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <div className="hidden min-w-0 items-center gap-2 md:flex xl:hidden">
            <Badge variant="outline" className="max-w-[120px] truncate capitalize">
              {reportTierLabel}
            </Badge>
          </div>

          <div className="hidden rounded-lg border bg-card/70 p-1 shadow-sm md:block xl:hidden">
            <ReportVariantControls
              compositeReportId={report.derived_from_report_id || report.id}
              reportVariant={report.report_variant}
              derivedFromReportId={report.derived_from_report_id}
              onNavigate={onNavigateToReport}
            />
          </div>

          <Button variant="default" size="sm" onClick={onDownload} className="shrink-0 shadow-sm">
            <Download className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Download</span>
          </Button>

          <Button variant="outline" size="sm" onClick={onSendToClient} className="hidden shrink-0 bg-background/80 shadow-sm md:inline-flex">
            <Send className="h-4 w-4 mr-1" />
            Send to Client
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 bg-background/80 px-2 shadow-sm sm:px-3">
                <MoreHorizontal className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Report actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={onSendToClient} className="md:hidden">
                <Send className="h-4 w-4 mr-2" />
                Send to Client
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOverride}>
                <Settings className="h-4 w-4 mr-2" />
                Override Data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCashFlow}>
                <Calculator className="h-4 w-4 mr-2" />
                Cash Flow Analysis
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onManageHeroImages}>
                <Images className="h-4 w-4 mr-2" />
                Manage Hero Images
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDownload}>
                <Download className="h-4 w-4 mr-2" />
                Raw text download
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
