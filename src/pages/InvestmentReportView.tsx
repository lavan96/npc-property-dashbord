import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Loader2, Download, Edit, Calendar, TrendingUp, Link, AlertCircle, Settings, ChevronDown, PenLine, Calculator, Send, Images, CheckCircle2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ClientPDFGenerator } from '@/components/reports/ClientPDFGenerator';
import { PremiumPdfButton } from '@/components/reports/PremiumPdfButton';
import type { PixelPerfectPDFGeneratorHandle } from '@/components/reports/PixelPerfectPDFGenerator';
import { RegenerateWithPerplexityButton } from '@/components/reports/RegenerateWithPerplexityButton';
import { InvestmentReportEditor } from '@/components/reports/InvestmentReportEditor';
import { ManualDataOverrideModal } from '@/components/reports/ManualDataOverrideModal';
import { SendToClientModal } from '@/components/reports/SendToClientModal';
import { HeroImageStudio } from '@/components/reports/HeroImageStudio';
import { PremiumPdfDesignPanel } from '@/components/reports/PremiumPdfDesignPanel';
import { DEFAULT_PDF_DESIGN_OPTIONS, type PdfDesignOptions } from '@/components/reports/premiumPdfDesign';
import { ReportVariantControls } from '@/components/reports/ReportVariantControls';
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
  report_tier?: string | null;
  report_variant?: string | null;
  derived_from_report_id?: string | null;
  pdf_url?: string | null;
}
interface ClientInfo {
  id: string;
  primary_first_name: string;
  primary_surname: string;
}

export default function InvestmentReportView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<InvestmentReport | null>(null);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [sendToClientOpen, setSendToClientOpen] = useState(false);
  const [heroDialogOpen, setHeroDialogOpen] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [includeScoring, setIncludeScoring] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeHeroImages, setIncludeHeroImages] = useState(false);
  const [includeSparklines, setIncludeSparklines] = useState(true);
  const [pdfDesignOptions, setPdfDesignOptions] = useState<PdfDesignOptions>(DEFAULT_PDF_DESIGN_OPTIONS);
  const [showOverrides, setShowOverrides] = useState(true);
  const pdfGeneratorRef = useRef<PixelPerfectPDFGeneratorHandle>(null);

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
        select: 'id, property_address, property_listing_id, report_content, sources_content, created_at, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence, is_client_report, client_property_id, report_tier, report_variant, derived_from_report_id, pdf_url'
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
        select: 'id, property_address, property_listing_id, report_content, sources_content, created_at, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence, is_client_report, client_property_id, report_tier'
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

  const reportScore = useMemo(() => {
    const score = report?.investment_score;
    if (!score) return null;
    if (typeof score === 'number' || typeof score === 'string') return score;
    return score.overall_score ?? score.score ?? score.totalScore ?? score.rating ?? null;
  }, [report?.investment_score]);

  const reportTierLabel = report?.report_tier ? report.report_tier.replace(/_/g, ' ') : 'Standard';
  const reportVariantLabel = report?.report_variant ? report.report_variant.replace(/_/g, ' ') : 'Primary';
  const reportStatusLabel = report?.status ? report.status.replace(/_/g, ' ') : 'Draft';

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
      {/* Sticky command header */}
      <div className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 flex-shrink-0">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {isClientReport && clientInfo ? (
              <Button variant="ghost" size="sm" onClick={() => navigate('/clients')} className="shrink-0">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to {clientInfo.primary_first_name} {clientInfo.primary_surname}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="shrink-0">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <Separator orientation="vertical" className="hidden h-7 sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">Report Workspace</p>
                {isClientReport && <Badge variant="secondary" className="text-xs">Client Report</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{report.property_address}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="rounded-lg border bg-card/70 p-1">
              <ReportVariantControls
                compositeReportId={report.derived_from_report_id || report.id}
                reportVariant={report.report_variant}
                derivedFromReportId={report.derived_from_report_id}
                onNavigate={(rid) => navigate(`/investment-report/${rid}`)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card/70 p-1">
              <Button variant="ghost" size="sm" onClick={() => setSendToClientOpen(true)}>
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate(`/cash-flow-analysis?reportId=${report.id}`)}>
                <Calculator className="h-4 w-4 mr-1" />
                Cash Flow
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditorOpen(true)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOverrideModalOpen(true)}>
                <Settings className="h-4 w-4 mr-1" />
                Override
              </Button>
            </div>
            <Button variant="default" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="mx-auto grid w-full max-w-7xl gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
          <div className="space-y-5">
            {/* Executive report hero */}
            <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Investment Report</Badge>
                      {isClientReport && <Badge variant="outline">Client-ready</Badge>}
                      {hasOverrides && <Badge className="gap-1 bg-amber-600 text-white hover:bg-amber-600"><AlertCircle className="h-3 w-3" /> Adjusted Data</Badge>}
                    </div>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{report.property_address}</h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Generated {format(new Date(report.created_at), 'PPpp')}</span>
                        <span className="inline-flex items-center gap-1.5 capitalize"><CheckCircle2 className="h-4 w-4" /> {reportStatusLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[460px]">
                    <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Tier</p><p className="mt-1 truncate text-sm font-semibold capitalize">{reportTierLabel}</p></div>
                    <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Variant</p><p className="mt-1 truncate text-sm font-semibold capitalize">{reportVariantLabel}</p></div>
                    <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Score</p><p className="mt-1 text-sm font-semibold">{reportScore ?? 'Not scored'}</p></div>
                    <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Client Status</p><p className="mt-1 text-sm font-semibold">{isClientReport ? 'Client report' : 'Internal'}</p></div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setSendToClientOpen(true)}><Send className="h-4 w-4 mr-1" />Send to Client</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}><Edit className="h-4 w-4 mr-1" />Edit Report</Button>
                  <Button variant="outline" size="sm" onClick={() => setOverrideModalOpen(true)}><SlidersHorizontal className="h-4 w-4 mr-1" />Adjust Data</Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Adjustments disclosure */}
            {hasOverrides && (
              <Collapsible open={showOverrides} onOpenChange={setShowOverrides}>
                <Card className="border-amber-200 bg-amber-50/70 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
                  <CollapsibleTrigger className="w-full text-left">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><PenLine className="h-4 w-4" /></div>
                          <div>
                            <CardTitle className="text-base text-amber-950 dark:text-amber-100">Data Adjustments</CardTitle>
                            <p className="text-sm text-amber-800/80 dark:text-amber-200/80">{overriddenFields.length} field{overriddenFields.length !== 1 ? 's' : ''} manually edited and included in this workspace.</p>
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0"><div className="flex flex-wrap gap-2">{overriddenFields.map((field) => (<Badge key={field.key} variant="secondary" className="border border-amber-300 bg-amber-100 text-xs font-normal text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"><PenLine className="h-3 w-3 mr-1" />{field.displayName}</Badge>))}</div></CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Premium readable report document */}
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-card/80">
                <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Analysis Report</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-6 prose prose-sm max-w-none dark:prose-invert lg:p-8">
                  <ErrorBoundary fallback={<div className="rounded-md border border-border bg-muted/40 p-4"><div className="text-sm font-medium text-foreground">Report content couldn't be displayed.</div><div className="mt-1 text-sm text-muted-foreground">You can still download the raw report text.</div><div className="mt-3"><Button variant="outline" size="sm" onClick={handleDownload}><Download className="h-3 w-3 mr-1" />Download raw text</Button></div></div>}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.report_content}</ReactMarkdown>
                    {includeSources && report.sources_content && <div className="mt-8 border-t pt-6"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.sources_content}</ReactMarkdown></div>}
                  </ErrorBoundary>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Publishing/export control panel */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Publishing & Export</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm"><TrendingUp className="h-3.5 w-3.5" />Include scoring</span><Switch checked={includeScoring} onCheckedChange={setIncludeScoring} /></div>
                  <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm"><Link className="h-3.5 w-3.5" />Include sources</span><Switch checked={includeSources} onCheckedChange={setIncludeSources} /></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-sm">Charts</span><Switch checked={includeCharts} onCheckedChange={setIncludeCharts} /></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-sm">Sparklines</span><Switch checked={includeSparklines} onCheckedChange={setIncludeSparklines} /></div>
                  <div className="flex items-center justify-between gap-3"><span className="text-sm">Hero images</span><Switch checked={includeHeroImages} onCheckedChange={setIncludeHeroImages} /></div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setHeroDialogOpen(true)}><Images className="h-3.5 w-3.5 mr-1" />Manage hero images</Button>
                </div>
                <div className="grid gap-2">
                  <ErrorBoundary fallback={<div className="text-sm text-muted-foreground">PDF tools are unavailable.</div>}><ClientPDFGenerator ref={pdfGeneratorRef} report={report} includeSources={includeSources} includeScoring={includeScoring} /></ErrorBoundary>
                  <PremiumPdfButton reportId={report.id} propertyAddress={report.property_address} includeCharts={includeCharts} includeHeroImages={includeHeroImages} includeSparklines={includeSparklines} designOptions={pdfDesignOptions} />
                  <RegenerateWithPerplexityButton reportId={report.id} propertyAddress={report.property_address} onRegenerated={handleReportUpdate} variant="default" size="sm" />
                  <PremiumPdfDesignPanel value={pdfDesignOptions} onChange={setPdfDesignOptions} />
                  <Button variant="outline" size="sm" onClick={handleDownload}><Download className="h-4 w-4 mr-1" />Download raw text</Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Editor Modal */}
      <InvestmentReportEditor
        report={report}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(updatedReport) => {
          // Immutably update state so PDF generator receives fresh data
          setReport(updatedReport);
        }}
      />

      {/* Override Modal */}
      <ManualDataOverrideModal
        report={report}
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        onSave={handleReportUpdate}
      />

      {/* Send to Client Modal */}
      <SendToClientModal
        isOpen={sendToClientOpen}
        onClose={() => setSendToClientOpen(false)}
        reportId={report.id}
        reportTitle={report.property_address}
        reportTier={report.report_tier || undefined}
        storagePath={report.pdf_url || null}
        onGeneratePDF={async () => {
          if (pdfGeneratorRef.current) {
            const url = await pdfGeneratorRef.current.generateAndUpload();
            if (url) {
              setReport((prev) => prev ? { ...prev, pdf_url: url } : prev);
            }
            return url;
          }
          return null;
        }}
      />

      {/* Hero Image Studio */}
      <HeroImageStudio
        reportId={report.id}
        open={heroDialogOpen}
        onOpenChange={setHeroDialogOpen}
      />
    </div>
  );
}
