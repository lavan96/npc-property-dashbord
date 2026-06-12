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
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="bc">Borrowing</TabsTrigger>
          <TabsTrigger value="noi">NOI</TabsTrigger>
          <TabsTrigger value="cap">Cap Rate</TabsTrigger>
          <TabsTrigger value="icr">ICR / DSCR</TabsTrigger>
          <TabsTrigger value="gst">GST</TabsTrigger>
          <TabsTrigger value="dcf">DCF</TabsTrigger>
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
