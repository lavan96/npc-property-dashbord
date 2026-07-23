import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileStack, ExternalLink, Calculator, Compass, FileText, Zap } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useToast } from '@/hooks/use-toast';
import { getReportVariantLabel } from '@/lib/reports/reportVariants';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Props {
  compositeReportId: string;
  reportVariant?: string | null;
  derivedFromReportId?: string | null;
  onNavigate: (reportId: string) => void;
}

export function ReportVariantControls({ compositeReportId, reportVariant, derivedFromReportId, onNavigate }: Props) {
  const { toast } = useToast();
  const [forking, setForking] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
      setOpen(false);
      const reportId = isFork ? data?.[pathway]?.id : data?.reportId;
      if (reportId) onNavigate(reportId);
    } catch (err: any) {
      toast({
        title: 'Fork failed',
        description: err?.message || 'Could not generate client reports',
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!forking} className="shadow-sm">
          <FileStack className="h-4 w-4 mr-1" /> Generate Client Reports
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Generate Client Reports</DialogTitle><DialogDescription>Select a client-facing pathway. Each is saved independently in this property package.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['financial', 'Financial', 'Detailed property financial modelling, cash flow, costs, yields and investment-position analysis.', Calculator],
            ['strategic', 'Strategic', 'Property-level due diligence, location suitability, risks, opportunities and strategic investment assessment.', Compass],
            ['briefing', 'Briefing', 'Concise client-facing briefing summarising the property, key findings and recommended next steps.', FileText],
            ['snapshot', 'Snapshot', 'High-level rapid overview of the property, market position and major decision indicators.', Zap],
          ].map(([id, title, description, Icon]) => {
            const pathway = id as 'financial' | 'strategic' | 'briefing' | 'snapshot'; const PathIcon = Icon as typeof Calculator;
            return <Button key={pathway} variant="outline" disabled={!!forking} onClick={() => handleFork(pathway)} className="h-auto min-h-32 items-start justify-start whitespace-normal p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/15 focus-visible:border-primary focus-visible:ring-primary/40">
              {forking === pathway ? <Loader2 className="mr-3 mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" /> : <PathIcon className="mr-3 mt-0.5 h-5 w-5 shrink-0 text-primary" />}
              <span><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{description}</span></span>
            </Button>;
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
