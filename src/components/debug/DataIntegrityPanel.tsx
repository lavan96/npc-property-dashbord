import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Info } from 'lucide-react';
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

  // Generate data quality report
  const dashboardQuality = dashboardData ? DataValidator.generateDataQualityReport(dashboardData) : null;
  const reportsQuality = reportsData ? DataValidator.generateDataQualityReport(reportsData) : null;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Data Integrity Monitor
              <StatusIcon className={`h-4 w-4 text-${statusInfo.color}`} />
            </CardTitle>
            <CardDescription>
              Real-time validation of dashboard vs reports data consistency
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={runValidation}
              disabled={isValidating}
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

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!comparison && !isValidating && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Click "Validate" to run data integrity checks between dashboard and reports.
            </AlertDescription>
          </Alert>
        )}

        {comparison && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
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

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Dashboard:</span> {comparison.dashboardCount} listings
              </div>
              <div>
                <span className="font-medium">Reports:</span> {comparison.reportsCount} listings
              </div>
              <div>
                <span className="font-medium">Discrepancy:</span> {comparison.discrepancy}
              </div>
              <div>
                <span className="font-medium">Duplicates Found:</span> {comparison.duplicatesFound}
              </div>
            </div>

            {showDetails && (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="fields">Field Analysis</TabsTrigger>
                  <TabsTrigger value="quality">Data Quality</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p>Data comparison shows {comparison.discrepancy} difference(s) between dashboard and reports.</p>
                    {comparison.duplicatesFound > 0 && (
                      <p className="mt-2">Found {comparison.duplicatesFound} potential duplicate(s) in the data.</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="fields" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(comparison.fieldComparison).map(([field, fieldResult]) => (
                      <div key={field} className="flex justify-between items-center">
                        <span className="capitalize">{field}:</span>
                        <Badge variant={(fieldResult as any).match ? "default" : "destructive"}>
                          {(fieldResult as any).match ? "✓" : "✗"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="quality" className="space-y-4">
                  {dashboardQuality && reportsQuality && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Dashboard Quality</span>
                          <span className="text-sm">{Math.round(dashboardQuality.score)}%</span>
                        </div>
                        <Progress value={dashboardQuality.score} />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Reports Quality</span>
                          <span className="text-sm">{Math.round(reportsQuality.score)}%</span>
                        </div>
                        <Progress value={reportsQuality.score} />
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}