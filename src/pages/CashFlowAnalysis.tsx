import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CashFlowAnalysisModal } from '@/components/reports/CashFlowAnalysisModal';
import { format } from 'date-fns';
import { Calculator, Search, FileText, TrendingUp, DollarSign, ArrowRight, Building, Home, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logActivityDirect } from '@/hooks/useActivityLogger';

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content?: string;
  sources_content?: string | null;
  created_at: string;
  current_version?: number;
  report_scope?: string;
  status?: string;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
}

type BuildTypeFilter = 'all' | 'new_build' | 'existing_property' | 'land_only';

export default function CashFlowAnalysis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<InvestmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [buildTypeFilter, setBuildTypeFilter] = useState<BuildTypeFilter>('all');
  const [selectedReport, setSelectedReport] = useState<InvestmentReport | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [hasHandledDeepLink, setHasHandledDeepLink] = useState(false);
  
  const { toast } = useToast();
  
  // 30-day cutoff for active reports - memoized to prevent recreation on each render
  const thirtyDaysAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }, []);

  useEffect(() => {
    fetchReports();
  }, []);

  // Handle deep-linking: auto-open analysis from URL params
  useEffect(() => {
    if (loading || hasHandledDeepLink || reports.length === 0) return;
    
    const reportId = searchParams.get('reportId');
    const action = searchParams.get('action'); // 'view' or 'analyze' (default: analyze)
    
    if (reportId) {
      const report = reports.find(r => r.id === reportId);
      if (report) {
        if (action === 'view') {
          // For viewing the full report, redirect to Generated Reports page
          navigate(`/generated-reports?reportId=${reportId}`, { replace: true });
        } else {
          // Default action is to open cash flow analysis modal
          setSelectedReport(report);
          setAnalysisModalOpen(true);
          // Clear URL params after handling
          setSearchParams({}, { replace: true });
        }
      } else {
        toast({
          title: "Report not found",
          description: "The requested report could not be found or doesn't have required cash flow data.",
          variant: "destructive",
        });
        setSearchParams({}, { replace: true });
      }
      setHasHandledDeepLink(true);
    }
  }, [loading, reports, searchParams, hasHandledDeepLink, navigate]);

  const hasRequiredData = (report: InvestmentReport) => {
    const fc = report.financial_calculations || {};
    const mo = report.manual_overrides || {};
    
    // Check for purchase price (required) - rent is optional but helpful
    const hasPrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue;
    
    // For now, only require price - rent can be estimated or added later
    return !!hasPrice;
  };

  const getBuildType = (report: InvestmentReport): 'new_build' | 'existing_property' | 'land_only' => {
    const buildType = report.manual_overrides?.buildType;
    if (buildType === 'new_build' || buildType === 'land_only') return buildType;
    return 'existing_property';
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      // IMPORTANT: do not fetch report_content for the list view (very large payload)
      // Apply 30-day cutoff and exclude archived reports
      const { data, error } = await invokeSecureFunction('get-investment-reports', {
        listMode: true,
        listOptions: {
          select: 'id, property_address, property_listing_id, created_at, current_version, report_scope, status, manual_overrides, financial_calculations, investment_score, is_archived',
          status: 'completed',
          isArchived: false,
          createdAfter: thirtyDaysAgo.toISOString(),
          orderBy: 'created_at',
          orderAsc: false
        }
      });

      if (error) throw new Error(error.message);
      
      // Filter to only include reports with required cash flow data
      const reportsWithCashFlowData = (data?.reports || []).filter(hasRequiredData);
      setReports(reportsWithCashFlowData);
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast({
        title: "Error",
        description: "Failed to load investment reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.property_address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBuildType = buildTypeFilter === 'all' || getBuildType(report) === buildTypeFilter;
    return matchesSearch && matchesBuildType;
  });

  const getInvestmentGrade = (report: InvestmentReport) => {
    const score = report.investment_score?.overall_score;
    if (!score) return null;
    
    if (score >= 85) return { grade: 'A+', color: 'bg-emerald-500' };
    if (score >= 75) return { grade: 'A', color: 'bg-green-500' };
    if (score >= 65) return { grade: 'B+', color: 'bg-lime-500' };
    if (score >= 55) return { grade: 'B', color: 'bg-yellow-500' };
    if (score >= 50) return { grade: 'C+', color: 'bg-amber-500' };
    if (score >= 45) return { grade: 'C', color: 'bg-orange-500' };
    if (score >= 35) return { grade: 'D', color: 'bg-red-400' };
    return { grade: 'F', color: 'bg-red-600' };
  };

  const handleViewAnalysis = (report: InvestmentReport) => {
    setSelectedReport(report);
    setAnalysisModalOpen(true);
    
    // Log cash flow analysis viewed
    logActivityDirect({
      actionType: 'cash_flow_created',
      entityType: 'cash_flow_analysis',
      entityId: report.id,
      entityName: report.property_address,
      metadata: { action: 'view_analysis' }
    });
  };

  return (
    <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              <span className="hidden sm:inline">10-Year Cash Flow Analysis</span>
              <span className="sm:hidden">Cash Flow</span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Generate detailed 10-year cash flow projections
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">How it works</h3>
                <p className="text-sm text-muted-foreground">
                  Cash flow analysis uses data from your investment report's manual overrides. 
                  First, configure the required fields (purchase price, rent, interest rate, etc.) 
                  in the Manual Data Override modal, then generate the 10-year projection here.
                  <span className="block mt-1 text-xs opacity-75">
                    Showing reports from the last 30 days. Archived reports are hidden.
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by property address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={buildTypeFilter} onValueChange={(value: BuildTypeFilter) => setBuildTypeFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Build Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Build Types</SelectItem>
              <SelectItem value="new_build">New Build</SelectItem>
              <SelectItem value="existing_property">Existing Property</SelectItem>
              <SelectItem value="land_only">Land Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mt-2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center pt-6">
              <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Reports Ready for Cash Flow Analysis</h3>
              <p className="text-muted-foreground mb-4 max-w-md">
                Reports need purchase price and weekly rent data configured via Manual Data Overrides before they can be analyzed.
              </p>
              <Button onClick={() => navigate('/generated-reports')}>
                Configure Reports
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => {
              const gradeInfo = getInvestmentGrade(report);
              const fc = report.financial_calculations || {};
              const mo = report.manual_overrides || {};
              
              const purchasePrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0;
              const weeklyRent = mo.weeklyRent || fc.weeklyRent || 0;
              const buildType = getBuildType(report);
              const isNewBuild = buildType === 'new_build';
              const isLandOnly = buildType === 'land_only';

              return (
                <Card key={report.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2">
                        {report.property_address}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge 
                          variant={isNewBuild ? "default" : isLandOnly ? "outline" : "secondary"}
                          className="text-xs"
                        >
                          {isNewBuild ? (
                            <><Building className="h-3 w-3 mr-1" />New Build</>
                          ) : isLandOnly ? (
                            <><MapPin className="h-3 w-3 mr-1" />Land Only</>
                          ) : (
                            <><Home className="h-3 w-3 mr-1" />Existing</>
                          )}
                        </Badge>
                        {gradeInfo && (
                          <Badge className={`${gradeInfo.color} text-white`}>
                            {gradeInfo.grade}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {format(new Date(report.created_at), 'dd MMM yyyy')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-medium">${purchasePrice.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Weekly Rent</p>
                        <p className="font-medium">${weeklyRent.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/investment-report/${report.id}`)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View Report
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleViewAnalysis(report)}
                      >
                        <Calculator className="h-4 w-4 mr-1" />
                        Cash Flow
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Cash Flow Analysis Modal */}
        <CashFlowAnalysisModal
          report={selectedReport}
          isOpen={analysisModalOpen}
          onClose={() => {
            setAnalysisModalOpen(false);
            setSelectedReport(null);
          }}
          onReportUpdated={() => {
            fetchReports();
            // Also update the selected report if it was modified
            if (selectedReport) {
              invokeSecureFunction('get-investment-reports', {
                reportId: selectedReport.id,
                listOptions: {
                  select: 'id, property_address, property_listing_id, report_content, created_at, current_version, report_scope, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence'
                }
              }).then(({ data }) => {
                if (data?.report) setSelectedReport(data.report);
              });
            }
          }}
        />

    </div>
  );
}
