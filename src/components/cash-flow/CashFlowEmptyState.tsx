import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function CashFlowEmptyState({ onConfigureReports }: { onConfigureReports: () => void }) {
  return (
    <Card className="border-dashed py-14">
      <CardContent className="flex flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-2xl bg-primary/10 p-4"><Calculator className="h-10 w-10 text-primary" /></div>
        <h3 className="mb-2 text-lg font-semibold">No reports ready for cash flow analysis</h3>
        <p className="mb-5 max-w-md text-muted-foreground">Reports need purchase price data configured via Manual Data Overrides before they can be analyzed.</p>
        <Button onClick={onConfigureReports}>Configure Reports</Button>
      </CardContent>
    </Card>
  );
}
