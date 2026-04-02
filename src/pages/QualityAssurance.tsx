import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invokeSecureFunction } from "@/lib/secureInvoke";
import { ValidationFlagsDisplay } from "@/components/reports/ValidationFlagsDisplay";
import { DataQualityIndicator } from "@/components/reports/DataQualityIndicator";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import type { ValidationFlag, DataSources } from "@/types/validation";
import type { Json } from "@/integrations/supabase/types";

interface QAReport {
  id: string;
  property_address: string;
  created_at: string;
  calculation_version: string;
  validation_flags: Json;
  data_sources: Json;
  status: string;
}

interface QAMetrics {
  totalReports: number;
  reportsWithIssues: number;
  avgQualityScore: number;
  criticalIssues: number;
  highPriorityIssues: number;
  reportsLast24h: number;
  qualityTrend: 'up' | 'down' | 'stable';
}

export default function QualityAssurance() {
  const { canEdit: canEditQA } = useModulePermissions('quality_assurance');
  const [reports, setReports] = useState<QAReport[]>([]);
  const [metrics, setMetrics] = useState<QAMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<QAReport | null>(null);

  useEffect(() => {
    loadQAData();
  }, []);

  const loadQAData = async () => {
    try {
      setLoading(true);

      // Fetch reports with validation data via edge function
      const { data, error: reportsError } = await invokeSecureFunction('get-investment-reports', {
        listMode: true,
        listOptions: {
          select: 'id, property_address, created_at, calculation_version, validation_flags, data_sources, status',
          limit: 100
        }
      });

      if (reportsError || !data?.success) throw new Error(data?.error || reportsError?.message);
      
      const reportsData = data.reports || [];

      setReports(reportsData);

      // Calculate metrics
      const totalReports = (reportsData || []).length;
      const reportsWithIssues = (reportsData || []).filter(r => 
        Array.isArray(r.validation_flags) && (r.validation_flags as unknown as ValidationFlag[]).length > 0
      ).length;

      const criticalIssues = (reportsData || []).reduce((sum, r) => {
        if (!Array.isArray(r.validation_flags)) return sum;
        return sum + (r.validation_flags as unknown as ValidationFlag[]).filter(f => f.severity === 'critical').length;
      }, 0);

      const highPriorityIssues = (reportsData || []).reduce((sum, r) => {
        if (!Array.isArray(r.validation_flags)) return sum;
        return sum + (r.validation_flags as unknown as ValidationFlag[]).filter(f => f.severity === 'high').length;
      }, 0);

      const last24h = new Date();
      last24h.setHours(last24h.getHours() - 24);
      const reportsLast24h = (reportsData || []).filter(r => 
        new Date(r.created_at) > last24h
      ).length;

      // Calculate average quality score
      const qualityScores = (reportsData || []).map(r => {
        if (!Array.isArray(r.validation_flags)) return 100;
        let score = 100;
        (r.validation_flags as unknown as ValidationFlag[]).forEach(flag => {
          if (flag.severity === 'critical') score -= 15;
          else if (flag.severity === 'high') score -= 10;
          else if (flag.severity === 'medium') score -= 5;
          else score -= 2;
        });
        return Math.max(0, score);
      });

      const avgQualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
        : 0;

      // Determine trend (simple: compare last 10 vs previous 10)
      const recent10 = qualityScores.slice(0, 10);
      const previous10 = qualityScores.slice(10, 20);
      const recentAvg = recent10.length > 0 ? recent10.reduce((a, b) => a + b, 0) / recent10.length : 0;
      const previousAvg = previous10.length > 0 ? previous10.reduce((a, b) => a + b, 0) / previous10.length : 0;
      
      let qualityTrend: 'up' | 'down' | 'stable' = 'stable';
      if (recentAvg > previousAvg + 5) qualityTrend = 'up';
      else if (recentAvg < previousAvg - 5) qualityTrend = 'down';

      setMetrics({
        totalReports,
        reportsWithIssues,
        avgQualityScore,
        criticalIssues,
        highPriorityIssues,
        reportsLast24h,
        qualityTrend
      });

    } catch (error) {
      console.error('Error loading QA data:', error);
      toast.error('Failed to load quality assurance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadQAData();
  };

  const getQualityScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 75) return 'text-blue-600 dark:text-blue-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const calculateReportQualityScore = (flags: Json): number => {
    if (!Array.isArray(flags)) return 100;
    let score = 100;
    (flags as unknown as ValidationFlag[]).forEach(flag => {
      if (flag.severity === 'critical') score -= 15;
      else if (flag.severity === 'high') score -= 10;
      else if (flag.severity === 'medium') score -= 5;
      else score -= 2;
    });
    return Math.max(0, score);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quality Assurance Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor report quality, validation issues, and data accuracy
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Metrics Overview */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metrics.totalReports}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.reportsLast24h} in last 24h
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average Quality Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${getQualityScoreColor(metrics.avgQualityScore)}`}>
                  {metrics.avgQualityScore}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {metrics.qualityTrend === 'up' && (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-green-600">Improving</span>
                    </>
                  )}
                  {metrics.qualityTrend === 'down' && (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-red-600">Declining</span>
                    </>
                  )}
                  {metrics.qualityTrend === 'stable' && (
                    <span className="text-xs text-muted-foreground">Stable</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Reports with Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metrics.reportsWithIssues}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.totalReports > 0 
                    ? Math.round((metrics.reportsWithIssues / metrics.totalReports) * 100)
                    : 0}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Critical Issues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">{metrics.criticalIssues}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.highPriorityIssues} high priority
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Reports List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>
              Click on a report to view detailed validation results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All Reports</TabsTrigger>
                <TabsTrigger value="issues">With Issues</TabsTrigger>
                <TabsTrigger value="clean">Clean</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3 mt-4">
                {reports.map(report => {
                  const qualityScore = calculateReportQualityScore(report.validation_flags);
                  const hasIssues = Array.isArray(report.validation_flags) && (report.validation_flags as unknown as ValidationFlag[]).length > 0;
                  
                  return (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedReport(report)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{report.property_address}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(report.created_at).toLocaleString()} • v{report.calculation_version || '1.0.0'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <DataQualityIndicator dataSources={report.data_sources as unknown as DataSources} inline />
                        
                        <div className="text-center min-w-[60px]">
                          <div className={`text-lg font-bold ${getQualityScoreColor(qualityScore)}`}>
                            {qualityScore}
                          </div>
                          <div className="text-xs text-muted-foreground">Score</div>
                        </div>

                        {hasIssues ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {(report.validation_flags as unknown as ValidationFlag[]).length}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Clean
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="issues" className="space-y-3 mt-4">
                {reports.filter(r => Array.isArray(r.validation_flags) && (r.validation_flags as unknown as ValidationFlag[]).length > 0).map(report => {
                  const qualityScore = calculateReportQualityScore(report.validation_flags);
                  
                  return (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedReport(report)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{report.property_address}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(report.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <DataQualityIndicator dataSources={report.data_sources as unknown as DataSources} inline />
                        
                        <div className="text-center min-w-[60px]">
                          <div className={`text-lg font-bold ${getQualityScoreColor(qualityScore)}`}>
                            {qualityScore}
                          </div>
                          <div className="text-xs text-muted-foreground">Score</div>
                        </div>

                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {(report.validation_flags as unknown as ValidationFlag[]).length}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="clean" className="space-y-3 mt-4">
                {reports.filter(r => !Array.isArray(r.validation_flags) || (r.validation_flags as unknown as ValidationFlag[]).length === 0).map(report => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedReport(report)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{report.property_address}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(report.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <DataQualityIndicator dataSources={report.data_sources as unknown as DataSources} inline />
                      
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Clean
                      </Badge>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Selected Report Details */}
        {selectedReport && (
          <ValidationFlagsDisplay
            flags={(selectedReport.validation_flags as unknown as ValidationFlag[]) || []}
            qualityScore={calculateReportQualityScore(selectedReport.validation_flags)}
          />
        )}
      </div>
    );
  }
