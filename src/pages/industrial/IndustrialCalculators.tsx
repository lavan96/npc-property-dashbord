import { Calculator } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndustrialBcCard } from '@/components/industrial/calculators/IndustrialBcCard';
import { RentPerSqmCard } from '@/components/industrial/calculators/RentPerSqmCard';
import { SiteCoverCard } from '@/components/industrial/calculators/SiteCoverCard';
import { NoiCalculatorCard } from '@/components/commercial/calculators/NoiCalculatorCard';
import { CapRateCalculatorCard } from '@/components/commercial/calculators/CapRateCalculatorCard';
import { DcfCalculatorCard } from '@/components/commercial/calculators/DcfCalculatorCard';
import { CalculatorPrefillProvider } from '@/contexts/CalculatorPrefillContext';
import { CalculatorPropertyBar } from '@/components/commercial/CalculatorPropertyBar';

export default function IndustrialCalculators() {
  return (
    <CalculatorPrefillProvider domain="industrial">
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Calculator className="h-7 w-7 text-primary" />
          Industrial Calculators
        </h1>
        <p className="text-muted-foreground mt-1">
          Industrial borrowing capacity, $/m² rent, site cover, NOI, cap rate and DCF. Link an industrial property to prefill every tab.
        </p>
      </div>

      <CalculatorPropertyBar />

      <Tabs defaultValue="bc" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="bc">Borrowing</TabsTrigger>
          <TabsTrigger value="rent">$/m² Rent</TabsTrigger>
          <TabsTrigger value="site">Site Cover</TabsTrigger>
          <TabsTrigger value="noi">NOI</TabsTrigger>
          <TabsTrigger value="cap">Cap Rate</TabsTrigger>
          <TabsTrigger value="dcf">DCF</TabsTrigger>
        </TabsList>
        <TabsContent value="bc" className="mt-4"><IndustrialBcCard /></TabsContent>
        <TabsContent value="rent" className="mt-4"><RentPerSqmCard /></TabsContent>
        <TabsContent value="site" className="mt-4"><SiteCoverCard /></TabsContent>
        <TabsContent value="noi" className="mt-4"><NoiCalculatorCard /></TabsContent>
        <TabsContent value="cap" className="mt-4"><CapRateCalculatorCard /></TabsContent>
        <TabsContent value="dcf" className="mt-4"><DcfCalculatorCard /></TabsContent>
      </Tabs>
    </div>
    </CalculatorPrefillProvider>
  );
}
