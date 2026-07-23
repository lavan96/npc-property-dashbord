import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Calculator, Compass, FileText, Zap } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useToast } from '@/hooks/use-toast';
import { getReportVariantLabel } from '@/lib/reports/reportVariants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  compositeReportId: string;
  reportVariant?: string | null;
  derivedFromReportId?: string | null;
  onNavigate: (reportId: string) => void;
}

export function ReportVariantControls({ compositeReportId, reportVariant, derivedFromReportId, onNavigate }: Props) {
  const { toast } = useToast();
  const [forking, setForking] = useState<string | null>(null);

  const isComposite = !reportVariant || reportVariant === 'composite';
  const isFork = !!derivedFromReportId;

  const handleFork = async (pathway: 'financial' | 'strategic' | 'briefing' | 'snapshot') => {
    setForking(pathway);
    try {
      const isFork = pathway === 'financial' || pathway === 'strategic';
      const { data, error } = await invokeSecureFunction<any>(isFork ? 'fork-investment-report' : 'condense-investment-report', isFork
        ? { composite_report_id: compositeReportId, variants: [pathway] }
        : { parentReportId: compositeReportId, targetTier: pathway });
      if (error) throw new Error(error.message);
      toast({
        title: `${getReportVariantLabel(pathway)} report generated`,
        description: 'The report is saved to this property package and is ready to view.',
      });
      const reportId = isFork ? data?.[pathway]?.id : data?.reportId;
      if (reportId) onNavigate(reportId);
    } catch (err: any) {
      toast({
        title: `${getReportVariantLabel(pathway)} report generation failed`,
        description: 'No existing reports were changed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setForking(null);
    }
  };

  if (isFork) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs">
          {getReportVariantLabel(reportVariant)}
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
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Client report generation controls">
      {([
        ['financial', 'Financial', 'Generate financial modelling, costs, yields, cash flow and investment-position analysis.', Calculator],
        ['strategic', 'Strategic', 'Generate property-level due diligence, risks, opportunities and strategic assessment.', Compass],
        ['briefing', 'Briefing', 'Generate a concise client-facing summary of the property and key findings.', FileText],
        ['snapshot', 'Snapshot', 'Generate a rapid high-level overview of the property and major decision indicators.', Zap],
      ] as Array<[string, string, string, typeof Calculator]>).map(([id, title, description, Icon]) => {
        const pathway = id as 'financial' | 'strategic' | 'briefing' | 'snapshot';
        const processing = forking === pathway;
        return <Tooltip key={pathway}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={processing}
              aria-busy={processing}
              aria-label={processing ? `Generating ${title}` : `${title}: ${description}`}
              onClick={() => handleFork(pathway)}
              className="h-9 border-border/80 bg-card/80 px-2.5 shadow-sm transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md hover:shadow-primary/20 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-0 motion-reduce:transition-none"
            >
              {processing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {processing ? `Generating ${title}` : title}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">{description}</TooltipContent>
        </Tooltip>;
      })}
      <span className="sr-only" aria-live="polite">{forking ? `Generating ${getReportVariantLabel(forking)}` : ''}</span>
    </div>
  );
}
