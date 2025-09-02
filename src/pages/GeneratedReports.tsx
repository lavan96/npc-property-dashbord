import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Download, Eye, FileText, Calendar, BarChart3 } from 'lucide-react';
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

export default function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

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
        <Badge variant="secondary">{reports.length} reports</Badge>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="text-6xl text-muted-foreground">📊</div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No reports generated yet</h3>
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
    </div>
  );
}