import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface CashFlowEmptyStateProps {
  onConfigureReports: () => void;
}

export function CashFlowEmptyState({ onConfigureReports }: CashFlowEmptyStateProps) {
  return (
    <Card className="py-12">
      <CardContent className="flex flex-col items-center justify-center text-center pt-6">
        <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Reports Ready for Cash Flow Analysis</h3>
        <p className="text-muted-foreground mb-4 max-w-md">
          Reports need purchase price and weekly rent data configured via Manual Data Overrides before they can be analyzed.
        </p>
        <Button onClick={onConfigureReports}>
          Configure Reports
        </Button>
      </CardContent>
    </Card>
  );
}
