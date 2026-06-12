import { Calculator } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NoiCalculatorCard } from '@/components/commercial/calculators/NoiCalculatorCard';
import { CapRateCalculatorCard } from '@/components/commercial/calculators/CapRateCalculatorCard';
import { IcrDscrCalculatorCard } from '@/components/commercial/calculators/IcrDscrCalculatorCard';
import { GstCalculatorCard } from '@/components/commercial/calculators/GstCalculatorCard';
import { DcfCalculatorCard } from '@/components/commercial/calculators/DcfCalculatorCard';
import { CommercialBorrowingCapacityCard } from '@/components/commercial/calculators/CommercialBorrowingCapacityCard';

export default function CommercialCalculators() {
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Calculator className="h-7 w-7 text-primary" />
          Commercial / Industrial Calculators
        </h1>
        <p className="text-muted-foreground mt-1">
          NOI, cap rate, ICR/DSCR, GST, DCF and commercial or industrial borrowing capacity.
        </p>
      </div>

      <Tabs defaultValue="bc" className="w-full">
        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="bc" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Borrowing Capacity</span>
          </TabsTrigger>
          <TabsTrigger value="noi" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Net Operating Income</span>
            <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(NOI)</span>
          </TabsTrigger>
          <TabsTrigger value="cap" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Capitalisation Rate</span>
            <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(Cap Rate)</span>
          </TabsTrigger>
          <TabsTrigger value="icr" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Interest Coverage Ratio / Debt Service Coverage Ratio</span>
            <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(ICR / DSCR)</span>
          </TabsTrigger>
          <TabsTrigger value="gst" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Goods and Services Tax</span>
            <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(GST)</span>
          </TabsTrigger>
          <TabsTrigger value="dcf" className="min-h-[54px] shrink-0 flex-col gap-0.5 px-3 py-2 text-center text-xs leading-tight md:text-sm">
            <span className="whitespace-nowrap">Discounted Cash Flow</span>
            <span className="whitespace-nowrap text-[11px] leading-none opacity-80 md:text-xs">(DCF)</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bc" className="mt-4"><CommercialBorrowingCapacityCard /></TabsContent>
        <TabsContent value="noi" className="mt-4"><NoiCalculatorCard /></TabsContent>
        <TabsContent value="cap" className="mt-4"><CapRateCalculatorCard /></TabsContent>
        <TabsContent value="icr" className="mt-4"><IcrDscrCalculatorCard /></TabsContent>
        <TabsContent value="gst" className="mt-4"><GstCalculatorCard /></TabsContent>
        <TabsContent value="dcf" className="mt-4"><DcfCalculatorCard /></TabsContent>
      </Tabs>
    </div>
  );
}
