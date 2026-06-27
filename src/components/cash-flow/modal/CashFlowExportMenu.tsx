import { ChevronDown, Download, FileText, Printer, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { FlattenPdfIconButton } from '@/components/common/FlattenPdfIconButton';

interface CashFlowExportMenuProps {
  includeAllChartsInExport: boolean;
  chartExportToggles: {
    cashFlowTrends: boolean;
    yieldChart: boolean;
    comparisonChart: boolean;
  };
  onGlobalChartsToggle: (checked: boolean) => void;
  onChartToggle: (chartKey: 'cashFlowTrends' | 'yieldChart' | 'comparisonChart', checked: boolean) => void;
  onExportExcel: () => void;
  onExportPdf: (options?: { returnBlob?: boolean }) => Promise<Blob | void>;
  onPrintView: () => void;
  onSendToClient: () => void;
  filename: string;
}

export function CashFlowExportMenu({
  includeAllChartsInExport,
  chartExportToggles,
  onGlobalChartsToggle,
  onChartToggle,
  onExportExcel,
  onExportPdf,
  onPrintView,
  onSendToClient,
  filename,
}: CashFlowExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <FileText className="h-4 w-4 mr-2" />
          Export
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-background border p-0">
        <div className="border-b bg-muted/30 p-3">
          <DropdownMenuLabel className="p-0 text-sm">Export & publishing</DropdownMenuLabel>
          <p className="mt-1 text-xs text-muted-foreground">Download, print, or publish this cash-flow analysis.</p>
        </div>

        <div className="p-2">
          <DropdownMenuItem onClick={onExportExcel} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" />
            Excel workbook
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="space-y-3 p-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              PDF package
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Choose charts to include before generating PDF outputs.</p>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeAllChartsInExport}
                onCheckedChange={(checked) => onGlobalChartsToggle(checked === true)}
              />
              <span className="text-sm font-medium">Include all charts</span>
            </label>
            <Separator className="my-2" />
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.cashFlowTrends}
                onCheckedChange={(checked) => onChartToggle('cashFlowTrends', checked === true)}
              />
              <span className="text-sm">Cash flow trends</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.yieldChart}
                onCheckedChange={(checked) => onChartToggle('yieldChart', checked === true)}
              />
              <span className="text-sm">Yield percentages</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.comparisonChart}
                onCheckedChange={(checked) => onChartToggle('comparisonChart', checked === true)}
              />
              <span className="text-sm">Property comparison</span>
            </label>
          </div>

          <div className="grid gap-2">
            <Button size="sm" className="w-full justify-start" onClick={() => onExportPdf()}>
              <FileText className="h-4 w-4 mr-2" />
              Generate PDF
            </Button>
            <FlattenPdfIconButton
              inline
              variant="outline"
              size="sm"
              className="w-full justify-start"
              label="Generate Flattened PDF"
              getPdfBlob={async () => {
                const b = await onExportPdf({ returnBlob: true });
                if (!b) throw new Error('Failed to generate cash flow PDF');
                return b;
              }}
              filename={filename}
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        <div className="p-2">
          <DropdownMenuItem onClick={onPrintView} className="cursor-pointer">
            <Printer className="mr-2 h-4 w-4" />
            Print View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSendToClient} className="cursor-pointer">
            <Send className="mr-2 h-4 w-4" />
            Send to Client
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
