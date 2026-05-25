// Placeholder for Step 4 — Standalone Commercial Calculators
import { Card, CardContent } from '@/components/ui/card';
import { Calculator } from 'lucide-react';

export default function CommercialCalculators() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold flex items-center gap-2 mb-6">
        <Calculator className="h-7 w-7 text-primary" />
        Commercial Calculators
      </h1>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Standalone NOI · Cap Rate · DCF · ICR/DSCR · GST calculators coming in Step 4.
        </CardContent>
      </Card>
    </div>
  );
}
