import { Loader2 } from 'lucide-react';

export function InvestmentReportLoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading report...</p>
      </div>
    </div>
  );
}
