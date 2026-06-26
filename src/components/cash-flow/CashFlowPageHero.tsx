import { Calculator, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CashFlowPageHeroProps {
  dateRangeLabel: string;
}

export function CashFlowPageHero({ dateRangeLabel }: CashFlowPageHeroProps) {
  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            <span className="hidden sm:inline">10-Year Cash Flow Analysis</span>
            <span className="sm:hidden">Cash Flow</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Generate detailed 10-year cash flow projections
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">How it works</h3>
              <p className="text-sm text-muted-foreground">
                Cash flow analysis uses data from your investment report's manual overrides.
                First, configure the required fields (purchase price, rent, interest rate, etc.)
                in the Manual Data Override modal, then generate the 10-year projection here.
                <span className="block mt-1 text-xs opacity-75">
                  Showing reports from {dateRangeLabel}. Archived reports are hidden.
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
