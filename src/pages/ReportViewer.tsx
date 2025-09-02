import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Download, ArrowLeft, Building2, DollarSign, MapPin, Calendar, TrendingUp, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
  chart_urls: any;
}

interface ChartData {
  id: string;
  chart_type: string;
  title: string;
  image_data: string;
  created_at: string;
}

export default function ReportViewer() {
  const { reportId } = useParams<{ reportId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [charts, setCharts] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const shouldAutoDownload = searchParams.get('download') === 'true';

  useEffect(() => {
    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  useEffect(() => {
    if (shouldAutoDownload && report && charts.length > 0) {
      handleDownloadPDF();
    }
  }, [shouldAutoDownload, report, charts]);

  const fetchReport = async () => {
    try {
      // Fetch report data
      const { data: reportData, error: reportError } = await supabase
        .from('generated_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError) {
        console.error('Error fetching report:', reportError);
        toast({
          title: "Error fetching report",
          description: reportError.message,
          variant: "destructive",
        });
        return;
      }

      setReport(reportData);

      // Fetch associated charts
      const { data: chartsData, error: chartsError } = await supabase
        .from('charts')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });

      if (chartsError) {
        console.error('Error fetching charts:', chartsError);
      } else {
        setCharts(chartsData || []);
      }

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!report || !reportRef.current) return;
    
    setDownloading(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;
      let yPosition = margin;

      // Add title
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(report.title, margin, yPosition);
      yPosition += 15;

      // Add metadata
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated on: ${format(new Date(report.created_at), 'PPP')}`, margin, yPosition);
      yPosition += 5;
      pdf.text(`Listings analyzed: ${report.listing_count}`, margin, yPosition);
      yPosition += 15;

      // Add description if available
      if (report.description) {
        pdf.setFontSize(12);
        pdf.text('Description:', margin, yPosition);
        yPosition += 8;
        pdf.setFontSize(10);
        const splitDescription = pdf.splitTextToSize(report.description, contentWidth);
        pdf.text(splitDescription, margin, yPosition);
        yPosition += splitDescription.length * 5 + 10;
      }

      // Add KPIs section
      if (report.kpis) {
        if (yPosition > pageHeight - 60) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Key Performance Indicators', margin, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        const kpiText = [
          `Total Listings: ${report.kpis.total_listings?.toLocaleString() || 'N/A'}`,
          `Average Price: $${report.kpis.avg_price?.toLocaleString() || 'N/A'}`,
          `Recent Listings (30d): ${report.kpis.recent_30d?.toLocaleString() || 'N/A'}`,
          `Unique Suburbs: ${report.kpis.unique_suburbs?.toLocaleString() || 'N/A'}`
        ];
        
        kpiText.forEach(text => {
          pdf.text(text, margin, yPosition);
          yPosition += 7;
        });
        yPosition += 15;
      }

      // Add analytics section
      if (report.analytics) {
        if (yPosition > pageHeight - 50) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Analytics Summary', margin, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        if (report.analytics.velocity) {
          pdf.text(`Market Velocity: ${report.analytics.velocity.label}`, margin, yPosition);
          yPosition += 7;
        }
        if (report.analytics.quality) {
          pdf.text(`Average Data Confidence: ${report.analytics.quality.avg_confidence?.toFixed(1) || 'N/A'}%`, margin, yPosition);
          yPosition += 7;
        }
        if (report.analytics.coverage) {
          pdf.text(`Market Coverage: ${report.analytics.coverage.saturation} saturation`, margin, yPosition);
          yPosition += 7;
        }
        yPosition += 15;
      }

      // Add charts with improved rendering
      for (let i = 0; i < charts.length; i++) {
        const chart = charts[i];
        
        // Calculate space needed for chart (title + image + margin)
        const chartSpaceNeeded = 120; // Approximate space for chart title + image + margins
        
        // Check if we need a new page
        if (yPosition > pageHeight - chartSpaceNeeded) {
          pdf.addPage();
          yPosition = margin;
        }

        // Add chart title
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(chart.title, margin, yPosition);
        yPosition += 12;

        // Add chart image with improved sizing
        try {
          if (chart.image_data.startsWith('data:image/svg+xml;base64,')) {
            // Create a temporary container for the SVG
            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '-9999px';
            tempContainer.style.width = '800px';
            tempContainer.style.height = '600px';
            tempContainer.style.backgroundColor = '#ffffff';
            tempContainer.style.padding = '20px';
            tempContainer.style.boxSizing = 'border-box';
            
            // Decode and clean up SVG content
            let svgContent = atob(chart.image_data.replace('data:image/svg+xml;base64,', ''));
            
            // Ensure SVG has proper sizing attributes
            svgContent = svgContent.replace(/<svg[^>]*>/, (match) => {
              return '<svg width="760" height="560" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" style="background: white; display: block;">';
            });
            
            tempContainer.innerHTML = svgContent;
            document.body.appendChild(tempContainer);

            // Give the SVG time to render
            await new Promise(resolve => setTimeout(resolve, 100));

            // Convert to canvas with high quality settings
            const canvas = await html2canvas(tempContainer, {
              backgroundColor: '#ffffff',
              scale: 2,
              width: 800,
              height: 600,
              useCORS: true,
              allowTaint: true,
              scrollX: 0,
              scrollY: 0
            });
            
            // Clean up
            document.body.removeChild(tempContainer);
            
            // Calculate optimal size for PDF
            const maxWidth = contentWidth;
            const maxHeight = 90; // Max height for chart in PDF
            
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const aspectRatio = canvasWidth / canvasHeight;
            
            let pdfWidth = maxWidth;
            let pdfHeight = pdfWidth / aspectRatio;
            
            // If height is too large, scale down based on height
            if (pdfHeight > maxHeight) {
              pdfHeight = maxHeight;
              pdfWidth = pdfHeight * aspectRatio;
            }
            
            // Center the image horizontally
            const xPosition = margin + (contentWidth - pdfWidth) / 2;
            
            // Convert canvas to image and add to PDF
            const imgData = canvas.toDataURL('image/png', 1.0);
            pdf.addImage(imgData, 'PNG', xPosition, yPosition, pdfWidth, pdfHeight);
            yPosition += pdfHeight + 20;
            
          } else {
            // Handle regular image data
            const maxWidth = contentWidth;
            const maxHeight = 90;
            
            // Add image with proper sizing
            const xPosition = margin;
            pdf.addImage(chart.image_data, 'PNG', xPosition, yPosition, maxWidth, maxHeight);
            yPosition += maxHeight + 20;
          }
        } catch (error) {
          console.error('Error adding chart to PDF:', error);
          pdf.setFontSize(10);
          pdf.setTextColor(255, 0, 0);
          pdf.text('Chart could not be rendered', margin, yPosition);
          pdf.setTextColor(0, 0, 0);
          yPosition += 15;
        }
      }

      // Add insights if available
      if (report.insights && Array.isArray(report.insights) && report.insights.length > 0) {
        // Ensure we have space for the insights section
        if (yPosition > pageHeight - 60) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Key Insights', margin, yPosition);
        yPosition += 15;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        
        report.insights.forEach((insight: string, index: number) => {
          if (yPosition > pageHeight - margin - 15) {
            pdf.addPage();
            yPosition = margin;
          }
          
          const bulletText = `• ${insight}`;
          const splitText = pdf.splitTextToSize(bulletText, contentWidth);
          pdf.text(splitText, margin, yPosition);
          yPosition += splitText.length * 5 + 5;
        });
      }

      // Save the PDF
      const fileName = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      pdf.save(fileName);
      
      toast({
        title: "PDF Downloaded",
        description: `Report saved as ${fileName}`,
      });

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Download failed",
        description: "Could not generate PDF download",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2"></div>
          <div className="h-4 bg-muted rounded w-1/4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold">Report not found</h2>
          <p className="text-muted-foreground mt-2">The requested report could not be found.</p>
          <Button onClick={() => navigate('/generated-reports')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/generated-reports')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{report.title}</h1>
            {report.description && (
              <p className="text-muted-foreground mt-1">{report.description}</p>
            )}
          </div>
        </div>
        <Button 
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {downloading ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {/* Report Content */}
      <div ref={reportRef} className="space-y-6">
        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Report Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Generated</p>
              <p className="font-medium">{format(new Date(report.created_at), 'PPp')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Listings Analyzed</p>
              <p className="font-medium">{report.listing_count.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Charts Generated</p>
              <p className="font-medium">{charts.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant="default">Complete</Badge>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        {report.kpis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Key Performance Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">{report.kpis.total_listings?.toLocaleString() || 'N/A'}</p>
                <p className="text-sm text-muted-foreground">Total Listings</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">${report.kpis.avg_price?.toLocaleString() || 'N/A'}</p>
                <p className="text-sm text-muted-foreground">Average Price</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">{report.kpis.recent_30d?.toLocaleString() || 'N/A'}</p>
                <p className="text-sm text-muted-foreground">Recent (30d)</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">{report.kpis.unique_suburbs?.toLocaleString() || 'N/A'}</p>
                <p className="text-sm text-muted-foreground">Unique Suburbs</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics Summary */}
        {report.analytics && (
          <Card>
            <CardHeader>
              <CardTitle>Analytics Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.analytics.velocity && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Market Velocity:</span>
                  <Badge variant={report.analytics.velocity.label === 'Uptrend' ? 'default' : 'secondary'}>
                    {report.analytics.velocity.label}
                  </Badge>
                </div>
              )}
              {report.analytics.quality && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Average Data Confidence:</span>
                  <span className="font-medium">{report.analytics.quality.avg_confidence?.toFixed(1) || 'N/A'}%</span>
                </div>
              )}
              {report.analytics.coverage && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Market Saturation:</span>
                  <Badge variant="outline">{report.analytics.coverage.saturation}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        {charts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generated Charts</CardTitle>
              <CardDescription>Visual analysis from your data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                {charts.map((chart) => (
                  <div key={chart.id} className="space-y-2">
                    <h4 className="font-medium">{chart.title}</h4>
                    <div className="bg-white p-4 rounded-lg border">
                      <div className="w-full h-64 overflow-hidden flex items-center justify-center">
                        {chart.image_data.startsWith('data:image/svg+xml;base64,') ? (
                          <div 
                            dangerouslySetInnerHTML={{
                              __html: (() => {
                                try {
                                  let svgContent = atob(chart.image_data.replace('data:image/svg+xml;base64,', ''));
                                  if (svgContent.includes('<svg') && svgContent.includes('</svg>')) {
                                    // Force the SVG to fit within container
                                    svgContent = svgContent
                                      .replace(/<svg[^>]*>/, (match) => {
                                        const widthMatch = match.match(/width=["'](\d+)["']/);
                                        const heightMatch = match.match(/height=["'](\d+)["']/);
                                        const viewBoxMatch = match.match(/viewBox=["']([^"']*)["']/);
                                        
                                        let viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 800 600';
                                        if (!viewBoxMatch && widthMatch && heightMatch) {
                                          viewBox = `0 0 ${widthMatch[1]} ${heightMatch[1]}`;
                                        }
                                        
                                        return `<svg viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="max-width: 100%; max-height: 100%;">`;
                                      });
                                    return svgContent;
                                  }
                                  return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ef4444;">Chart rendering error</div>';
                                } catch (error) {
                                  return '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ef4444;">Chart rendering error</div>';
                                }
                              })()
                            }}
                            className="w-full h-full"
                          />
                        ) : (
                          <img
                            src={chart.image_data}
                            alt={`${chart.title} chart`}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Insights */}
        {report.insights && Array.isArray(report.insights) && report.insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
              <CardDescription>Generated insights from the analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.insights.map((insight: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-1">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}