import { useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, ChevronUp, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useComparison } from '@/contexts/ComparisonContext';
import { useIsMobile } from '@/hooks/use-mobile';

interface ComparisonBasketProps {
  onCompare: () => void;
}

const MAX_COMPARISON_REPORTS = 5;

export function ComparisonBasket({ onCompare }: ComparisonBasketProps) {
  const { selectedReports, removeReport, clearSelection } = useComparison();
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();

  if (selectedReports.length === 0) {
    return null;
  }

  const canCompare = selectedReports.length >= 2;
  const progressPercent = (selectedReports.length / MAX_COMPARISON_REPORTS) * 100;

  if (isMobile) {
    return (
      <div className="fixed inset-x-3 bottom-20 z-50 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <button className="w-full rounded-2xl border border-amber-400/30 bg-card/95 p-3 text-left shadow-2xl shadow-black/20 backdrop-blur dark:bg-slate-950/95">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Compare Properties</div>
                    <div className="text-xs text-muted-foreground">{selectedReports.length} of {MAX_COMPARISON_REPORTS} selected</div>
                  </div>
                </div>
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <ProgressBar value={progressPercent} className="mt-3" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82vh] rounded-t-3xl p-0">
            <SheetHeader className="border-b p-4 text-left">
              <SheetTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-600" />
                Comparison Tray
              </SheetTitle>
            </SheetHeader>
            <CompareTrayContent
              selectedReports={selectedReports}
              canCompare={canCompare}
              progressPercent={progressPercent}
              onCompare={onCompare}
              removeReport={removeReport}
              clearSelection={clearSelection}
            />
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 hidden md:block">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="rounded-full border border-amber-400/30 bg-card/95 px-4 py-3 text-left shadow-2xl shadow-black/15 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-primary/20 dark:bg-slate-950/95"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-[12rem]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">Compare Properties</span>
                <Badge variant="secondary" className="rounded-full">{selectedReports.length}/{MAX_COMPARISON_REPORTS}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {canCompare ? 'Ready to compare' : 'Select one more to compare'}
              </div>
              <ProgressBar value={progressPercent} className="mt-2" />
            </div>
          </div>
        </button>
      ) : (
        <Card className="w-[420px] overflow-hidden rounded-3xl border-amber-400/25 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur dark:bg-slate-950/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-amber-600" />
                  Comparison Tray
                </CardTitle>
                <CardDescription>{selectedReports.length} of {MAX_COMPARISON_REPORTS} properties selected</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} className="rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ProgressBar value={progressPercent} />
          </CardHeader>
          <CardContent className="p-0">
            <CompareTrayContent
              selectedReports={selectedReports}
              canCompare={canCompare}
              progressPercent={progressPercent}
              onCompare={onCompare}
              removeReport={removeReport}
              clearSelection={clearSelection}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CompareTrayContent({
  selectedReports,
  canCompare,
  onCompare,
  removeReport,
  clearSelection,
}: {
  selectedReports: Array<{ id: string; property_address: string; created_at: string }>;
  canCompare: boolean;
  progressPercent: number;
  onCompare: () => void;
  removeReport: (reportId: string) => void;
  clearSelection: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs text-muted-foreground">
        {canCompare ? 'You can generate a comparison now, or add up to 5 reports for a deeper analysis.' : 'Select at least 2 properties to unlock comparison analysis.'}
      </div>

      <ScrollArea className="max-h-[18rem] pr-3">
        <div className="space-y-2">
          {selectedReports.slice(0, MAX_COMPARISON_REPORTS).map((report, index) => (
            <div key={report.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 transition-colors hover:bg-muted/40">
              <Badge variant="outline" className="mt-0.5 rounded-full">{index + 1}</Badge>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{report.property_address}</p>
                <p className="mt-1 text-xs text-muted-foreground">Generated {format(new Date(report.created_at), 'MMM d, yyyy')}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => removeReport(report.id)} title="Remove from comparison">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <Button onClick={onCompare} disabled={!canCompare} className="w-full gap-2 rounded-xl" size="lg">
          <BarChart3 className="h-4 w-4" />
          Compare {selectedReports.length} Properties
        </Button>
        <Button variant="outline" onClick={clearSelection} className="w-full gap-2 rounded-xl" size="sm">
          <Trash2 className="h-3.5 w-3.5" />
          Clear All
        </Button>
      </div>
    </div>
  );
}

function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-muted ${className}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-primary transition-all" style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}
