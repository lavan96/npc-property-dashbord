import { DollarSign, Home, Percent, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface CashFlowMetricsGridProps {
  baseFinancialData: any;
  projections: any[];
  formatCurrency: (value: number) => string;
}

export function CashFlowMetricsGrid({ baseFinancialData, projections, formatCurrency }: CashFlowMetricsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Home className="h-4 w-4" />
            <span className="text-xs font-medium">Property Value</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(baseFinancialData.marketValueNow)}</p>
          <p className="text-xs text-muted-foreground">Current market value</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Purchase Price</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(baseFinancialData.purchasePrice)}</p>
          <p className="text-xs text-muted-foreground">Original purchase price</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">10-Year Value</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {projections.length > 0 ? formatCurrency(projections[10]?.propertyMarketValue || 0) : '-'}
          </p>
          <p className="text-xs text-muted-foreground">Projected property value</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Year 10 Cash Flow</span>
          </div>
          <p className={`text-2xl font-bold ${(projections[10]?.afterTaxCashFlowPA || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
            {projections.length > 0 ? formatCurrency(projections[10]?.afterTaxCashFlowPA || 0) : '-'}
          </p>
          <p className="text-xs text-muted-foreground">After-tax annual cash flow</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Percent className="h-4 w-4" />
            <span className="text-xs font-medium">Year 10 Equity</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {projections.length > 0 ? formatCurrency(projections[10]?.equityInProperty || 0) : '-'}
          </p>
          <p className="text-xs text-muted-foreground">Equity in property</p>
        </CardContent>
      </Card>
    </div>
  );
}
