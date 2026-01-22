import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle, PlayCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportProgress {
  id: string;
  property_address: string;
  status: string;
  sectionsCompleted: number;
  totalSections: number;
  contentLength: number;
  error_message?: string | null;
  lastUpdated: Date;
}

export function ReportGenerationProgress() {
  const [reports, setReports] = useState<ReportProgress[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetchActiveReports();

    // Poll every 3 seconds for active reports
    const interval = setInterval(fetchActiveReports, 3000);

    // Subscribe to realtime updates
    const channel = supabase
      .channel('report-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'investment_reports',
          filter: 'status=in.(pending,processing)'
        },
        () => {
          fetchActiveReports();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchActiveReports = async () => {
    const { data, error } = await supabase
      .from('investment_reports')
      .select('id, property_address, status, report_content, error_message, updated_at')
      .in('status', ['pending', 'processing'])
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching active reports:', error);
      return;
    }

    const processedReports: ReportProgress[] = (data || []).map(report => {
      const content = report.report_content || '';
      const sectionsCompleted = countSections(content);
      
      return {
        id: report.id,
        property_address: report.property_address,
        status: report.status,
        sectionsCompleted,
        totalSections: 12, // Updated to match new granular 12-section architecture
        contentLength: content.length,
        error_message: report.error_message,
        lastUpdated: new Date(report.updated_at)
      };
    });

    setReports(processedReports);
  };

  const countSections = (content: string): number => {
    // Count sections by detecting actual section markers matching the backend's 12-section architecture
    // These patterns MUST match what generate-investment-report actually outputs
    let count = 0;
    
    // Section 0: Executive Summary
    if (/##?\s*Executive\s*Summary/i.test(content)) count++;
    
    // Section 1: Location Overview
    if (/##?\s*Location\s*Overview/i.test(content)) count++;
    
    // Section 2: Market & Economics (backend outputs "Current Market Performance" and "Current Economic Context")
    if (/##?\s*(Current\s*Market\s*Performance|Current\s*Economic\s*Context|Market\s*(&|and)\s*Economics?)/i.test(content)) count++;
    
    // Section 3: Demographics & Demand (backend outputs "Demographics & Demand Drivers")
    if (/##?\s*(Demographics?\s*(&|and)\s*Demand|Demand\s*Drivers)/i.test(content)) count++;
    
    // Section 4: Education & Healthcare (backend outputs "Schools & Education", "Healthcare & Shopping")
    if (/##?\s*(Schools?\s*(&|and)\s*Education|Healthcare\s*(&|and)\s*Shopping)/i.test(content)) count++;
    
    // Section 5: Recreation & Transport (backend outputs "Recreational Amenities", "Transport & Accessibility")
    if (/##?\s*(Recreational\s*Amenities|Transport\s*(&|and)\s*Accessibility)/i.test(content)) count++;
    
    // Section 6: Environment & Safety (backend outputs "Environmental Risks & Climate", "Crime & Safety")
    if (/##?\s*(Environmental\s*Risks?\s*(&|and)\s*Climate|Crime\s*(&|and)\s*Safety)/i.test(content)) count++;
    
    // Section 7: Property & Zoning (backend outputs "Property-Level Information", "Zoning & Planning Analysis")
    if (/##?\s*(Property-Level\s*Information|Zoning\s*(&|and)\s*Planning\s*Analysis)/i.test(content)) count++;
    
    // Section 8: Purchase Costs & Rental (backend outputs "Purchase & Ongoing Costs", "Rental Assessment & Yield Calculation")
    if (/##?\s*(Purchase\s*(&|and)\s*Ongoing\s*Costs|Rental\s*Assessment\s*(&|and)\s*Yield)/i.test(content)) count++;
    
    // Section 9: Loan & Cashflow (backend outputs "Loan Structure & Repayment Analysis", "Cashflow Analysis")
    if (/##?\s*(Loan\s*Structure\s*(&|and)\s*Repayment|Cashflow\s*Analysis)/i.test(content)) count++;
    
    // Section 10: Projections & SWOT (backend outputs "10-Year Investment Projections", "SWOT Analysis")
    if (/##?\s*(10-Year\s*Investment\s*Projections|SWOT\s*Analysis)/i.test(content)) count++;
    
    // Section 11: Risks & Recommendations (backend outputs "Top 3 Risks", "Investment Recommendations", "Final Conclusion")
    const hasRisks = /##?\s*(Top\s*3\s*Risks|Investment\s*Recommendations)/i.test(content);
    const hasConclusion = /##?\s*(Final\s*Conclusion|Data\s*Sources)/i.test(content);
    if (hasRisks && hasConclusion) count++;
    
    return count;
  };

  const handleContinueGeneration = async (reportId: string) => {
    try {
      // Get the report's current state
      const { data: report } = await supabase
        .from('investment_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (!report) return;

      // Update local state to show resuming - keep it visible and mark as processing
      setReports(prev => prev.map(r => 
        r.id === reportId 
          ? { ...r, status: 'processing', error_message: null, lastUpdated: new Date() }
          : r
      ));

      // Reset status to processing (not pending) to show active state
      await supabase
        .from('investment_reports')
        .update({ 
          status: 'processing',
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      // Invoke the edge function to continue generation - don't await to keep UI responsive
      supabase.functions.invoke('generate-investment-report', {
        body: {
          reportId: reportId,
          continueFrom: true  // Signal to continue from existing content
        }
      }).then(({ error }) => {
        if (error) {
          console.error('Error invoking generation:', error);
          // Update local state to show error
          setReports(prev => prev.map(r => 
            r.id === reportId 
              ? { ...r, status: 'pending', error_message: 'Failed to resume generation' }
              : r
          ));
        }
      });
      
    } catch (error) {
      console.error('Error continuing generation:', error);
    }
  };

  const dismissReport = (reportId: string) => {
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  if (reports.length === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 transition-all duration-300",
      isMinimized ? "w-12 h-12" : "w-80"
    )}>
      {isMinimized ? (
        <Button
          size="icon"
          variant="default"
          className="w-12 h-12 rounded-full shadow-lg"
          onClick={() => setIsMinimized(false)}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Show progress</span>
        </Button>
      ) : (
        <div className="bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <span className="text-sm font-medium text-foreground">
              Report Generation ({reports.length})
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setIsMinimized(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {reports.map((report) => (
              <ReportProgressItem
                key={report.id}
                report={report}
                onContinue={() => handleContinueGeneration(report.id)}
                onDismiss={() => dismissReport(report.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ReportProgressItemProps {
  report: ReportProgress;
  onContinue: () => void;
  onDismiss: () => void;
}

function ReportProgressItem({ report, onContinue, onDismiss }: ReportProgressItemProps) {
  const percentage = Math.round((report.sectionsCompleted / report.totalSections) * 100);
  
  // Calculate time since last update
  const timeSinceUpdate = Date.now() - report.lastUpdated.getTime();
  const minutesSinceUpdate = Math.floor(timeSinceUpdate / 60000);
  
  // Determine if report is stuck - ONLY if no updates for 2+ minutes
  // This prevents false "stalled" indicators when the report is actively progressing
  const isTimedOut = timeSinceUpdate > 120000; // 2 minutes without update
  const hasPartialContent = report.contentLength > 1000;
  const isIncomplete = report.sectionsCompleted < report.totalSections;
  
  // Only mark as stuck if there's been no database update for 2+ minutes AND has partial content
  const isStuck = report.status === 'processing' && isTimedOut && hasPartialContent && isIncomplete;
  
  // Show continue button if:
  // 1. Currently processing but timed out (actually stuck)
  // 2. Pending with partial content (can resume)
  const showContinueButton = isStuck || 
    (report.status === 'pending' && report.sectionsCompleted > 0);

  // Calculate which section is currently being worked on (cap at totalSections)
  const currentSection = Math.min(report.sectionsCompleted + 1, report.totalSections);

  return (
    <div className="p-3 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate" title={report.property_address}>
            {report.property_address}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {report.status === 'pending' && !isStuck && (
              <>
                <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Queued</span>
              </>
            )}
            {report.status === 'processing' && !isStuck && (
              <>
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-xs text-primary">
                  Section {currentSection}/{report.totalSections}
                </span>
              </>
            )}
            {isStuck && (
              <>
                <AlertCircle className="h-3 w-3 text-amber-500" />
                <span className="text-xs text-amber-500 font-medium">Stalled</span>
              </>
            )}
          </div>
        </div>
        
        {showContinueButton && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={onContinue}
          >
            <PlayCircle className="h-3 w-3 mr-1" />
            Continue
          </Button>
        )}
      </div>
      
      <div className="space-y-1">
        <Progress value={percentage} className="h-1.5" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{report.sectionsCompleted}/{report.totalSections} sections</span>
          <span>{percentage}%</span>
        </div>
      </div>
      
      {/* Stuck indicator with explanation */}
      {isStuck && (
        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Generation stalled</p>
              <p className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">
                {minutesSinceUpdate > 0 
                  ? `No progress for ${minutesSinceUpdate} min. `
                  : 'The server timed out. '}
                Press <span className="font-medium">Continue</span> to resume from section {currentSection}.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {report.error_message && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{report.error_message}</span>
        </div>
      )}
    </div>
  );
}
