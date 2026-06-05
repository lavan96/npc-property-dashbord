import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileStack, ExternalLink } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useToast } from '@/hooks/use-toast';
import { REPORT_VARIANT_LABELS } from '@/lib/reports/reportSplitRegistry';

interface Props {
  compositeReportId: string;
  reportVariant?: string | null;
  derivedFromReportId?: string | null;
  onNavigate: (reportId: string) => void;
}

export function ReportVariantControls({ compositeReportId, reportVariant, derivedFromReportId, onNavigate }: Props) {
  const { toast } = useToast();
  const [forking, setForking] = useState(false);

  const isComposite = !reportVariant || reportVariant === 'composite';
  const isFork = !!derivedFromReportId;

  const handleFork = async (force: boolean) => {
    setForking(true);
    try {
      const { data, error } = await invokeSecureFunction<any>('fork-investment-report', {
        composite_report_id: compositeReportId,
        force,
      });
      if (error) throw new Error(error.message);
      toast({
        title: force ? 'Client reports re-generated' : 'Client reports generated',
        description: `Financial Feasibility and Property Due Diligence reports are ready.`,
      });
      if (data?.financial?.id) {
        // Surface a quick link to the FIN fork
        onNavigate(data.financial.id);
      }
    } catch (err: any) {
      toast({
        title: 'Fork failed',
        description: err?.message || 'Could not generate client reports',
        variant: 'destructive',
      });
    } finally {
      setForking(false);
    }
  };

  if (isFork) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs">
          {REPORT_VARIANT_LABELS[(reportVariant as 'financial' | 'due_diligence') || 'composite']}
        </Badge>
        {derivedFromReportId && (
          <Button variant="ghost" size="sm" onClick={() => onNavigate(derivedFromReportId)}>
            <ExternalLink className="h-3 w-3 mr-1" />
            Back to composite
          </Button>
        )}
      </div>
    );
  }

  if (!isComposite) return null;

  return (
    <Button variant="outline" size="sm" disabled={forking} onClick={() => handleFork(false)}>
      {forking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileStack className="h-4 w-4 mr-1" />}
      Generate Client Reports
    </Button>
  );
}
