import { Download, Images, Link, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ClientPDFGenerator } from '@/components/reports/ClientPDFGenerator';
import { PremiumPdfButton } from '@/components/reports/PremiumPdfButton';
import { RegenerateWithPerplexityButton } from '@/components/reports/RegenerateWithPerplexityButton';
import { PremiumPdfDesignPanel } from '@/components/reports/PremiumPdfDesignPanel';
import type { ExportPanelProps } from './types';

export function InvestmentReportExportPanel({
  report,
  includeSources,
  includeScoring,
  includeCharts,
  includeHeroImages,
  includeSparklines,
  pdfDesignOptions,
  pdfGeneratorRef,
  onIncludeSourcesChange,
  onIncludeScoringChange,
  onIncludeChartsChange,
  onIncludeHeroImagesChange,
  onIncludeSparklinesChange,
  onPdfDesignOptionsChange,
  onHeroImagesManage,
  onRegenerated,
  onDownload,
}: ExportPanelProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Publishing & Export</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm"><TrendingUp className="h-3.5 w-3.5" />Include scoring</span><Switch checked={includeScoring} onCheckedChange={onIncludeScoringChange} /></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm"><Link className="h-3.5 w-3.5" />Include sources</span><Switch checked={includeSources} onCheckedChange={onIncludeSourcesChange} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm">Charts</span><Switch checked={includeCharts} onCheckedChange={onIncludeChartsChange} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm">Sparklines</span><Switch checked={includeSparklines} onCheckedChange={onIncludeSparklinesChange} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm">Hero images</span><Switch checked={includeHeroImages} onCheckedChange={onIncludeHeroImagesChange} /></div>
            <Button variant="outline" size="sm" className="w-full" onClick={onHeroImagesManage}><Images className="h-3.5 w-3.5 mr-1" />Manage hero images</Button>
          </div>
          <div className="grid gap-2">
            <ErrorBoundary fallback={<div className="text-sm text-muted-foreground">PDF tools are unavailable.</div>}><ClientPDFGenerator ref={pdfGeneratorRef} report={report} includeSources={includeSources} includeScoring={includeScoring} /></ErrorBoundary>
            <PremiumPdfButton reportId={report.id} propertyAddress={report.property_address} includeCharts={includeCharts} includeHeroImages={includeHeroImages} includeSparklines={includeSparklines} designOptions={pdfDesignOptions} />
            <RegenerateWithPerplexityButton reportId={report.id} propertyAddress={report.property_address} onRegenerated={onRegenerated} variant="default" size="sm" />
            <PremiumPdfDesignPanel value={pdfDesignOptions} onChange={onPdfDesignOptionsChange} />
            <Button variant="outline" size="sm" onClick={onDownload}><Download className="h-4 w-4 mr-1" />Download raw text</Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
