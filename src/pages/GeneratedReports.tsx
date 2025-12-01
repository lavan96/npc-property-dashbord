import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InvestmentReportViewer } from '@/components/reports/InvestmentReportViewer';
import { ClientPDFGenerator } from '@/components/reports/ClientPDFGenerator';
import { ComparisonBasket } from '@/components/reports/ComparisonBasket';
import { PropertyComparisonModal } from '@/components/reports/PropertyComparisonModal';
import { ComparisonViewer } from '@/components/reports/ComparisonViewer';
import { useComparison } from '@/contexts/ComparisonContext';
import { format } from 'date-fns';
import { Download, Eye, FileText, Calendar, BarChart3, TrendingUp, MapPin, History, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RegenerateReportButton } from '@/components/reports/RegenerateReportButton';
import { ReportVersionHistory } from '@/components/reports/ReportVersionHistory';
import { ManualDataOverrideModal } from '@/components/reports/ManualDataOverrideModal';

interface GeneratedReport {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  listing_count: number;
  chart_images: any;
  kpis: any;
  analytics: any;
  insights: any;
  config: any;
}

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content: string;
  created_at: string;
  current_version: number;
  status?: string;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
}

interface ComparisonAnalysis {
  id: string;
  property_count: number;
  property_addresses?: string[];
  property_states?: string[];
  report_title?: string;
  report_ids: string[];
  created_at: string;
  analysis_summary: string | null;
  executive_summary: string | null;
  rankings: any;
  recommendations: any;
  financial_comparison: any;
  location_comparison: any;
  risk_comparison: any;
  red_flags: any;
}

export default function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [investmentReports, setInvestmentReports] = useState<InvestmentReport[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonAnalysis[]>([]);
  const [selectedInvestmentReport, setSelectedInvestmentReport] = useState<InvestmentReport | null>(null);
  const [selectedComparison, setSelectedComparison] = useState<ComparisonAnalysis | null>(null);
  const [investmentViewerOpen, setInvestmentViewerOpen] = useState(false);
  const [comparisonViewerOpen, setComparisonViewerOpen] = useState(false);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [selectedReportForHistory, setSelectedReportForHistory] = useState<InvestmentReport | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedReportForOverride, setSelectedReportForOverride] = useState<InvestmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Search states
  const [investmentPage, setInvestmentPage] = useState(1);
  const [investmentSearchQuery, setInvestmentSearchQuery] = useState('');
  const reportsPerPage = 9;
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedReports, addReport, removeReport, isSelected, canAddMore } = useComparison();

  // Filter and paginate investment reports
  const filteredInvestmentReports = investmentReports.filter(report =>
    report.property_address.toLowerCase().includes(investmentSearchQuery.toLowerCase())
  );
  
  const totalInvestmentPages = Math.ceil(filteredInvestmentReports.length / reportsPerPage);
  const paginatedInvestmentReports = filteredInvestmentReports.slice(
    (investmentPage - 1) * reportsPerPage,
    investmentPage * reportsPerPage
  );

  useEffect(() => {
    fetchReports();
    fetchInvestmentReports();
    fetchComparisons();

    // Listen for custom event to refresh comparisons
    const handleRefreshComparisons = () => {
      console.log('📊 Refreshing comparisons from event');
      fetchComparisons();
    };

    window.addEventListener('refreshComparisons', handleRefreshComparisons);
    return () => {
      window.removeEventListener('refreshComparisons', handleRefreshComparisons);
    };
  }, []);

  // Handle opening a specific report after data is loaded
  useEffect(() => {
    if (!loading && investmentReports.length > 0) {
      const openReportId = localStorage.getItem('openReportId');
      if (openReportId) {
        localStorage.removeItem('openReportId');
        const report = investmentReports.find(r => r.id === openReportId);
        if (report) {
          handleViewInvestmentReport(report);
        }
      }
    }
  }, [loading, investmentReports]);

  useEffect(() => {
    // Listen for custom event to open a specific report
    const handleOpenReport = (event: CustomEvent) => {
      const { reportId } = event.detail;
      const report = investmentReports.find(r => r.id === reportId);
      if (report) {
        handleViewInvestmentReport(report);
      }
    };

    window.addEventListener('openReport', handleOpenReport as EventListener);
    return () => {
      window.removeEventListener('openReport', handleOpenReport as EventListener);
    };
  }, [investmentReports]); // Keep this separate for event handling

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reports:', error);
        toast({
          title: "Error fetching reports",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setReports(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestmentReports = async () => {
    try {
      console.log('🔍 Fetching investment reports...');
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, property_listing_id, report_content, created_at, current_version, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence')
        .in('status', ['completed', 'pending']) // Show both completed and pending reports
        .order('created_at', { ascending: false });

      console.log('📊 Investment reports response:', { data, error, count: data?.length });

      if (error) {
        console.error('❌ Error fetching investment reports:', error);
        toast({
          title: "Error fetching investment reports",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Setting investment reports:', data?.length || 0);
      setInvestmentReports(data || []);
    } catch (error) {
      console.error('💥 Exception:', error);
      toast({
        title: "Error",
        description: "Failed to fetch investment reports",
        variant: "destructive",
      });
    }
  };

  const fetchComparisons = async () => {
    try {
      // Cast to any to bypass TypeScript for property_comparisons table
      const { data, error } = await (supabase as any)
        .from('property_comparisons')
        .select('id, property_count, property_addresses, property_states, report_title, report_ids, created_at, analysis_summary, executive_summary, rankings, recommendations, financial_comparison, location_comparison, risk_comparison, red_flags')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comparisons:', error);
        toast({
          title: "Error fetching comparisons",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setComparisons((data || []) as ComparisonAnalysis[]);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleViewInvestmentReport = (report: InvestmentReport) => {
    setSelectedInvestmentReport(report);
    setInvestmentViewerOpen(true);
  };

  const handleInvestmentReportUpdate = () => {
    // Refresh the investment reports list
    fetchInvestmentReports();
  };

  const handleComparisonUpdate = () => {
    // Refresh the comparisons list
    fetchComparisons();
  };

  const handleViewVersionHistory = (report: InvestmentReport) => {
    setSelectedReportForHistory(report);
    setVersionHistoryOpen(true);
  };

  const handleOpenOverrideModal = (report: InvestmentReport) => {
    setSelectedReportForOverride(report);
    setOverrideModalOpen(true);
  };

  const handleOverrideSave = () => {
    // Refresh reports after override
    fetchInvestmentReports();
  };

  const handleToggleSelection = (report: InvestmentReport, checked: boolean) => {
    if (checked) {
      addReport({
        id: report.id,
        property_address: report.property_address,
        created_at: report.created_at
      });
    } else {
      removeReport(report.id);
    }
  };

  const handleCompare = () => {
    if (selectedReports.length < 2) {
      toast({
        title: "Select More Properties",
        description: "Please select at least 2 properties to compare.",
        variant: "destructive",
      });
      return;
    }
    setComparisonModalOpen(true);
  };

  const handleViewReport = (reportId: string) => {
    navigate(`/generated-reports/${reportId}`);
  };

  const handleDownloadPDF = async (report: GeneratedReport) => {
    try {
      // Navigate to the report view with a download flag
      navigate(`/generated-reports/${report.id}?download=true`);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download failed",
        description: "Could not generate PDF download",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Generated Reports</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Generated Reports</h2>
          <p className="text-muted-foreground">
            View and download your generated property reports
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{reports.length} quantitative reports</Badge>
          <Badge variant="outline">{investmentReports.length} investment reports</Badge>
        </div>
      </div>

      <Tabs defaultValue="quantitative" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quantitative" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Quantitative Reports
          </TabsTrigger>
          <TabsTrigger value="investment" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Investment Reports
          </TabsTrigger>
          <TabsTrigger value="comparisons" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Comparison Analyses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quantitative" className="space-y-4">
          {reports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">📊</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No quantitative reports generated yet</h3>
                  <p className="text-muted-foreground">
                    Generate your first report from the Reports page
                  </p>
                </div>
                <Button onClick={() => navigate('/reports')} className="mt-4">
                  <FileText className="mr-2 h-4 w-4" />
                  Go to Reports
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {reports.map((report) => (
                <Card key={report.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-start justify-between">
                      <span className="line-clamp-2">{report.title}</span>
                      <BarChart3 className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                    </CardTitle>
                    {report.description && (
                      <CardDescription className="line-clamp-2">
                        {report.description}
                      </CardDescription>
                    )}
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Generated on {format(new Date(report.created_at), 'PPp')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Listings analyzed:</span>
                        <Badge variant="outline">{report.listing_count}</Badge>
                      </div>
                      {report.kpis && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Avg. Price:</span>
                          <span className="font-medium">
                            ${report.kpis.avg_price?.toLocaleString() || 'N/A'}
                          </span>
                        </div>
                      )}
                      {report.analytics?.quality && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Data Quality:</span>
                          <span className="font-medium">
                            {report.analytics.quality.avg_confidence?.toFixed(1) || 'N/A'}%
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewReport(report.id)}
                        className="flex-1"
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleDownloadPDF(report)}
                        className="flex-1"
                      >
                        <Download className="mr-1 h-3 w-3" />
                        PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="investment" className="space-y-4">
          {/* Search Bar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search by property address..."
                value={investmentSearchQuery}
                onChange={(e) => {
                  setInvestmentSearchQuery(e.target.value);
                  setInvestmentPage(1); // Reset to first page on search
                }}
              />
            </div>
            <Badge variant="secondary">
              {filteredInvestmentReports.length} of {investmentReports.length} reports
            </Badge>
          </div>

          {filteredInvestmentReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">🏠</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No investment reports generated yet</h3>
                  <p className="text-muted-foreground">
                    Generate your first investment report from a property listing
                  </p>
                </div>
                <Button onClick={() => navigate('/listings')} className="mt-4">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Go to Listings
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {paginatedInvestmentReports.map((report) => (
                <Card key={report.id} className="overflow-hidden hover:shadow-lg transition-shadow relative">
                  <div className="absolute top-4 right-4 z-10">
                    <Checkbox
                      checked={isSelected(report.id)}
                      onCheckedChange={(checked) => handleToggleSelection(report, checked as boolean)}
                      disabled={!canAddMore && !isSelected(report.id)}
                      className="h-5 w-5 bg-background border-2"
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-start justify-between pr-8">
                      <span className="line-clamp-2">{report.property_address}</span>
                      <div className="flex items-center gap-2">
                        {report.status === 'pending' && (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                        <TrendingUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Generated on {format(new Date(report.created_at), 'PPp')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">{report.property_address}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Report content: {report.report_content.length > 100 ? `${report.report_content.substring(0, 100)}...` : report.report_content.substring(0, 100)}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleViewInvestmentReport(report)}
                          className="flex-1"
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={() => {
                            // Download as text or PDF
                            const blob = new Blob([report.report_content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `investment-report-${report.property_address.replace(/[^a-zA-Z0-9]/g, '-')}-${format(new Date(report.created_at), 'yyyy-MM-dd')}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="flex-1"
                        >
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </Button>
                      </div>
                       <div className="flex gap-2">
                        <RegenerateReportButton
                          reportId={report.id}
                          propertyAddress={report.property_address}
                          onRegenerated={handleInvestmentReportUpdate}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewVersionHistory(report)}
                          className="flex-1"
                        >
                          <History className="mr-1 h-3 w-3" />
                          History ({report.current_version || 1})
                        </Button>
                      </div>
                      <ClientPDFGenerator report={report} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalInvestmentPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestmentPage(p => Math.max(1, p - 1))}
                  disabled={investmentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {investmentPage} of {totalInvestmentPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestmentPage(p => Math.min(totalInvestmentPages, p + 1))}
                  disabled={investmentPage === totalInvestmentPages}
                >
                  Next
                </Button>
              </div>
            )}
            </>
          )}
        </TabsContent>

        <TabsContent value="comparisons" className="space-y-4">
          {comparisons.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">🔄</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No Comparison Analyses Yet</h3>
                  <p className="text-muted-foreground">
                    Select 2-5 investment reports and click "Compare Properties" to create your first comparison analysis
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {comparisons.map((comparison: any) => (
                <Card key={comparison.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      {comparison.report_title || `${comparison.property_count} Property Comparison`}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(comparison.created_at), 'MMM dd, yyyy')}
                      </div>
                      {comparison.property_states && comparison.property_states.length > 0 && (
                        <div className="text-xs">
                          States: {comparison.property_states.join(', ')}
                        </div>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {comparison.executive_summary && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {comparison.executive_summary}
                      </p>
                    )}
                    {comparison.rankings && comparison.rankings.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Top Ranked:</p>
                        <Badge variant="default">
                          {comparison.rankings[0]?.address || `Property #${comparison.rankings[0]?.propertyNumber}`}
                        </Badge>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedComparison(comparison);
                          setComparisonViewerOpen(true);
                        }}
                        className="flex-1"
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ComparisonBasket onCompare={handleCompare} />

      <PropertyComparisonModal
        isOpen={comparisonModalOpen}
        onClose={() => {
          setComparisonModalOpen(false);
          handleComparisonUpdate(); // Refresh comparisons when modal closes
        }}
        reportIds={selectedReports.map(r => r.id)}
        propertyAddresses={selectedReports.map(r => r.property_address)}
      />

      <InvestmentReportViewer
        report={selectedInvestmentReport}
        isOpen={investmentViewerOpen}
        onClose={() => {
          setInvestmentViewerOpen(false);
          setSelectedInvestmentReport(null);
        }}
        onReportUpdate={handleInvestmentReportUpdate}
        onOpenOverride={() => {
          if (selectedInvestmentReport) {
            handleOpenOverrideModal(selectedInvestmentReport);
          }
        }}
      />

      <ComparisonViewer
        comparison={selectedComparison}
        isOpen={comparisonViewerOpen}
        onClose={() => {
          setComparisonViewerOpen(false);
          setSelectedComparison(null);
        }}
      />

      {selectedReportForHistory && (
        <ReportVersionHistory
          reportId={selectedReportForHistory.id}
          currentVersion={selectedReportForHistory.current_version || 1}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
        />
      )}

      <ManualDataOverrideModal
        report={selectedReportForOverride}
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        onSave={handleOverrideSave}
      />
    </div>
  );
}