import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Calculator, Compass, FileText, Zap } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useToast } from '@/hooks/use-toast';
import { getReportVariantLabel, normalizeReportVariant } from '@/lib/reports/reportVariants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  compositeReportId: string;
  reportVariant?: string | null;
  derivedFromReportId?: string | null;
  onNavigate: (reportId: string) => void;
}

export function ReportVariantControls({ compositeReportId, reportVariant, onNavigate }: Props) {
  const { toast } = useToast();
  const [forking, setForking] = useState<string | null>(null);

  const activeVariant = normalizeReportVariant(reportVariant);

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

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Client report generation controls">
      {([
        ['financial', 'Financial', 'Generate detailed financial modelling, costs, yields and cash-flow analysis.', Calculator, 'border-violet-400/35 bg-violet-500/10 text-violet-100 hover:border-violet-300 hover:bg-violet-500/20 hover:shadow-violet-500/25'],
        ['strategic', 'Strategic', 'Generate property due diligence, risks, opportunities and strategic assessment.', Compass, 'border-primary/45 bg-primary/10 text-primary-foreground hover:border-primary hover:bg-primary/20 hover:shadow-primary/30'],
        ['briefing', 'Briefing', 'Generate a concise client-facing property briefing and key findings.', FileText, 'border-purple-400/40 bg-purple-500/10 text-purple-100 hover:border-purple-300 hover:bg-purple-500/20 hover:shadow-purple-500/25'],
        ['snapshot', 'Snapshot', 'Generate a rapid high-level overview and major decision indicators.', Zap, 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-300 hover:bg-fuchsia-500/20 hover:shadow-fuchsia-500/25'],
      ] as Array<[string, string, string, typeof Calculator, string]>).map(([id, title, description, Icon, accentClass]) => {
        const pathway = id as 'financial' | 'strategic' | 'briefing' | 'snapshot';
        const processing = forking === pathway;
        const active = activeVariant === pathway;
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
              aria-pressed={active}
              className={`h-10 min-w-[112px] shrink-0 border px-3 font-medium shadow-sm transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${active ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${accentClass}`}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-md border border-current/25 bg-background/20">
                {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
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
