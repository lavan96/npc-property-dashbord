import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Download, Copy, Check, Eye, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/contexts/NotificationsContext';
import jsPDF from 'jspdf';

interface InvestmentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyAddress: string;
  propertyDetails?: any;
}

export function InvestmentReportModal({ 
  isOpen, 
  onClose, 
  propertyAddress, 
  propertyDetails 
}: InvestmentReportModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportContent, setReportContent] = useState<string>('');
  const [sourcesContent, setSourcesContent] = useState<string>('');
  const [reportId, setReportId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const [enhancedData, setEnhancedData] = useState<any>(null);
  const [isBackgroundGeneration, setIsBackgroundGeneration] = useState(false);
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();

  const generateReport = async (runInBackground = false) => {
    setIsGenerating(true);
    setHasStartedGeneration(true);
    
    if (runInBackground) {
      setIsBackgroundGeneration(true);
      toast({
        title: "Generating in Background",
        description: "Report generation started. You'll be notified when complete.",
      });
      // Close modal if running in background
      handleClose();
    }
    
    try {
      console.log('Calling generate-investment-report with:', { propertyAddress, propertyDetails });
      
      const { data, error } = await supabase.functions.invoke('generate-investment-report', {
        body: {
          propertyAddress,
          propertyDetails
        }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to generate investment report');
      }

      if (!data) {
        console.error('No data returned from edge function');
        throw new Error('No data returned from edge function');
      }

      // Check if the response indicates an error
      if (data.success === false) {
        console.error('Report generation failed:', data.error);
        throw new Error(data.error || 'Report generation failed');
      }

      // Check if we have the required report content
      if (!data.reportContent) {
        console.error('No report content in response');
        throw new Error('No report content received');
      }

      setReportContent(data.reportContent);
      setSourcesContent(data.sourcesContent || '');
      setEnhancedData(data.enhancedData || null);
      
      // Save report to database with enhanced data
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: savedReport, error: saveError } = await supabase
            .from('investment_reports')
            .insert({
              property_address: propertyAddress,
              property_listing_id: propertyDetails?.id || null,
              report_content: data.reportContent,
              sources_content: data.sourcesContent || '',
              generated_by: user.id,
              location_intelligence: data.enhancedData?.locationIntelligence || null,
              investment_score: data.enhancedData?.investmentScore || null,
              financial_calculations: data.enhancedData?.financials || null,
              demographics_data: data.enhancedData?.demographics || null,
              economic_data: data.enhancedData?.economics || null
            })
            .select()
            .single();
          
          if (!saveError && savedReport) {
            setReportId(savedReport.id);
            console.log('Report saved with ID:', savedReport.id);
          } else if (saveError) {
            console.error('Error saving report:', saveError);
          }
        }
      } catch (error) {
        console.log('Could not save report to database:', error);
      }
      
      if (runInBackground) {
        addNotification({
          type: 'report_generated',
          title: 'Investment Report Generated',
          message: `Report for ${propertyAddress} is ready to view.`,
          reportId: reportId || undefined
        });
      } else {
        toast({
          title: "Investment Report Generated",
          description: "Your comprehensive property analysis is ready.",
        });
      }
    } catch (error) {
      console.error('Report generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error details:', errorMessage);
      
      if (runInBackground) {
        addNotification({
          type: 'report_failed',
          title: 'Report Generation Failed',
          message: `Failed to generate report for ${propertyAddress}: ${errorMessage}`
        });
      } else {
        toast({
          title: "Generation Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
      // Reset states on error so user can try again
      setHasStartedGeneration(false);
      setIsBackgroundGeneration(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reportContent);
      setIsCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Investment report copied successfully.",
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy report to clipboard.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - (margin * 2);
      
      // Add title
      pdf.setFontSize(16);
      pdf.setFont(undefined, 'bold');
      pdf.text('Property Investment Analysis', margin, 30);
      
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Property: ${propertyAddress}`, margin, 45);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 55);
      
      // Add content
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(reportContent, maxWidth);
      
      let yPosition = 70;
      const lineHeight = 6;
      
      lines.forEach((line: string) => {
        if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      
      pdf.save(`investment-report-${propertyAddress.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
      
      toast({
        title: "PDF Downloaded",
        description: "Investment report downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const viewInGeneratedReports = () => {
    // Close this modal and navigate to Generated Reports
    handleClose();
    navigate('/generated-reports');
    
    // Use a small delay to ensure navigation completes
    setTimeout(() => {
      // Trigger opening the report viewer (this would need to be implemented in the Generated Reports page)
      if (reportId) {
        // You could use URL params or localStorage to communicate which report to open
        localStorage.setItem('openReportId', reportId);
        window.dispatchEvent(new CustomEvent('openReport', { detail: { reportId } }));
      }
    }, 100);
  };

  // Custom markdown components for consistent styling
  const markdownComponents = {
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground border-b pb-2">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold mt-6 mb-3 text-primary">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="mb-4 leading-relaxed text-foreground">
        {children}
      </p>
    ),
    ul: ({ children }: any) => (
      <ul className="mb-4 space-y-2 list-disc list-inside ml-4">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="mb-4 space-y-2 list-decimal list-inside ml-4">
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className="text-foreground leading-relaxed">
        {children}
      </li>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-6">
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-muted">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody>
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="border-b border-border">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-border px-4 py-2 text-foreground">
        {children}
      </td>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-muted-foreground">
        {children}
      </em>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    code: ({ children }: any) => (
      <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    pre: ({ children }: any) => (
      <pre className="bg-muted p-4 rounded-lg my-4 overflow-x-auto">
        {children}
      </pre>
    ),
  };

  const handleClose = () => {
    // Allow closing if not generating, or if generating in background
    if (!isGenerating || isBackgroundGeneration) {
      setReportContent('');
      setSourcesContent('');
      setIsGenerating(false);
      setHasStartedGeneration(false);
      setReportId('');
      setIsCopied(false);
      setEnhancedData(null);
      setIsBackgroundGeneration(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => {
        // Allow closing during background generation
        if (isGenerating && !isBackgroundGeneration) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Property Investment Analysis</DialogTitle>
          <DialogDescription>
            Comprehensive investment report for {propertyAddress}
          </DialogDescription>
          {isGenerating && !isBackgroundGeneration && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-12 top-4"
              onClick={() => generateReport(true)}
            >
              Continue in Background
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {!hasStartedGeneration && !reportContent && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4">
                <h3 className="text-lg font-medium">Generate Investment Report</h3>
                <p className="text-muted-foreground max-w-md">
                  Click below to generate a comprehensive property investment analysis 
                  including financial projections, market analysis, and growth potential.
                </p>
                <Button onClick={() => generateReport()} size="lg" disabled={isGenerating}>
                  Generate Analysis
                </Button>
              </div>
            </div>
          )}

          {(hasStartedGeneration && !reportContent) && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <h3 className="text-lg font-medium">Generating Investment Report</h3>
                    <p className="text-muted-foreground mb-2">
                      Analyzing property data and market conditions...
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This may take 2-3 minutes. You can continue in background.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-destructive">Generation Failed</h3>
                    <p className="text-muted-foreground">
                      There was an error generating your report. Please try again.
                    </p>
                    <Button onClick={() => generateReport()} variant="outline" size="lg">
                      Try Again
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {reportContent && (
            <>
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                    disabled={isCopied}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadPDF}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  {reportId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={viewInGeneratedReports}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Report
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                >
                  Close Report
                </Button>
              </div>

              <ScrollArea className="flex-1 border rounded-lg p-6">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {reportContent}
                  </ReactMarkdown>
                  
                  {sourcesContent && (
                    <div className="mt-8 border-t pt-6">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {sourcesContent}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}