import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvestmentReportViewer } from '@/components/reports/InvestmentReportViewer';
import { format } from 'date-fns';
import { Download, Eye, FileText, Calendar, BarChart3, TrendingUp, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
}

export default function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [investmentReports, setInvestmentReports] = useState<InvestmentReport[]>([]);
  const [selectedInvestmentReport, setSelectedInvestmentReport] = useState<InvestmentReport | null>(null);
  const [investmentViewerOpen, setInvestmentViewerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
    fetchInvestmentReports();

    // Listen for custom event to open a specific report
    const handleOpenReport = (event: CustomEvent) => {
      const { reportId } = event.detail;
      const report = investmentReports.find(r => r.id === reportId);
      if (report) {
        handleViewInvestmentReport(report);
      }
    };

    // Check for report ID in localStorage (from navigation)
    const openReportId = localStorage.getItem('openReportId');
    if (openReportId) {
      localStorage.removeItem('openReportId');
      // Need to wait for reports to load first
      setTimeout(() => {
        const report = investmentReports.find(r => r.id === openReportId);
        if (report) {
          handleViewInvestmentReport(report);
        }
      }, 500);
    }

    window.addEventListener('openReport', handleOpenReport as EventListener);
    return () => {
      window.removeEventListener('openReport', handleOpenReport as EventListener);
    };
  }, [investmentReports]);

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
      const { data, error } = await supabase
        .from('investment_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching investment reports:', error);
        toast({
          title: "Error fetching investment reports",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setInvestmentReports(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch investment reports",
        variant: "destructive",
      });
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="quantitative" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Quantitative Reports
          </TabsTrigger>
          <TabsTrigger value="investment" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Investment Reports
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
          {investmentReports.length === 0 ? (
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
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {investmentReports.map((report) => (
                <Card key={report.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-start justify-between">
                      <span className="line-clamp-2">{report.property_address}</span>
                      <TrendingUp className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
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
                    
                    <div className="flex gap-2 pt-2">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <InvestmentReportViewer
        report={selectedInvestmentReport}
        isOpen={investmentViewerOpen}
        onClose={() => {
          setInvestmentViewerOpen(false);
          setSelectedInvestmentReport(null);
        }}
        onReportUpdate={handleInvestmentReportUpdate}
      />
    </div>
  );
}