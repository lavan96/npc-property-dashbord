import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Loader2, Download, Edit, MapPin, Calendar, FileText, TrendingUp, Link, AlertCircle, Settings, ChevronDown, PenLine, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ClientPDFGenerator } from '@/components/reports/ClientPDFGenerator';
import { RegenerateWithPerplexityButton } from '@/components/reports/RegenerateWithPerplexityButton';
import { InvestmentReportEditor } from '@/components/reports/InvestmentReportEditor';
import { ManualDataOverrideModal } from '@/components/reports/ManualDataOverrideModal';
import { logActivityDirect } from '@/hooks/useActivityLogger';

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content: string;
  sources_content?: string | null;
  created_at: string;
  status?: string;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
  is_client_report?: boolean;
  client_property_id?: string | null;
}

interface ClientInfo {
  id: string;
  primary_first_name: string;
  primary_surname: string;
}

export default function InvestmentReportView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [report, setReport] = useState<InvestmentReport | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeScoring, setIncludeScoring] = useState(true);
  const [showOverrides, setShowOverrides] = useState(true);

  const isClientReport = report?.is_client_report === true;

  useEffect(() => {
    if (!id) {
      setError('No report ID provided');
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await invokeSecureFunction('get-investment-reports', {
        reportId: id,
        listOptions: {
          select: 'id, property_address, property_listing_id, report_content, sources_content, created_at, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence, is_client_report, client_property_id'
        }
      });

      if (fetchError) {
        console.error('Error fetching report:', fetchError);
        setError('Failed to load the report. Please try again.');
        setLoading(false);
        return;
      }

      if (!data?.report) {
        setError('Report not found.');
        setLoading(false);
        return;
      }

      const reportData = data.report;
      setReport(reportData as InvestmentReport);
      
      // If it's a client report, fetch the client info for back navigation
      if (reportData.is_client_report && reportData.client_property_id) {
        const { data: clientData } = await invokeSecureFunction('manage-client-data', {
          operation: 'getClientProperty',
          clientPropertyId: reportData.client_property_id
        });

        if (clientData?.property?.clients) {
          const client = clientData.property.clients as unknown as ClientInfo;
          setClientInfo(client);
        }
      }

      setLoading(false);
      
      // Log report viewed
      logActivityDirect({
        actionType: 'report_viewed',
        entityType: 'investment_report',
        entityId: id,
        entityName: reportData.property_address,
        metadata: { source: 'investment_report_view', isClientReport: reportData.is_client_report }
      });
    };

    fetchReport();
  }, [id]);

  const handleReportUpdate = async () => {
    if (!id) return;

    const { data } = await invokeSecureFunction('get-investment-reports', {
      reportId: id,
      listOptions: {
        select: 'id, property_address, property_listing_id, report_content, sources_content, created_at, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence, is_client_report, client_property_id'
      }
    });

    if (data?.report) {
      setReport(data.report as InvestmentReport);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    let content = report.report_content;
    if (includeSources && report.sources_content) {
      content += report.sources_content;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investment-report-${report.property_address.replace(/[^a-zA-Z0-9]/g, '-')}-${format(new Date(report.created_at), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Markdown custom components
  const markdownComponents = {
    h1: ({ children }: any) => <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground border-b pb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-xl font-semibold mt-6 mb-3 text-primary">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">{children}</h3>,
    p: ({ children }: any) => <p className="mb-4 leading-relaxed text-foreground">{children}</p>,
    ul: ({ children }: any) => <ul className="mb-4 space-y-2 list-disc list-inside">{children}</ul>,
    ol: ({ children }: any) => <ol className="mb-4 space-y-2 list-decimal list-inside">{children}</ol>,
    li: ({ children }: any) => <li className="text-foreground leading-relaxed pl-2">{children}</li>,
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-6">
        <table className="min-w-full border-collapse border border-border">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-muted">{children}</thead>,
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => <tr className="border-b border-border">{children}</tr>,
    th: ({ children }: any) => <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">{children}</th>,
    td: ({ children }: any) => <td className="border border-border px-4 py-2 text-foreground">{children}</td>,
    strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
    code: ({ children }: any) => <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
  };

  const hasOverrides = report?.manual_overrides && Object.keys(report.manual_overrides).length > 0;

  const overriddenFields = useMemo(() => {
    if (!hasOverrides || !report) return [];
    const fieldMappings: Record<string, string> = {
      purchasePrice: 'Purchase Price',
      landPrice: 'Land Price',
      buildPrice: 'Build Price',
      depositValue: 'Deposit Value',
      loanToValueRatio: 'Loan to Value Ratio',
      interestRate: 'Interest Rate',
      capitalGrowth: 'Capital Growth',
      weeklyRent: 'Weekly Rent',
      stampDuty: 'Stamp Duty',
      bodyCorporateFees: 'Body Corporate/Strata Fees',
      councilRates: 'Council Rates',
      waterRates: 'Water Rates',
      solicitorFees: 'Solicitor Fees',
      buildingLandlordInsurance: 'Building & Landlord Insurance',
      propertyManagementFees: 'Property Management',
      repairsMaintenance: 'Repairs & Maintenance',
      lettingFees: 'Letting Fees',
    };
    return Object.keys(report.manual_overrides).map((key) => ({
      key,
      displayName: fieldMappings[key] || key.replace(/([A-Z])/g, ' $1').trim(),
      value: report.manual_overrides[key],
    }));
  }, [report, hasOverrides]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-lg text-destructive">{error || 'Report not found'}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="p-4 border-b flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          {isClientReport && clientInfo ? (
            <Button variant="ghost" size="sm" onClick={() => navigate('/clients')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {clientInfo.primary_first_name} {clientInfo.primary_surname}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          {isClientReport && (
            <Badge variant="secondary" className="text-xs">
              Client Report
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cash Flow - available for all reports */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/cash-flow-analysis?reportId=${report.id}`)}
          >
            <Calculator className="h-4 w-4 mr-1" />
            Cash Flow Analysis
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOverrideModalOpen(true)}>
            <Settings className="h-4 w-4 mr-1" />
            Override Data
          </Button>
          <Button variant="default" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Report Header Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {report.property_address}
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Generated on {format(new Date(report.created_at), 'PPpp')}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">
                  <FileText className="h-3 w-3 mr-1" />
                  Investment Report
                </Badge>
                {hasOverrides && (
                  <Badge variant="default" className="bg-primary">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Contains Manual Overrides
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Manual Overrides Indicator */}
        {hasOverrides && (
          <Collapsible open={showOverrides} onOpenChange={setShowOverrides}>
            <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
              <CardHeader className="pb-3">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PenLine className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                      <span className="font-semibold text-amber-800 dark:text-amber-200">
                        {overriddenFields.length} Field{overriddenFields.length !== 1 ? 's' : ''} Manually Edited
                      </span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-amber-700 dark:text-amber-300 transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {overriddenFields.map((field) => (
                      <Badge
                        key={field.key}
                        variant="secondary"
                        className="text-xs font-normal bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                      >
                        <PenLine className="h-3 w-3 mr-1" />
                        {field.displayName}
                      </Badge>
                    ))}
                  </div>
                </CollapsibleContent>
              </CardHeader>
            </Card>
          </Collapsible>
        )}

        {/* Report Content Card */}
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Analysis Report
              </CardTitle>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-sm text-muted-foreground">Include scoring</span>
                  <Switch checked={includeScoring} onCheckedChange={setIncludeScoring} />
                </div>
                <div className="flex items-center gap-2">
                  <Link className="h-3 w-3" />
                  <span className="text-sm text-muted-foreground">Include sources</span>
                  <Switch checked={includeSources} onCheckedChange={setIncludeSources} />
                </div>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="p-4 border-b bg-muted/50 flex flex-wrap items-center gap-3">
              <ErrorBoundary fallback={<div className="text-sm text-muted-foreground">PDF tools are unavailable.</div>}>
                <ClientPDFGenerator report={report} includeSources={includeSources} includeScoring={includeScoring} />
              </ErrorBoundary>

              <RegenerateWithPerplexityButton
                reportId={report.id}
                propertyAddress={report.property_address}
                onRegenerated={handleReportUpdate}
                variant="default"
                size="sm"
              />
            </div>
            <div className="p-6 prose prose-sm max-w-none dark:prose-invert">
              <ErrorBoundary
                fallback={
                  <div className="rounded-md border border-border bg-muted/40 p-4">
                    <div className="text-sm font-medium text-foreground">Report content couldn't be displayed.</div>
                    <div className="mt-1 text-sm text-muted-foreground">You can still download the raw report text.</div>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="h-3 w-3 mr-1" />
                        Download raw text
                      </Button>
                    </div>
                  </div>
                }
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {report.report_content}
                </ReactMarkdown>

                {includeSources && report.sources_content && (
                  <div className="mt-8 border-t pt-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {report.sources_content}
                    </ReactMarkdown>
                  </div>
                )}
              </ErrorBoundary>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor Modal */}
      <InvestmentReportEditor
        report={report}
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          handleReportUpdate();
        }}
      />

      {/* Override Modal */}
      <ManualDataOverrideModal
        report={report}
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        onSave={handleReportUpdate}
      />
    </div>
  );
}
