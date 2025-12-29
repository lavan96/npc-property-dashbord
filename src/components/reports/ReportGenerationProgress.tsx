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
        totalSections: 4,
        contentLength: content.length,
        error_message: report.error_message
      };
    });

    setReports(processedReports);
  };

  const countSections = (content: string): number => {
    // Count sections based on various header patterns
    let count = 0;
    const sectionPatterns = [
      /##\s*Location\s*Overview/i,
      /##\s*1\./,
      /##\s*Amenities/i,
      /##\s*2\./,
      /##\s*Financial/i,
      /##\s*3\./,
      /##\s*Investment\s*Analysis/i,
      /##\s*4\./,
    ];
    
    // Simple heuristic: check content length thresholds
    if (content.length > 5000) count = 1;
    if (content.length > 15000) count = 2;
    if (content.length > 25000) count = 3;
    if (content.length > 40000) count = 4;
    
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

      // Reset status to pending to trigger regeneration
      await supabase
        .from('investment_reports')
        .update({ 
          status: 'pending',
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      // The edge function will be triggered by realtime or next poll
      // Invoke the edge function to continue generation
      await supabase.functions.invoke('generate-investment-report', {
        body: {
          reportId: reportId,
          continueFrom: true  // Signal to continue from existing content
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
  const isStuck = report.status === 'processing' && report.sectionsCompleted > 0 && report.sectionsCompleted < 4;
  
  // Show continue button if stuck (has partial content but not complete)
  const showContinueButton = isStuck || (report.status === 'pending' && report.sectionsCompleted > 0);

  return (
    <div className="p-3 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate" title={report.property_address}>
            {report.property_address}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {report.status === 'pending' && (
              <>
                <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Queued</span>
              </>
            )}
            {report.status === 'processing' && (
              <>
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-xs text-primary">
                  Section {report.sectionsCompleted + 1}/4
                </span>
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
      
      {report.error_message && (
        <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{report.error_message}</span>
        </div>
      )}
    </div>
  );
}
