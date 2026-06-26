import { ChevronDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  onExportPdf: (options?: { returnBlob?: boolean }) => Promise<Blob | void>;
  filename: string;
}

export function CashFlowExportMenu({ includeAllChartsInExport, chartExportToggles, onGlobalChartsToggle, onChartToggle, onExportPdf, filename }: CashFlowExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Export PDF
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-background border">
        <div className="p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chart Export Options</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeAllChartsInExport}
                onCheckedChange={(checked) => onGlobalChartsToggle(checked === true)}
              />
              <span className="text-sm font-medium">Include All Charts</span>
            </label>
            <Separator className="my-2" />
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.cashFlowTrends}
                onCheckedChange={(checked) => onChartToggle('cashFlowTrends', checked === true)}
              />
              <span className="text-sm">Cash Flow Trends</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.yieldChart}
                onCheckedChange={(checked) => onChartToggle('yieldChart', checked === true)}
              />
              <span className="text-sm">Yield Percentages</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer pl-4">
              <Checkbox
                checked={chartExportToggles.comparisonChart}
                onCheckedChange={(checked) => onChartToggle('comparisonChart', checked === true)}
              />
              <span className="text-sm">Property Comparison</span>
            </label>
          </div>
          <Separator className="my-2" />
          <Button size="sm" className="w-full" onClick={() => onExportPdf()}>
            <FileText className="h-4 w-4 mr-2" />
            Generate PDF
          </Button>
          <FlattenPdfIconButton
            inline
            variant="outline"
            size="sm"
            className="w-full"
            label="Generate Flattened PDF"
            getPdfBlob={async () => {
              const b = await onExportPdf({ returnBlob: true });
              if (!b) throw new Error('Failed to generate cash flow PDF');
              return b;
            }}
            filename={filename}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
