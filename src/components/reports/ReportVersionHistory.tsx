import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { History, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface VersionHistoryProps {
  reportId: string;
  currentVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Version {
  version_number: number;
  created_at: string;
  quality_score: number;
  validation_count: number;
  changelog: string;
  changes_summary: {
    property_specs_changed: boolean;
    financial_data_changed: boolean;
    validation_flags_changed: boolean;
    content_length: number;
    data_sources_count: number;
  };
}

export function ReportVersionHistory({ reportId, currentVersion, open, onOpenChange }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  useEffect(() => {
    if (open) {
      fetchVersionHistory();
    }
  }, [open, reportId]);

  const fetchVersionHistory = async () => {
    try {
      setLoading(true);
      
      // Use RPC to call the get_report_changelog function
      const { data, error } = await supabase.rpc('get_report_changelog', {
        p_report_id: reportId,
        p_version_from: null,
        p_version_to: null
      });

      if (error) {
        console.error('Error fetching version history:', error);
        toast.error('Failed to load version history');
        return;
      }

      setVersions((data || []) as unknown as Version[]);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const getQualityScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 75) return 'text-blue-600 dark:text-blue-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getQualityTrend = (currentScore: number, previousScore: number | null): JSX.Element | null => {
    if (previousScore === null) return null;
    
    if (currentScore > previousScore) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (currentScore < previousScore) {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    }
    return null;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>Loading version history...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            Track changes and improvements across {versions.length} version{versions.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">No version history yet</p>
                    <p className="text-sm text-muted-foreground">
                      Version history will appear here when you regenerate this report
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {versions.map((version, index) => {
                    const previousVersion = versions[index + 1];
                    const isCurrent = version.version_number === currentVersion;
                    
                    return (
                      <Card key={version.version_number} className={isCurrent ? 'border-primary' : ''}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base">
                                Version {version.version_number}
                              </CardTitle>
                              {isCurrent && (
                                <Badge variant="default">Current</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`text-2xl font-bold ${getQualityScoreColor(version.quality_score)}`}>
                                {version.quality_score}
                              </div>
                              {previousVersion && getQualityTrend(version.quality_score, previousVersion.quality_score)}
                            </div>
                          </div>
                          <CardDescription className="text-xs">
                            {format(new Date(version.created_at), 'PPp')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Quality Metrics */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Validation Issues:</span>
                              <div className="flex items-center gap-1">
                                {version.validation_count === 0 ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <span className="font-medium text-green-600">None</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3 w-3 text-yellow-600" />
                                    <span className="font-medium">{version.validation_count}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Data Sources:</span>
                              <span className="font-medium">{version.changes_summary.data_sources_count}</span>
                            </div>
                          </div>

                          {/* Changelog */}
                          {version.changelog && (
                            <div className="pt-2">
                              <p className="text-sm text-muted-foreground italic">
                                {version.changelog}
                              </p>
                            </div>
                          )}

                          {/* Change Indicators */}
                          {previousVersion && (
                            <div className="pt-2 space-y-1">
                              <Separator className="mb-2" />
                              <p className="text-xs font-medium text-muted-foreground">Changes from previous version:</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {version.changes_summary.property_specs_changed && (
                                  <div className="flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3 text-blue-600" />
                                    <span>Property specs updated</span>
                                  </div>
                                )}
                                {version.changes_summary.financial_data_changed && (
                                  <div className="flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3 text-blue-600" />
                                    <span>Financial data updated</span>
                                  </div>
                                )}
                                {version.changes_summary.validation_flags_changed && (
                                  <div className="flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3 text-blue-600" />
                                    <span>Validation results changed</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    Content: {version.changes_summary.content_length.toLocaleString()} chars
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full mt-2"
                            onClick={() => setSelectedVersion(version)}
                          >
                            View Details
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quality Score Trend</CardTitle>
                <CardDescription>How report quality has evolved over time</CardDescription>
              </CardHeader>
              <CardContent>
                {versions.length > 0 ? (
                  <div className="space-y-2">
                    {versions.slice().reverse().map((version, index) => (
                      <div key={version.version_number} className="flex items-center gap-4">
                        <div className="w-20 text-sm text-muted-foreground">
                          v{version.version_number}
                        </div>
                        <div className="flex-1">
                          <div className="h-8 bg-muted rounded-md overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                version.quality_score >= 90 ? 'bg-green-600' :
                                version.quality_score >= 75 ? 'bg-blue-600' :
                                version.quality_score >= 60 ? 'bg-yellow-600' :
                                'bg-red-600'
                              }`}
                              style={{ width: `${version.quality_score}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-16 text-right font-medium">
                          {version.quality_score}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No data available for comparison
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
