import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, History, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { generateMarketIntelligencePDF, type MarketIntelligenceReportData } from './MarketIntelligencePDFGenerator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MarketIntelligenceHistoryModal } from './MarketIntelligenceHistoryModal';

export function MarketIntelligenceExportButton() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [includeNpcStrategy, setIncludeNpcStrategy] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress('Fetching live market data...');
    const toastId = toast.loading('Generating Market Intelligence Report...', {
      description: 'Pulling live data from 6 sources — this may take 30-60 seconds.',
    });

    try {
      setProgress('Analysing RBA, housing, sentiment & economic data...');
      const { data, error } = await invokeSecureFunction('generate-market-intelligence-report', {
        report_type: 'full',
        audience_segment: 'general',
        include_npc_strategy: includeNpcStrategy,
      });

      if (error) throw new Error(error.message || 'Failed to generate report data');
      if (!data?.reportData) throw new Error('No report data returned');

      const reportData: MarketIntelligenceReportData = data.reportData;

      setProgress('Building premium PDF report...');
      const pdfBlob = await generateMarketIntelligencePDF(reportData);

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
    <div className="flex items-center gap-1.5">
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
            <span className="text-xs">Generate Report</span>
          </>
        )}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isGenerating}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-3">
            <p className="text-sm font-medium">Report Options</p>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="npc-strategy-toggle" className="text-xs leading-tight cursor-pointer">
                Include NPC Strategic Approach
                <span className="block text-muted-foreground text-[10px] mt-0.5">
                  Proprietary methodology section
                </span>
              </Label>
              <Switch
                id="npc-strategy-toggle"
                checked={includeNpcStrategy}
                onCheckedChange={setIncludeNpcStrategy}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setHistoryOpen(true)}
      >
        <History className="h-3.5 w-3.5" />
      </Button>

      <MarketIntelligenceHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
