import { useEffect, useState, useRef, useCallback } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, PlayCircle, X, Zap, Clock, RefreshCw, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';

interface ReportProgress {
  id: string;
  property_address: string;
  status: string;
  sectionsCompleted: number;
  totalSections: number;
  contentLength: number;
  error_message?: string | null;
  lastUpdated: Date;
  lastCompletedSection: number; // From database
  createdAt: Date;
}

interface AutoContinueSettings {
  enabled: boolean;
  maxRetries: number;
  delaySeconds: number;
}

interface RetryState {
  [reportId: string]: {
    attempts: number;
    lastAttempt: number;
    scheduledRetry?: NodeJS.Timeout;
  };
}

function getAutoContinueSettings(): AutoContinueSettings {
  try {
    const saved = localStorage.getItem('dashboard-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: parsed.autoContinueReports ?? true,
        maxRetries: parsed.autoContinueMaxRetries ?? 3,
        delaySeconds: parsed.autoContinueDelaySeconds ?? 15,
      };
    }
  } catch (e) {
    console.error('Failed to parse auto-continue settings:', e);
  }
  return { enabled: true, maxRetries: 3, delaySeconds: 15 };
}

export function ReportGenerationProgress() {
  const [reports, setReports] = useState<ReportProgress[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true); // For mobile: expand/collapse list
  const [autoContinueSettings, setAutoContinueSettings] = useState<AutoContinueSettings>(getAutoContinueSettings);
  const retryStateRef = useRef<RetryState>({});
  const autoRetryInProgressRef = useRef<Set<string>>(new Set());
  const isMobile = useIsMobile();

  // Load auto-continue settings from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      setAutoContinueSettings(getAutoContinueSettings());
    };

    // Check for settings changes periodically (localStorage doesn't trigger events in same tab)
    const interval = setInterval(handleStorageChange, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Load retry state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('report-retry-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore only attempt counts, not timeouts
        Object.keys(parsed).forEach(id => {
          retryStateRef.current[id] = {
            attempts: parsed[id].attempts || 0,
            lastAttempt: parsed[id].lastAttempt || 0,
          };
        });
      }
    } catch (e) {
      console.error('Failed to load retry state:', e);
    }
  }, []);

  // Save retry state to localStorage
  const saveRetryState = useCallback(() => {
    try {
      const toSave: Record<string, { attempts: number; lastAttempt: number }> = {};
      Object.entries(retryStateRef.current).forEach(([id, state]) => {
        toSave[id] = { attempts: state.attempts, lastAttempt: state.lastAttempt };
      });
      localStorage.setItem('report-retry-state', JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save retry state:', e);
    }
  }, []);

  const handleContinueGeneration = useCallback(async (reportId: string, isAutoRetry = false) => {
    try {
      // Prevent duplicate auto-retries
      if (isAutoRetry && autoRetryInProgressRef.current.has(reportId)) {
        console.log(`[AutoContinue] Skipping duplicate retry for ${reportId}`);
        return;
      }

      if (isAutoRetry) {
        autoRetryInProgressRef.current.add(reportId);
        console.log(`[AutoContinue] Auto-retrying report ${reportId}`);
      }

      // Update local state to show resuming
      setReports(prev => prev.map(r => 
        r.id === reportId 
          ? { ...r, status: 'processing', error_message: null, lastUpdated: new Date() }
          : r
      ));

      // Reset status to processing via secure Edge Function
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { 
          status: 'processing',
          error_message: null,
          updated_at: new Date().toISOString()
        }
      });

      // Invoke the edge function to continue generation
      const { error } = await invokeSecureFunction('generate-investment-report', {
        reportId: reportId,
        continueFrom: true
      });

      if (error) {
        console.error('Error invoking generation:', error);
        setReports(prev => prev.map(r => 
          r.id === reportId 
            ? { ...r, status: 'pending', error_message: 'Failed to resume generation' }
            : r
        ));
      }
      
    } catch (error) {
      console.error('Error continuing generation:', error);
    } finally {
      if (isAutoRetry) {
        autoRetryInProgressRef.current.delete(reportId);
      }
    }
  }, []);

  const scheduleAutoRetry = useCallback((report: ReportProgress) => {
    const { id } = report;
    const settings = autoContinueSettings;
    
    if (!settings.enabled) return;

    // Initialize retry state if needed
    if (!retryStateRef.current[id]) {
      retryStateRef.current[id] = { attempts: 0, lastAttempt: 0 };
    }

    const state = retryStateRef.current[id];
    
    // Check if we've exceeded max retries
    if (state.attempts >= settings.maxRetries) {
      console.log(`[AutoContinue] Max retries (${settings.maxRetries}) exceeded for ${id}`);
      return;
    }

    // Check if we already have a scheduled retry
    if (state.scheduledRetry) {
      return;
    }

    // Check if enough time has passed since last attempt
    const timeSinceLastAttempt = Date.now() - state.lastAttempt;
    const delayMs = settings.delaySeconds * 1000;
    
    if (timeSinceLastAttempt < delayMs) {
      // Schedule for remaining time
      const remainingDelay = delayMs - timeSinceLastAttempt;
      state.scheduledRetry = setTimeout(() => {
        delete state.scheduledRetry;
        state.attempts++;
        state.lastAttempt = Date.now();
        saveRetryState();
        handleContinueGeneration(id, true);
      }, remainingDelay);
      return;
    }

    // Schedule the retry
    console.log(`[AutoContinue] Scheduling retry ${state.attempts + 1}/${settings.maxRetries} for ${id} in ${settings.delaySeconds}s`);
    
    state.scheduledRetry = setTimeout(() => {
      delete state.scheduledRetry;
      state.attempts++;
      state.lastAttempt = Date.now();
      saveRetryState();
      handleContinueGeneration(id, true);
    }, delayMs);
  }, [autoContinueSettings, handleContinueGeneration, saveRetryState]);

  const cancelScheduledRetry = useCallback((reportId: string) => {
    const state = retryStateRef.current[reportId];
    if (state?.scheduledRetry) {
      clearTimeout(state.scheduledRetry);
      delete state.scheduledRetry;
    }
  }, []);

  // Clean up retry state for completed/removed reports
  const cleanupRetryState = useCallback((activeReportIds: Set<string>) => {
    Object.keys(retryStateRef.current).forEach(id => {
      if (!activeReportIds.has(id)) {
        cancelScheduledRetry(id);
        delete retryStateRef.current[id];
      }
    });
    saveRetryState();
  }, [cancelScheduledRetry, saveRetryState]);

  useEffect(() => {
    // Initial fetch
    fetchActiveReports();

    // Poll every 3 seconds for active reports
    const interval = setInterval(fetchActiveReports, 3000);

    return () => {
      clearInterval(interval);
      // Clean up all scheduled retries
      Object.keys(retryStateRef.current).forEach(cancelScheduledRetry);
    };
  }, [cancelScheduledRetry]);

  const fetchActiveReports = async () => {
    const { data, error } = await invokeSecureFunction('get-investment-reports', {
      listMode: true,
      listOptions: {
        select: 'id, property_address, status, report_content, error_message, updated_at, created_at, last_completed_section',
        filters: { status: ['pending', 'processing'] },
        orderBy: 'updated_at',
        orderAsc: false,
        limit: 10
      }
    });

    if (error) {
      console.error('Error fetching active reports:', error);
      return;
    }

    const records = data?.reports || [];
    
    // Filter out reports that are too old (24 hours)
    const now = Date.now();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    
    const recentReports = records.filter((report: any) => {
      const createdAt = new Date(report.created_at).getTime();
      return (now - createdAt) < MAX_AGE_MS;
    });
    
    const processedReports: ReportProgress[] = recentReports.map((report: any) => {
      const content = report.report_content || '';
      const sectionsCompleted = countSections(content);
      const dbSection = report.last_completed_section || 0;
      
      return {
        id: report.id,
        property_address: report.property_address,
        status: report.status,
        sectionsCompleted: Math.max(sectionsCompleted, dbSection), // Use higher of regex vs DB
        totalSections: 12,
        contentLength: content.length,
        error_message: report.error_message,
        lastUpdated: new Date(report.updated_at),
        lastCompletedSection: dbSection,
        createdAt: new Date(report.created_at)
      };
    });

    setReports(processedReports);
    
    // Clean up retry state for reports no longer active
    cleanupRetryState(new Set(processedReports.map(r => r.id)));

    // Check for stalled reports and schedule auto-retries
    processedReports.forEach(report => {
      const timeSinceUpdate = now - report.lastUpdated.getTime();
      const isTimedOut = timeSinceUpdate > 120000; // 2 minutes
      const hasPartialContent = report.contentLength > 1000;
      const isIncomplete = report.sectionsCompleted < report.totalSections;
      const isStuck = report.status === 'processing' && isTimedOut && hasPartialContent && isIncomplete;
      
      if (isStuck && autoContinueSettings.enabled) {
        scheduleAutoRetry(report);
      }
    });
  };

  const countSections = (content: string): number => {
    let count = 0;
    
    if (/##?\s*Executive\s*Summary/i.test(content)) count++;
    if (/##?\s*Location\s*Overview/i.test(content)) count++;
    if (/##?\s*(Current\s*Market\s*Performance|Current\s*Economic\s*Context|Market\s*(&|and)\s*Economics?)/i.test(content)) count++;
    if (/##?\s*(Demographics?\s*(&|and)\s*Demand|Demand\s*Drivers)/i.test(content)) count++;
    if (/##?\s*(Schools?\s*(&|and)\s*Education|Healthcare\s*(&|and)\s*Shopping)/i.test(content)) count++;
    if (/##?\s*(Recreational\s*Amenities|Transport\s*(&|and)\s*Accessibility)/i.test(content)) count++;
    if (/##?\s*(Environmental\s*Risks?\s*(&|and)\s*Climate|Crime\s*(&|and)\s*Safety)/i.test(content)) count++;
    if (/##?\s*(Property-Level\s*Information|Zoning\s*(&|and)\s*Planning\s*Analysis)/i.test(content)) count++;
    if (/##?\s*(Purchase\s*(&|and)\s*Ongoing\s*Costs|Rental\s*Assessment\s*(&|and)\s*Yield)/i.test(content)) count++;
    if (/##?\s*(Loan\s*Structure\s*(&|and)\s*Repayment|Cashflow\s*Analysis)/i.test(content)) count++;
    if (/##?\s*(10-Year\s*Investment\s*Projections|SWOT\s*Analysis)/i.test(content)) count++;
    
    const hasRisks = /##?\s*(Top\s*3\s*Risks|Investment\s*Recommendations)/i.test(content);
    const hasConclusion = /##?\s*(Final\s*Conclusion|Data\s*Sources)/i.test(content);
    if (hasRisks && hasConclusion) count++;
    
    return count;
  };

  const handleManualContinue = (reportId: string) => {
    // Reset retry count for manual continues
    if (retryStateRef.current[reportId]) {
      retryStateRef.current[reportId].attempts = 0;
      saveRetryState();
    }
    cancelScheduledRetry(reportId);
    handleContinueGeneration(reportId, false);
  };

  const dismissReport = (reportId: string) => {
    cancelScheduledRetry(reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  if (reports.length === 0) return null;

  // Mobile: show compact bar at bottom
  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
        {/* Header bar - always visible */}
        <div 
          className="flex items-center justify-between px-3 py-2 bg-muted/50 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">
              Reports ({reports.length})
            </span>
            {autoContinueSettings.enabled && (
              <Zap className="h-3.5 w-3.5 text-warning" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Quick progress summary */}
            <span className="text-xs text-muted-foreground">
              {reports[0]?.sectionsCompleted || 0}/{reports[0]?.totalSections || 12}
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        
        {/* Expandable list */}
        {isExpanded && (
          <div className="max-h-64 overflow-y-auto">
            {reports.map((report) => (
              <ReportProgressItem
                key={report.id}
                report={report}
                retryState={retryStateRef.current[report.id]}
                autoContinueSettings={autoContinueSettings}
                onContinue={() => handleManualContinue(report.id)}
                onDismiss={() => dismissReport(report.id)}
                isMobile={true}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Desktop: floating card in corner
  return (
    <div className={cn(
      "fixed bottom-20 right-4 z-50 transition-all duration-300 sm:bottom-24 sm:right-6",
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Report Generation ({reports.length})
              </span>
              {autoContinueSettings.enabled && (
                <span title="Auto-continue enabled">
                  <Zap className="h-3.5 w-3.5 text-warning" />
                </span>
              )}
            </div>
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
                retryState={retryStateRef.current[report.id]}
                autoContinueSettings={autoContinueSettings}
                onContinue={() => handleManualContinue(report.id)}
                onDismiss={() => dismissReport(report.id)}
                isMobile={false}
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
  retryState?: { attempts: number; lastAttempt: number };
  autoContinueSettings: AutoContinueSettings;
  onContinue: () => void;
  onDismiss: () => void;
  isMobile?: boolean;
}

function ReportProgressItem({ report, retryState, autoContinueSettings, onContinue, onDismiss, isMobile = false }: ReportProgressItemProps) {
  const percentage = Math.round((report.sectionsCompleted / report.totalSections) * 100);
  
  const timeSinceUpdate = Date.now() - report.lastUpdated.getTime();
  const timeSinceCreation = Date.now() - report.createdAt.getTime();
  const minutesSinceUpdate = Math.floor(timeSinceUpdate / 60000);
  const secondsSinceUpdate = Math.floor(timeSinceUpdate / 1000);
  
  const isTimedOut = timeSinceUpdate > 120000;
  const hasPartialContent = report.contentLength > 1000;
  const isIncomplete = report.sectionsCompleted < report.totalSections;
  const isStuck = report.status === 'processing' && isTimedOut && hasPartialContent && isIncomplete;
  
  const showContinueButton = isStuck || (report.status === 'pending' && report.sectionsCompleted > 0);
  const currentSection = Math.min(report.sectionsCompleted + 1, report.totalSections);

  // Check if auto-retry is active
  const retriesUsed = retryState?.attempts || 0;
  const maxRetriesReached = retriesUsed >= autoContinueSettings.maxRetries;
  const hasScheduledRetry = isStuck && autoContinueSettings.enabled && !maxRetriesReached;

  // Calculate elapsed time for display
  const formatElapsedTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className={cn("p-3 border-b border-border last:border-b-0", isMobile && "px-4 py-2")}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className={cn("font-medium text-foreground truncate", isMobile ? "text-sm" : "text-xs")} title={report.property_address}>
            {report.property_address}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                {!isMobile && (
                  <span className="text-xs text-muted-foreground">
                    • {formatElapsedTime(timeSinceCreation)}
                  </span>
                )}
              </>
            )}
            {isStuck && (
              <>
                {hasScheduledRetry ? (
                  <>
                    <Zap className="h-3 w-3 text-warning" />
                    <span className="text-xs text-warning font-medium">
                      {isMobile ? `Retry ${retriesUsed + 1}/${autoContinueSettings.maxRetries}` : `Auto-retry ${retriesUsed + 1}/${autoContinueSettings.maxRetries}`}
                    </span>
                  </>
                ) : maxRetriesReached ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-destructive" />
                    <span className="text-xs text-destructive font-medium">
                      Failed ({retriesUsed})
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 text-warning" />
                    <span className="text-xs text-warning font-medium">Stalled</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {showContinueButton && !hasScheduledRetry && (
            <Button
              size="sm"
              variant="outline"
              className={cn("h-6 text-xs", isMobile ? "px-3" : "px-2")}
              onClick={onContinue}
            >
              <PlayCircle className="h-3 w-3 mr-1" />
              {isMobile ? "Resume" : "Continue"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="space-y-1">
        <Progress value={percentage} className="h-1.5" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted">
                  {report.sectionsCompleted}/{report.totalSections} sections
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1 text-xs">
                  <p><strong>DB Saved:</strong> Section {report.lastCompletedSection}/12</p>
                  <p><strong>Content Detected:</strong> Section {report.sectionsCompleted}/12</p>
                  <p><strong>Content Size:</strong> {(report.contentLength / 1024).toFixed(1)} KB</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span>{percentage}%</span>
        </div>
      </div>

      {/* Retry status summary */}
      {retriesUsed > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>
            {retriesUsed} auto-retry attempt{retriesUsed > 1 ? 's' : ''} used
            {maxRetriesReached && ' (max reached)'}
          </span>
        </div>
      )}
      
      {/* Stuck indicator with enhanced info */}
      {isStuck && (
        <div className={cn(
          "mt-2 p-2 rounded text-xs border",
          maxRetriesReached 
            ? "bg-destructive/10 border-destructive/20 text-destructive" 
            : "bg-warning/10 border-warning/20 text-warning"
        )}>
          <div className="flex items-start gap-1.5">
            {hasScheduledRetry ? (
              <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : maxRetriesReached ? (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              {hasScheduledRetry ? (
                <>
                  <p className="font-medium">Auto-resuming in {autoContinueSettings.delaySeconds}s</p>
                  <p className="opacity-80">
                    Attempt {retriesUsed + 1} of {autoContinueSettings.maxRetries} • 
                    Resume from section {currentSection}
                  </p>
                </>
              ) : maxRetriesReached ? (
                <>
                  <p className="font-medium">Max retries reached</p>
                  <p className="opacity-80">
                    Tried {retriesUsed} times • Last update {minutesSinceUpdate}m ago
                  </p>
                  <p className="opacity-80">
                    Press <span className="font-medium">Continue</span> to manually retry from section {currentSection}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Generation stalled</p>
                  <p className="opacity-80">
                    No progress for {minutesSinceUpdate > 0 ? `${minutesSinceUpdate} min` : `${secondsSinceUpdate}s`}
                  </p>
                  {autoContinueSettings.enabled ? (
                    <p className="opacity-80">
                      Auto-continue will retry shortly...
                    </p>
                  ) : (
                    <p className="opacity-80">
                      Press <span className="font-medium">Continue</span> to resume from section {currentSection}
                    </p>
                  )}
                </>
              )}
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
