import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, RefreshCw, Calendar, ChevronDown, ChevronUp, Brain, AlertTriangle, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface BriefReport {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  metrics_snapshot: any;
  forecast_data: any;
  created_at: string;
}

interface WeeklyBriefPanelProps {
  currentBrief: string;
  currentBriefError?: string;
  pastBriefs: BriefReport[];
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  pastBriefsLoading: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatCurrency(val: number) {
  return `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WeeklyBriefPanel({
  currentBrief, currentBriefError, pastBriefs,
  loading, generating, onGenerate, pastBriefsLoading,
}: WeeklyBriefPanelProps) {
  const [showPastBriefs, setShowPastBriefs] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Weekly AI Brief
              <Badge variant="secondary" className="text-[10px]">Phase 3</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              AI-generated strategic performance report with forecasts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {pastBriefs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPastBriefs(!showPastBriefs)}
                className="text-xs"
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                History ({pastBriefs.length})
                {showPastBriefs ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={generating || loading}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {generating ? 'Generating...' : 'Generate Brief'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Past Briefs History */}
        {showPastBriefs && (
          <div className="space-y-2 border-b border-border/50 pb-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past Reports</h4>
            {pastBriefsLoading ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading history...</span>
              </div>
            ) : pastBriefs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No past briefs found.</p>
            ) : (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {pastBriefs.map((report) => (
                  <div key={report.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{report.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {report.metrics_snapshot?.total_spend != null && (
                        <span className="font-mono">{formatCurrency(report.metrics_snapshot.total_spend)}</span>
                      )}
                      {report.metrics_snapshot?.total_leads != null && (
                        <span className="font-mono">{report.metrics_snapshot.total_leads} leads</span>
                      )}
                      <span>{formatDate(report.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Brief Content */}
        {loading || generating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm font-medium text-foreground">
              {generating ? 'Generating weekly brief...' : 'Loading...'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing campaigns, forecasting trends, building recommendations
            </p>
          </div>
        ) : currentBriefError ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Brief generation encountered an issue</p>
              <p className="text-xs text-muted-foreground mt-1">{currentBriefError}</p>
            </div>
          </div>
        ) : currentBrief ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div className="rounded-lg border border-primary/10 bg-primary/[0.01] p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/50">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI-Generated Strategic Brief</span>
              </div>
              <div className="text-sm leading-relaxed [&>h1]:text-base [&>h1]:font-bold [&>h1]:mt-4 [&>h1]:mb-2 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:mt-4 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1.5 [&>p]:mb-2 [&>ul]:mb-2 [&>ul]:pl-4 [&>ol]:mb-2 [&>ol]:pl-4 [&>li]:mb-0.5 [&>strong]:font-semibold">
                <ReactMarkdown>
                  {currentBrief}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No weekly brief generated yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Click "Generate Brief" to create an AI-powered strategic report
            </p>
            <Button variant="outline" size="sm" onClick={onGenerate} disabled={generating}>
              <Brain className="h-3.5 w-3.5 mr-1.5" />
              Generate First Brief
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
