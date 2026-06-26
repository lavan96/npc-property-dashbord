import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  error?: string | null;
  onBack: () => void;
}

export function InvestmentReportErrorState({ error, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <p className="text-lg text-destructive">{error || 'Report not found'}</p>
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Go Back
      </Button>
    </div>
  );
}
