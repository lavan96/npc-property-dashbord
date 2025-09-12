import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Download, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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
  const [isCopied, setIsCopied] = useState(false);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const { toast } = useToast();

  const generateReport = async () => {
    setIsGenerating(true);
    setHasStartedGeneration(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-investment-report', {
        body: {
          propertyAddress,
          propertyDetails
        }
      });

      if (error) {
        console.error('Error generating report:', error);
        throw new Error(error.message || 'Failed to generate investment report');
      }

      if (!data?.reportContent) {
        throw new Error('No report content received');
      }

      setReportContent(data.reportContent);
      toast({
        title: "Investment Report Generated",
        description: "Your comprehensive property analysis is ready.",
      });
    } catch (error) {
      console.error('Report generation failed:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate investment report. Please try again.",
        variant: "destructive",
      });
      // Reset states on error so user can try again
      setHasStartedGeneration(false);
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

  const handleClose = () => {
    // Only allow closing if not currently generating
    if (isGenerating) {
      return;
    }
    
    // Reset all states when closing
    setReportContent('');
    setIsGenerating(false);
    setHasStartedGeneration(false);
    setIsCopied(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => {
        // Prevent closing modal when clicking outside during generation
        if (isGenerating) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Property Investment Analysis</DialogTitle>
          <DialogDescription>
            Comprehensive investment report for {propertyAddress}
          </DialogDescription>
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
                <Button onClick={generateReport} size="lg" disabled={isGenerating}>
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
                    <p className="text-muted-foreground">
                      Analyzing property data and market conditions...
                      <br />
                      <span className="text-sm">This may take up to 30 seconds</span>
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-destructive">Generation Failed</h3>
                    <p className="text-muted-foreground">
                      There was an error generating your report. Please try again.
                    </p>
                    <Button onClick={generateReport} variant="outline" size="lg">
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
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                >
                  Close Report
                </Button>
              </div>

              <ScrollArea className="flex-1 border rounded-lg p-4">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                    {reportContent}
                  </pre>
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}