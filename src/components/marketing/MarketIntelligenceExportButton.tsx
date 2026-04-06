import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { generateMarketIntelligencePDF, type MarketIntelligenceReportData } from './MarketIntelligencePDFGenerator';

export function MarketIntelligenceExportButton() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress('Fetching live market data...');
    const toastId = toast.loading('Generating Market Intelligence Report...', {
      description: 'Pulling live data from 6 sources — this may take 30-60 seconds.',
    });

    try {
      // Step 1: Call edge function to fetch all 6 data layers
      setProgress('Analysing RBA, housing, sentiment & economic data...');
      const { data, error } = await invokeSecureFunction('generate-market-intelligence-report', { report_type: 'full', audience_segment: 'general' });

      if (error) throw new Error(error.message || 'Failed to generate report data');
      if (!data?.reportData) throw new Error('No report data returned');

      const reportData: MarketIntelligenceReportData = data.reportData;

      // Step 2: Generate PDF client-side
      setProgress('Building premium PDF report...');
      const pdfBlob = await generateMarketIntelligencePDF(reportData);

      // Step 3: Download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Market_Intelligence_Report_${reportData.reportPeriod.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Market Intelligence Report generated!', {
        id: toastId,
        description: `${reportData.reportPeriod} — PDF downloaded successfully.`,
      });
    } catch (err) {
      console.error('Market Intelligence Report generation failed:', err);
      toast.error('Report generation failed', {
        id: toastId,
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  return (
    <Button
      onClick={handleGenerate}
      disabled={isGenerating}
      variant="outline"
      size="sm"
      className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">{progress || 'Generating...'}</span>
        </>
      ) : (
        <>
          <FileText className="h-3.5 w-3.5" />
          <span className="text-xs">Generate Market Report</span>
        </>
      )}
    </Button>
  );
}
