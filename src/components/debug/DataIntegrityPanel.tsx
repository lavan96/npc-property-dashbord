import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Info, ShieldCheck, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PropertyListing } from '@/lib/airtable';
import { useDataValidation } from '@/hooks/useDataValidation';
import { DataValidator } from '@/utils/dataValidation';

interface DataIntegrityPanelProps {
  dashboardData?: PropertyListing[];
  reportsData?: PropertyListing[];
  className?: string;
}

export function DataIntegrityPanel({
  dashboardData,
  reportsData,
  className,
}: DataIntegrityPanelProps) {
  const { isValidating, comparison, lastValidation, error, runValidation, clearValidation } = 
    useDataValidation(dashboardData, reportsData);

  const [showDetails, setShowDetails] = useState(false);

  const getStatusInfo = () => {
    if (!comparison) return { status: 'unknown', color: 'secondary', icon: Info };
    
    const totalIssues = comparison.discrepancy;
    
    if (totalIssues === 0) {
      return { status: 'Perfect Match', color: 'default', icon: CheckCircle };
    } else if (totalIssues <= 5) {
      return { status: 'Minor Discrepancy', color: 'secondary', icon: AlertTriangle };
    } else {
      return { status: 'Major Discrepancy', color: 'destructive', icon: XCircle };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const statusTone = comparison
    ? comparison.discrepancy === 0
      ? 'passed'
      : comparison.discrepancy <= 5
        ? 'warning'
        : 'failed'
    : isValidating
      ? 'validating'
      : 'idle';
  const statusShellClasses = {
    idle: 'border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300',
    validating: 'border-sky-200/80 bg-sky-50/80 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300',
    passed: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300',
    warning: 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
    failed: 'border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300',
  }[statusTone];

  // Generate data quality report
  const dashboardQuality = dashboardData ? DataValidator.generateDataQualityReport(dashboardData) : null;
  const reportsQuality = reportsData ? DataValidator.generateDataQualityReport(reportsData) : null;

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-slate-50/70 shadow-sm ring-1 ring-black/5 dark:to-slate-950/60 dark:ring-white/10',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" />
      {isValidating && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden">
          <div className="h-full w-1/2 animate-pulse bg-white/70 shadow-[0_0_24px_rgba(14,165,233,0.65)]" />
        </div>
      )}
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className={cn('mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm', statusShellClasses)}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="leading-tight tracking-tight">
                  Data Integrity Monitor
                </CardTitle>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]', statusShellClasses)}>
                  <StatusIcon className={cn('h-3.5 w-3.5', isValidating && 'animate-spin')} />
                  {isValidating ? 'Validating' : statusInfo.status}
                </span>
              </div>
              <CardDescription className="max-w-xl text-sm leading-6 text-muted-foreground">
                Real-time validation of dashboard vs reports data consistency
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="order-2 border-border/70 bg-background/70 text-muted-foreground shadow-sm transition-all hover:bg-muted hover:text-foreground sm:order-1"
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
              <ChevronDown className={cn('h-4 w-4 transition-transform', showDetails && 'rotate-180')} />
            </Button>
            <Button
              size="sm"
              onClick={runValidation}
              disabled={isValidating}
              className="order-1 gap-2 bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-lg shadow-sky-500/20 transition-all hover:from-sky-700 hover:to-cyan-700 disabled:opacity-70 sm:order-2"
            >
              {isValidating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!comparison && !isValidating && (
          <Alert className="border-sky-200/70 bg-sky-50/70 text-sky-900 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
            <Info className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            <AlertDescription>
              Click "Validate" to run data integrity checks between dashboard and reports.
            </AlertDescription>
          </Alert>
        )}

        {comparison && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
              <Badge variant={statusInfo.color as any} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                {statusInfo.status}
              </Badge>
              {lastValidation && (
                <span className="text-sm text-muted-foreground">
                  Last check: {lastValidation.toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
                <span className="font-medium text-muted-foreground">Dashboard:</span> {comparison.dashboardCount} listings
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
                <span className="font-medium text-muted-foreground">Reports:</span> {comparison.reportsCount} listings
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
                <span className="font-medium text-muted-foreground">Discrepancy:</span> {comparison.discrepancy}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/25 p-3">
                <span className="font-medium text-muted-foreground">Duplicates Found:</span> {comparison.duplicatesFound}
              </div>
            </div>

            {showDetails && (
              <Tabs defaultValue="overview" className="w-full rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm">
                <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
                  <TabsList className="inline-flex h-10 w-auto min-w-max rounded-xl bg-muted/70 p-1">
                    <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                    <TabsTrigger value="fields" className="text-xs sm:text-sm">Field Analysis</TabsTrigger>
                    <TabsTrigger value="quality" className="text-xs sm:text-sm">Data Quality</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="mt-4 space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="text-sm text-muted-foreground">
                    <p>Data comparison shows {comparison.discrepancy} difference(s) between dashboard and reports.</p>
                    {comparison.duplicatesFound > 0 && (
                      <p className="mt-2">Found {comparison.duplicatesFound} potential duplicate(s) in the data.</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="fields" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    {Object.entries(comparison.fieldComparison).map(([field, fieldResult]) => {
                      const result = fieldResult as { dashboard: number; reports: number; match: boolean };
                      const remediationMap: Record<string, string> = {
                        price: 'Check source emails for price data that may not be extracted. Verify Airtable "Price" field mapping.',
                        address: 'Review listings with missing addresses. Check email parser extraction rules for address patterns.',
                        suburb: 'Run suburb extraction against raw addresses. Ensure suburb field is populated from address parsing.',
                        propertyType: 'Classify uncategorised listings. Update property type mapping rules in the data pipeline.',
                        beds: 'Extract bedroom counts from listing descriptions where the structured field is empty.',
                        baths: 'Extract bathroom counts from listing descriptions where the structured field is empty.',
                      };
                      return (
                        <div key={field} className="space-y-2 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="capitalize font-medium text-sm">{field}</span>
                            <Badge variant={result.match ? "default" : "destructive"}>
                              {result.match ? "✓ Match" : "✗ Mismatch"}
                            </Badge>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>Dashboard: <strong className="text-foreground">{result.dashboard}</strong></span>
                            <span>Reports: <strong className="text-foreground">{result.reports}</strong></span>
                            {!result.match && (
                              <span className="text-destructive">Δ {Math.abs(result.dashboard - result.reports)}</span>
                            )}
                          </div>
                          {!result.match && remediationMap[field] && (
                            <div className="flex items-start gap-1.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded p-2 mt-1">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{remediationMap[field]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="quality" className="mt-4 space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  {(() => {
                    // Use comparison quality scores (populated by the hook which fetches both datasets)
                    const hasCmpScores = comparison.dataQualityScores &&
                      (comparison.dataQualityScores.dashboard > 0 || comparison.dataQualityScores.reports > 0);
                    // Fall back to prop-derived quality
                    const dbScore = hasCmpScores ? comparison.dataQualityScores.dashboard : dashboardQuality?.score;
                    const rpScore = hasCmpScores ? comparison.dataQualityScores.reports : reportsQuality?.score;

                    if (dbScore == null && rpScore == null) {
                      return (
                        <div className="text-sm text-muted-foreground py-4 text-center">
                          Run validation to generate data quality scores.
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {dbScore != null && (
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium">Dashboard Quality</span>
                              <span className="text-sm">{Math.round(dbScore)}%</span>
                            </div>
                            <Progress value={dbScore} className="h-2" />
                          </div>
                        )}
                        {rpScore != null && (
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium">Reports Quality</span>
                              <span className="text-sm">{Math.round(rpScore)}%</span>
                            </div>
                            <Progress value={rpScore} className="h-2" />
                          </div>
                        )}
                        {dashboardQuality?.recommendations && dashboardQuality.recommendations.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recommendations</span>
                            {dashboardQuality.recommendations.map((rec, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded p-2">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{rec}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          Quality is calculated based on field completeness, valid values, and data consistency.
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}