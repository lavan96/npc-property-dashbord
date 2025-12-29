import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ComparisonBasket } from '@/components/reports/ComparisonBasket';
import { useComparison } from '@/contexts/ComparisonContext';
import { format } from 'date-fns';
import { Download, Eye, FileText, Calendar, BarChart3, TrendingUp, MapPin, History, RefreshCw, Home, Building2, Map, Globe, Star, Zap, Compass, Loader2, SlidersHorizontal, Archive, ArchiveRestore } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { RegenerateReportButton } from '@/components/reports/RegenerateReportButton';
import { RegenerateWithPerplexityButton } from '@/components/reports/RegenerateWithPerplexityButton';

// Lazy load heavy modal components
const InvestmentReportViewer = lazy(() => import('@/components/reports/InvestmentReportViewer').then(m => ({ default: m.InvestmentReportViewer })));
const PropertyComparisonModal = lazy(() => import('@/components/reports/PropertyComparisonModal').then(m => ({ default: m.PropertyComparisonModal })));
const ComparisonViewer = lazy(() => import('@/components/reports/ComparisonViewer').then(m => ({ default: m.ComparisonViewer })));
const ReportVersionHistory = lazy(() => import('@/components/reports/ReportVersionHistory').then(m => ({ default: m.ReportVersionHistory })));
const ManualDataOverrideModal = lazy(() => import('@/components/reports/ManualDataOverrideModal').then(m => ({ default: m.ManualDataOverrideModal })));

// Non-lazy imports for components used inline without Suspense
import { TierBadge, type ReportTier } from '@/components/reports/TierBadge';

// Loading fallback for modals
const ModalLoader = () => (
  <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
    <div className="bg-card rounded-lg p-8 shadow-lg">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-4 w-64 mb-2" />
      <Skeleton className="h-4 w-56" />
    </div>
  </div>
);

interface GeneratedReport {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  listing_count: number;
  chart_images: any;
  kpis: any;
  analytics: any;
  insights: any;
  config: any;
}

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content?: string;
  sources_content?: string | null;
  created_at: string;
  current_version: number;
  report_scope?: string; // Track report generation scope
  report_tier?: 'compass' | 'briefing' | 'snapshot'; // Report tier
  parent_report_id?: string | null;
  status?: string;
  is_archived?: boolean;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
}

interface ComparisonAnalysis {
  id: string;
  property_count: number;
  property_addresses?: string[];
  property_states?: string[];
  report_title?: string;
  report_ids: string[];
  created_at: string;
  analysis_summary: string | null;
  executive_summary: string | null;
  rankings: any;
  recommendations: any;
  financial_comparison: any;
  location_comparison: any;
  risk_comparison: any;
  red_flags: any;
}

export default function GeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [investmentReports, setInvestmentReports] = useState<InvestmentReport[]>([]);
  const [comparisons, setComparisons] = useState<ComparisonAnalysis[]>([]);
  const [selectedInvestmentReport, setSelectedInvestmentReport] = useState<InvestmentReport | null>(null);
  const [selectedComparison, setSelectedComparison] = useState<ComparisonAnalysis | null>(null);
  const [investmentViewerOpen, setInvestmentViewerOpen] = useState(false);
  const [comparisonViewerOpen, setComparisonViewerOpen] = useState(false);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [selectedReportForHistory, setSelectedReportForHistory] = useState<InvestmentReport | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedReportForOverride, setSelectedReportForOverride] = useState<InvestmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoGeneratedReportIds, setAutoGeneratedReportIds] = useState<Set<string>>(new Set());
  
  // Pagination & Search states
  const [investmentPage, setInvestmentPage] = useState(1);
  const [investmentSearchQuery, setInvestmentSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all'); // Filter by scope
  const [gradeFilter, setGradeFilter] = useState<string>('all'); // Filter by investment grade
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]); // Filter by score range
  const [tierFilter, setTierFilter] = useState<string>('all'); // Filter by report tier
  const [showArchived, setShowArchived] = useState(false); // Show archived reports
  const [generatingTier, setGeneratingTier] = useState<{ reportId: string; tier: ReportTier } | null>(null);
  const reportsPerPage = 50;
  
  // 30-day cutoff for active reports
  const thirtyDaysAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString();
  }, []);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { selectedReports, addReport, removeReport, isSelected, canAddMore } = useComparison();
  const isMobile = useIsMobile(); // Must be called before any early returns

  const [activeTab, setActiveTab] = useState<'quantitative' | 'investment' | 'comparisons'>(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'investment' || tabParam === 'comparisons' || tabParam === 'quantitative') return tabParam;
    return searchParams.get('reportId') ? 'investment' : 'quantitative';
  });
  const [lastHandledReportId, setLastHandledReportId] = useState<string | null>(null);

  // Helper function to get grade color classes
  const getGradeColor = (grade: string): string => {
    switch (grade?.toUpperCase()) {
      case 'A+': return 'bg-emerald-500 text-white';
      case 'A': return 'bg-green-500 text-white';
      case 'B+': return 'bg-teal-500 text-white';
      case 'B': return 'bg-yellow-500 text-black';
      case 'C+': return 'bg-amber-500 text-black';
      case 'C': return 'bg-orange-500 text-white';
      case 'D': return 'bg-red-400 text-white';
      case 'F': return 'bg-red-600 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Helper function to get score color
  const getScoreColor = (score: number): string => {
    if (score >= 85) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 75) return 'text-green-600 dark:text-green-400';
    if (score >= 65) return 'text-teal-600 dark:text-teal-400';
    if (score >= 55) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 45) return 'text-amber-600 dark:text-amber-400';
    if (score >= 35) return 'text-orange-600 dark:text-orange-400';
    if (score >= 25) return 'text-red-400 dark:text-red-300';
    return 'text-red-600 dark:text-red-400';
  };

  const fetchInvestmentReportDetails = async (reportId: string): Promise<InvestmentReport | null> => {
    const { data, error } = await supabase
      .from('investment_reports')
      .select(
        'id, property_address, property_listing_id, report_content, sources_content, created_at, current_version, report_scope, report_tier, parent_report_id, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence'
      )
      .eq('id', reportId)
      .maybeSingle();

    if (error) throw error;
    return (data || null) as any;
  };

  const downloadInvestmentReportText = async (report: Pick<InvestmentReport, 'id' | 'property_address' | 'created_at'>) => {
    try {
      const full = await fetchInvestmentReportDetails(report.id);
      if (!full?.report_content) {
        throw new Error('Report content is missing');
      }

      const blob = new Blob([full.report_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investment-report-${report.property_address.replace(/[^a-zA-Z0-9]/g, '-')}-${format(new Date(report.created_at), 'yyyy-MM-dd')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download failed:', error);
      toast({
        title: 'Download failed',
        description: error?.message || 'Could not download this report.',
        variant: 'destructive',
      });
    }
  };

  // Filter and paginate investment reports
  const filteredInvestmentReports = investmentReports.filter(report => {
    const matchesSearch = report.property_address.toLowerCase().includes(investmentSearchQuery.toLowerCase());
    const matchesScope = scopeFilter === 'all' || report.report_scope === scopeFilter;
    
    // Grade filter
    const reportGrade = report.investment_score?.grade?.toUpperCase() || '';
    const matchesGrade = gradeFilter === 'all' || reportGrade === gradeFilter;
    
    // Score range filter
    const reportScore = report.investment_score?.totalScore || 0;
    const matchesScore = reportScore >= scoreRange[0] && reportScore <= scoreRange[1];
    
    // Tier filter
    const reportTier = report.report_tier || 'compass';
    const matchesTier = tierFilter === 'all' || reportTier === tierFilter;
    
    // Archive filter - show archived only when toggle is on
    const matchesArchive = showArchived ? report.is_archived === true : report.is_archived !== true;
    
    return matchesSearch && matchesScope && matchesGrade && matchesScore && matchesTier && matchesArchive;
  });
  
  const totalInvestmentPages = Math.ceil(filteredInvestmentReports.length / reportsPerPage);
  const paginatedInvestmentReports = filteredInvestmentReports.slice(
    (investmentPage - 1) * reportsPerPage,
    investmentPage * reportsPerPage
  );

  useEffect(() => {
    fetchReports();
    fetchInvestmentReports();
    fetchComparisons();
    fetchAutoGeneratedReportIds();

    // Listen for custom event to refresh comparisons
    const handleRefreshComparisons = () => {
      console.log('📊 Refreshing comparisons from event');
      fetchComparisons();
    };

    window.addEventListener('refreshComparisons', handleRefreshComparisons);
    return () => {
      window.removeEventListener('refreshComparisons', handleRefreshComparisons);
    };
  }, []);

  // Handle deep-linking: auto-open report from URL params (e.g., /generated-reports?reportId=...)
  useEffect(() => {
    if (investmentReports.length === 0) return;

    const reportId = (searchParams.get('reportId') || '').trim();

    if (reportId && reportId !== lastHandledReportId) {
      setActiveTab('investment');

      let cancelled = false;

      const openFromDeepLink = async () => {
        console.log('🔗 Deep-link open requested', { reportId });

        // First try from the already-loaded list
        let report = investmentReports.find(r => r.id === reportId) as any;
        console.log('🔗 Deep-link report found in list?', { found: !!report, listCount: investmentReports.length });

        // If not found in-memory (pagination / fetch limits), fetch directly by id
        if (!report) {
          const { data, error } = await supabase
            .from('investment_reports')
            .select('id')
            .eq('id', reportId)
            .maybeSingle();

          if (error) {
            console.error('Deep-link fetch error:', error);
          }

          report = data as any;
          console.log('🔗 Deep-link report fetched?', { fetched: !!report });
        }

        if (cancelled) return;

        if (report?.id) {
          try {
            const full = await fetchInvestmentReportDetails(report.id);
            if (cancelled) return;

            if (full) {
              setSelectedInvestmentReport(full);
              setInvestmentViewerOpen(true);
            } else {
              toast({
                title: 'Report not found',
                description: 'The requested investment report could not be found.',
                variant: 'destructive',
              });
            }
          } catch (error: any) {
            console.error('Deep-link details fetch error:', error);
            toast({
              title: 'Could not open report',
              description: error?.message || 'Failed to load report details.',
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Report not found',
            description: 'The requested investment report could not be found.',
            variant: 'destructive',
          });
        }

        setLastHandledReportId(reportId);
      };

      openFromDeepLink();

      return () => {
        cancelled = true;
      };
    }

    // Backwards compatibility: legacy localStorage deep-link
    if (!reportId && lastHandledReportId === null) {
      const openReportId = localStorage.getItem('openReportId');
      if (openReportId) {
        localStorage.removeItem('openReportId');
        setActiveTab('investment');

        const report = investmentReports.find(r => r.id === openReportId);
        if (report) {
          handleViewInvestmentReport(report);
          setLastHandledReportId(openReportId);
        }
      }
    }
  }, [investmentReports, searchParams, lastHandledReportId, toast]);

  useEffect(() => {
    // Listen for custom event to open a specific report
    const handleOpenReport = (event: CustomEvent) => {
      const { reportId } = event.detail;
      const report = investmentReports.find(r => r.id === reportId);
      if (report) {
        handleViewInvestmentReport(report);
      }
    };

    window.addEventListener('openReport', handleOpenReport as EventListener);
    return () => {
      window.removeEventListener('openReport', handleOpenReport as EventListener);
    };
  }, [investmentReports]); // Keep this separate for event handling

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reports:', error);
        toast({
          title: "Error fetching reports",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setReports(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Failed to fetch reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvestmentReports = async () => {
    try {
      console.log('🔍 Fetching investment reports (list view)...');

      // IMPORTANT: do not fetch report_content for the list view (very large payload)
      // Apply 30-day cutoff for non-archived reports to reduce payload
      const { data, error } = await supabase
        .from('investment_reports')
        .select(
          'id, property_address, property_listing_id, created_at, current_version, report_scope, report_tier, parent_report_id, status, is_archived, manual_overrides, financial_calculations, investment_score'
        )
        .in('status', ['completed', 'pending'])
        .gte('created_at', thirtyDaysAgo)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      console.log('📊 Investment reports response:', { count: data?.length, error });

      if (error) {
        console.error('❌ Error fetching investment reports:', error);
        toast({
          title: 'Error fetching investment reports',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      setInvestmentReports((data || []) as InvestmentReport[]);
    } catch (error) {
      console.error('💥 Exception:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch investment reports',
        variant: 'destructive',
      });
    }
  };
  
  // Fetch archived reports separately when needed
  const fetchArchivedReports = async () => {
    try {
      console.log('📦 Fetching archived investment reports...');
      
      const { data, error } = await supabase
        .from('investment_reports')
        .select(
          'id, property_address, property_listing_id, created_at, current_version, report_scope, report_tier, parent_report_id, status, is_archived, manual_overrides, financial_calculations, investment_score'
        )
        .in('status', ['completed', 'pending'])
        .eq('is_archived', true)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('❌ Error fetching archived reports:', error);
        return;
      }

      // Merge with existing reports
      setInvestmentReports(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const newArchived = (data || []).filter(r => !existingIds.has(r.id));
        return [...prev, ...(newArchived as InvestmentReport[])];
      });
    } catch (error) {
      console.error('💥 Exception:', error);
    }
  };
  
  // Archive a report
  const archiveReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('investment_reports')
        .update({ is_archived: true })
        .eq('id', reportId);
      
      if (error) throw error;
      
      // Update local state
      setInvestmentReports(prev => 
        prev.map(r => r.id === reportId ? { ...r, is_archived: true } : r)
      );
      
      toast({
        title: 'Report archived',
        description: 'The report has been archived and hidden from the main view.',
      });
    } catch (error: any) {
      console.error('Archive error:', error);
      toast({
        title: 'Failed to archive',
        description: error?.message || 'Could not archive the report.',
        variant: 'destructive',
      });
    }
  };
  
  // Unarchive a report
  const unarchiveReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('investment_reports')
        .update({ is_archived: false })
        .eq('id', reportId);
      
      if (error) throw error;
      
      // Update local state
      setInvestmentReports(prev => 
        prev.map(r => r.id === reportId ? { ...r, is_archived: false } : r)
      );
      
      toast({
        title: 'Report restored',
        description: 'The report has been restored to the main view.',
      });
    } catch (error: any) {
      console.error('Unarchive error:', error);
      toast({
        title: 'Failed to restore',
        description: error?.message || 'Could not restore the report.',
        variant: 'destructive',
      });
    }
  };
  
  // Toggle showing archived reports
  useEffect(() => {
    if (showArchived) {
      fetchArchivedReports();
    }
  }, [showArchived]);

  const fetchComparisons = async () => {
    try {
      // Cast to any to bypass TypeScript for property_comparisons table
      const { data, error } = await (supabase as any)
        .from('property_comparisons')
        .select('id, property_count, property_addresses, property_states, report_title, report_ids, created_at, analysis_summary, executive_summary, rankings, recommendations, financial_comparison, location_comparison, risk_comparison, red_flags')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comparisons:', error);
        toast({
          title: "Error fetching comparisons",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setComparisons((data || []) as ComparisonAnalysis[]);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchAutoGeneratedReportIds = async () => {
    try {
      // Use property_listing_id as the indicator for auto-generated reports
      // This is more reliable than checking the log table status
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id')
        .not('property_listing_id', 'is', null);

      if (error) {
        console.error('Error fetching auto-generated report IDs:', error);
        return;
      }

      const ids = new Set(data?.map(row => row.id) as string[]);
      setAutoGeneratedReportIds(ids);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleViewInvestmentReport = async (report: InvestmentReport) => {
    try {
      const full = await fetchInvestmentReportDetails(report.id);
      if (!full) {
        toast({
          title: 'Report not found',
          description: 'This report could not be loaded.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedInvestmentReport(full);
      setInvestmentViewerOpen(true);
    } catch (error: any) {
      console.error('Error opening report:', error);
      toast({
        title: 'Could not open report',
        description: error?.message || 'Failed to load report details.',
        variant: 'destructive',
      });
    }
  };

  const handleInvestmentReportUpdate = () => {
    // Refresh the investment reports list
    fetchInvestmentReports();
  };

  const handleComparisonUpdate = () => {
    // Refresh the comparisons list
    fetchComparisons();
  };

  const handleViewVersionHistory = (report: InvestmentReport) => {
    setSelectedReportForHistory(report);
    setVersionHistoryOpen(true);
  };

  const handleOpenOverrideModal = (report: InvestmentReport) => {
    setSelectedReportForOverride(report);
    setOverrideModalOpen(true);
  };

  const handleOverrideSave = async () => {
    // Refresh reports after override
    await fetchInvestmentReports();
    
    // Refetch the currently viewed report to show updated data
    if (selectedInvestmentReport) {
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, property_listing_id, report_content, sources_content, created_at, current_version, report_scope, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence')
        .eq('id', selectedInvestmentReport.id)
        .single();
      
      if (!error && data) {
        console.log('✅ Refetched report with updated overrides:', data);
        setSelectedInvestmentReport(data);
      }
    }
    
    // Also refetch the override report if different
    if (selectedReportForOverride && selectedReportForOverride.id !== selectedInvestmentReport?.id) {
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, property_listing_id, report_content, sources_content, created_at, current_version, report_scope, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence')
        .eq('id', selectedReportForOverride.id)
        .single();
      
      if (!error && data) {
        setSelectedReportForOverride(data);
      }
    }
  };

  // Generate condensed tier from a Compass report
  const handleGenerateTier = async (report: InvestmentReport, targetTier: ReportTier) => {
    if (report.report_tier !== 'compass') {
      toast({
        title: "Cannot Generate",
        description: "Condensed reports can only be generated from Compass reports.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingTier({ reportId: report.id, tier: targetTier });

    try {
      const { data, error } = await supabase.functions.invoke('condense-investment-report', {
        body: {
          parentReportId: report.id,
          targetTier,
        }
      });

      if (error) throw error;

      if (data?.success && data?.reportId) {
        toast({
          title: "Report Generated",
          description: `${targetTier === 'briefing' ? 'Executive Briefing' : 'Snapshot'} is ready`,
        });
        
        // Refresh the reports list
        fetchInvestmentReports();
      } else {
        throw new Error(data?.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating tier:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Failed to generate report tier',
        variant: "destructive",
      });
    } finally {
      setGeneratingTier(null);
    }
  };

  const handleToggleSelection = (report: InvestmentReport, checked: boolean) => {
    if (checked) {
      addReport({
        id: report.id,
        property_address: report.property_address,
        created_at: report.created_at
      });
    } else {
      removeReport(report.id);
    }
  };

  const handleCompare = () => {
    if (selectedReports.length < 2) {
      toast({
        title: "Select More Properties",
        description: "Please select at least 2 properties to compare.",
        variant: "destructive",
      });
      return;
    }
    setComparisonModalOpen(true);
  };

  const handleViewReport = (reportId: string) => {
    navigate(`/generated-reports/${reportId}`);
  };

  const handleDownloadPDF = async (report: GeneratedReport) => {
    try {
      // Navigate to the report view with a download flag
      navigate(`/generated-reports/${report.id}?download=true`);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download failed",
        description: "Could not generate PDF download",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Generated Reports</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-4 md:pt-6 pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:space-y-2">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Generated Reports</h2>
          <p className="text-sm md:text-base text-muted-foreground">
            View and download your generated property reports
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">{reports.length} quantitative</Badge>
          <Badge variant="outline" className="text-xs">{investmentReports.length} investment</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'quantitative' | 'investment' | 'comparisons')} className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className={isMobile ? "inline-flex w-auto min-w-full" : "grid w-full grid-cols-3"}>
            <TabsTrigger value="quantitative" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
              <BarChart3 className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Quantitative</span>
              <span className="sm:hidden">Quant.</span>
            </TabsTrigger>
            <TabsTrigger value="investment" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
              <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Investment
            </TabsTrigger>
            <TabsTrigger value="comparisons" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm whitespace-nowrap">
              <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Comparisons</span>
              <span className="sm:hidden">Compare</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="quantitative" className="space-y-4">
          {reports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">📊</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No quantitative reports generated yet</h3>
                  <p className="text-muted-foreground">
                    Generate your first report from the Reports page
                  </p>
                </div>
                <Button onClick={() => navigate('/reports')} className="mt-4">
                  <FileText className="mr-2 h-4 w-4" />
                  Go to Reports
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {reports.map((report) => (
                <Card key={report.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-start justify-between">
                      <span className="line-clamp-2">{report.title}</span>
                      <BarChart3 className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
                    </CardTitle>
                    {report.description && (
                      <CardDescription className="line-clamp-2">
                        {report.description}
                      </CardDescription>
                    )}
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Generated on {format(new Date(report.created_at), 'PPp')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Listings analyzed:</span>
                        <Badge variant="outline">{report.listing_count}</Badge>
                      </div>
                      {report.kpis && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Avg. Price:</span>
                          <span className="font-medium">
                            ${report.kpis.avg_price?.toLocaleString() || 'N/A'}
                          </span>
                        </div>
                      )}
                      {report.analytics?.quality && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Data Quality:</span>
                          <span className="font-medium">
                            {report.analytics.quality.avg_confidence?.toFixed(1) || 'N/A'}%
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewReport(report.id)}
                        className="flex-1"
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleDownloadPDF(report)}
                        className="flex-1"
                      >
                        <Download className="mr-1 h-3 w-3" />
                        PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="investment" className="space-y-4">
          {/* Search Bar & Filters */}
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Search by property address..."
                  value={investmentSearchQuery}
                  onChange={(e) => {
                    setInvestmentSearchQuery(e.target.value);
                    setInvestmentPage(1);
                  }}
                />
              </div>
              <Select value={scopeFilter} onValueChange={(value) => {
                setScopeFilter(value);
                setInvestmentPage(1);
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by scope" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Reports</SelectItem>
                  <SelectItem value="address" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      Property Analysis
                    </div>
                  </SelectItem>
                  <SelectItem value="suburb" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Suburb Analysis
                    </div>
                  </SelectItem>
                  <SelectItem value="zipcode" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    <div className="flex items-center gap-2">
                      <Map className="h-4 w-4" />
                      Area Analysis
                    </div>
                  </SelectItem>
                  <SelectItem value="state" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      State Analysis
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {/* Grade Filter */}
              <Select value={gradeFilter} onValueChange={(value) => {
                setGradeFilter(value);
                setInvestmentPage(1);
              }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by grade" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Grades</SelectItem>
                  <SelectItem value="A+">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-emerald-500 text-white">A+</span>
                      Grade A+
                    </div>
                  </SelectItem>
                  <SelectItem value="A">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-green-500 text-white">A</span>
                      Grade A
                    </div>
                  </SelectItem>
                  <SelectItem value="B+">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-teal-500 text-white">B+</span>
                      Grade B+
                    </div>
                  </SelectItem>
                  <SelectItem value="B">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-yellow-500 text-black">B</span>
                      Grade B
                    </div>
                  </SelectItem>
                  <SelectItem value="C+">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-amber-500 text-black">C+</span>
                      Grade C+
                    </div>
                  </SelectItem>
                  <SelectItem value="C">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-orange-500 text-white">C</span>
                      Grade C
                    </div>
                  </SelectItem>
                  <SelectItem value="D">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-red-400 text-white">D</span>
                      Grade D
                    </div>
                  </SelectItem>
                  <SelectItem value="F">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center bg-red-600 text-white">F</span>
                      Grade F
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Tier Filter */}
              <Select value={tierFilter} onValueChange={(value) => {
                setTierFilter(value);
                setInvestmentPage(1);
              }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by tier" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="compass">
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-amber-500" />
                      Compass (Full)
                    </div>
                  </SelectItem>
                  <SelectItem value="briefing">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Briefing (~20p)
                    </div>
                  </SelectItem>
                  <SelectItem value="snapshot">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-green-500" />
                      Snapshot (~5p)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {/* Archive Toggle */}
              <Button
                variant={showArchived ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                className="gap-2"
              >
                <Archive className="h-4 w-4" />
                {showArchived ? 'Viewing Archived' : 'Show Archived'}
              </Button>

              <Badge variant="secondary">
                {filteredInvestmentReports.length} of {investmentReports.filter(r => showArchived ? r.is_archived : !r.is_archived).length} reports
              </Badge>
              
              {!showArchived && (
                <span className="text-xs text-muted-foreground">
                  Showing last 30 days
                </span>
              )}
            </div>
            
            {/* Score Range Filter */}
            <div className="flex items-center gap-4 px-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-4 w-4" />
                <span>Score Range:</span>
              </div>
              <div className="flex-1 max-w-md flex items-center gap-4">
                <span className="text-sm font-medium w-8">{scoreRange[0]}</span>
                <Slider
                  value={scoreRange}
                  onValueChange={(value) => {
                    setScoreRange(value as [number, number]);
                    setInvestmentPage(1);
                  }}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-8">{scoreRange[1]}</span>
              </div>
              {(scoreRange[0] > 0 || scoreRange[1] < 100) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setScoreRange([0, 100])}
                  className="text-xs"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {filteredInvestmentReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">🏠</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No investment reports generated yet</h3>
                  <p className="text-muted-foreground">
                    Generate your first investment report from a property listing
                  </p>
                </div>
                <Button onClick={() => navigate('/listings')} className="mt-4">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Go to Listings
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {paginatedInvestmentReports.map((report) => (
                <Card key={report.id} className="overflow-hidden hover:shadow-lg transition-shadow relative">
                  <div className="absolute top-4 right-4 z-10">
                    <Checkbox
                      checked={isSelected(report.id)}
                      onCheckedChange={(checked) => handleToggleSelection(report, checked as boolean)}
                      disabled={!canAddMore && !isSelected(report.id)}
                      className="h-5 w-5 bg-background border-2"
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-start justify-between pr-8">
                      <div className="flex flex-col gap-1">
                        <span className="line-clamp-2">{report.property_address}</span>
                        {report.report_scope && (
                          <Badge 
                            variant="secondary"
                            className={`text-xs w-fit flex items-center gap-1 ${
                              report.report_scope === 'address' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300' :
                              report.report_scope === 'suburb' ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300' :
                              report.report_scope === 'zipcode' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
                            }`}
                          >
                            {report.report_scope === 'address' && (
                              <>
                                <Home className="h-3 w-3" />
                                Property Analysis
                              </>
                            )}
                            {report.report_scope === 'suburb' && (
                              <>
                                <Building2 className="h-3 w-3" />
                                Suburb Analysis
                              </>
                            )}
                            {report.report_scope === 'zipcode' && (
                              <>
                                <Map className="h-3 w-3" />
                                Area Analysis
                              </>
                            )}
                            {report.report_scope === 'state' && (
                              <>
                                <Globe className="h-3 w-3" />
                                State Analysis
                              </>
                            )}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {report.report_tier && (
                          <TierBadge tier={report.report_tier} showIcon={false} />
                        )}
                        {autoGeneratedReportIds.has(report.id) && (
                          <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300">
                            <Zap className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        )}
                        {report.status === 'pending' && (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                        <TrendingUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Generated on {format(new Date(report.created_at), 'PPp')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Investment Grade & Score Display */}
                    {report.investment_score && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg font-bold text-lg flex items-center justify-center ${getGradeColor(report.investment_score.grade)}`}>
                            {report.investment_score.grade || 'N/A'}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">Investment Grade</span>
                            <span className="text-sm font-medium">{report.investment_score.recommendation?.split(' ').slice(0, 2).join(' ') || 'Not rated'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-muted-foreground">Score</span>
                          <span className={`text-xl font-bold ${getScoreColor(report.investment_score.totalScore || 0)}`}>
                            {report.investment_score.totalScore || 0}<span className="text-sm font-normal text-muted-foreground">/100</span>
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">{report.property_address}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => navigate(`/investment-report/${report.id}`)}
                          className="flex-1"
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={() => downloadInvestmentReportText(report)}
                          className="flex-1"
                        >
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </Button>
                      </div>
                       <div className="flex gap-2">
                         <RegenerateReportButton
                          reportId={report.id}
                          propertyAddress={report.property_address}
                          onRegenerated={handleInvestmentReportUpdate}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        />
                        <RegenerateWithPerplexityButton
                          reportId={report.id}
                          propertyAddress={report.property_address}
                          onRegenerated={handleInvestmentReportUpdate}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewVersionHistory(report)}
                          className="flex-1"
                        >
                          <History className="mr-1 h-3 w-3" />
                          History ({report.current_version || 1})
                        </Button>
                        {/* Archive/Unarchive Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => report.is_archived ? unarchiveReport(report.id) : archiveReport(report.id)}
                          className="px-2"
                          title={report.is_archived ? "Restore report" : "Archive report"}
                        >
                          {report.is_archived ? (
                            <ArchiveRestore className="h-3 w-3 text-green-600" />
                          ) : (
                            <Archive className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {/* PDF download is available inside the report viewer (View) to avoid loading huge report payloads in the list. */}
                      
                      {/* Quick Tier Generation - Only show for Compass reports */}
                      {report.report_tier === 'compass' && (
                        <div className="border-t pt-3 mt-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Generate condensed versions:</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateTier(report, 'briefing')}
                              disabled={generatingTier?.reportId === report.id}
                              className="flex-1 text-xs"
                            >
                              {generatingTier?.reportId === report.id && generatingTier?.tier === 'briefing' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="mr-1 h-3 w-3 text-blue-500" />
                              )}
                              Briefing (~20p)
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateTier(report, 'snapshot')}
                              disabled={generatingTier?.reportId === report.id}
                              className="flex-1 text-xs"
                            >
                              {generatingTier?.reportId === report.id && generatingTier?.tier === 'snapshot' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="mr-1 h-3 w-3 text-green-500" />
                              )}
                              Snapshot (~5p)
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalInvestmentPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestmentPage(p => Math.max(1, p - 1))}
                  disabled={investmentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {investmentPage} of {totalInvestmentPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInvestmentPage(p => Math.min(totalInvestmentPages, p + 1))}
                  disabled={investmentPage === totalInvestmentPages}
                >
                  Next
                </Button>
              </div>
            )}
            </>
          )}
        </TabsContent>

        <TabsContent value="comparisons" className="space-y-4">
          {comparisons.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-96 space-y-4">
                <div className="text-6xl text-muted-foreground">🔄</div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">No Comparison Analyses Yet</h3>
                  <p className="text-muted-foreground">
                    Select 2-5 investment reports and click "Compare Properties" to create your first comparison analysis
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {comparisons.map((comparison: any) => (
                <Card key={comparison.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      {comparison.report_title || `${comparison.property_count} Property Comparison`}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(comparison.created_at), 'MMM dd, yyyy')}
                      </div>
                      {comparison.property_states && comparison.property_states.length > 0 && (
                        <div className="text-xs">
                          States: {comparison.property_states.join(', ')}
                        </div>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {comparison.executive_summary && (
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {comparison.executive_summary}
                      </p>
                    )}
                    {comparison.rankings && comparison.rankings.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Top Ranked:</p>
                        <Badge variant="default">
                          {comparison.rankings[0]?.address || `Property #${comparison.rankings[0]?.propertyNumber}`}
                        </Badge>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedComparison(comparison);
                          setComparisonViewerOpen(true);
                        }}
                        className="flex-1"
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        View Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ComparisonBasket onCompare={handleCompare} />

      {/* Lazy loaded modals - only render when open */}
      {comparisonModalOpen && (
        <Suspense fallback={<ModalLoader />}>
          <PropertyComparisonModal
            isOpen={comparisonModalOpen}
            onClose={() => {
              setComparisonModalOpen(false);
              handleComparisonUpdate(); // Refresh comparisons when modal closes
            }}
            reportIds={selectedReports.map(r => r.id)}
            propertyAddresses={selectedReports.map(r => r.property_address)}
          />
        </Suspense>
      )}

      {investmentViewerOpen && selectedInvestmentReport && selectedInvestmentReport.report_content && (
        <Suspense fallback={<ModalLoader />}>
          <InvestmentReportViewer
            report={selectedInvestmentReport as InvestmentReport & { report_content: string }}
            isOpen={investmentViewerOpen}
            onClose={() => {
              setInvestmentViewerOpen(false);
              setSelectedInvestmentReport(null);
            }}
            onReportUpdate={handleInvestmentReportUpdate}
            onOpenOverride={() => {
              if (selectedInvestmentReport) {
                handleOpenOverrideModal(selectedInvestmentReport);
              }
            }}
            onTierSwitch={async (newReportId, newTier) => {
              // Fetch the new report and switch to it
              const { data } = await supabase
                .from('investment_reports')
                .select('id, property_address, property_listing_id, report_content, sources_content, created_at, current_version, report_scope, report_tier, parent_report_id, status, manual_overrides, financial_calculations, demographics_data, economic_data, investment_score, location_intelligence')
                .eq('id', newReportId)
                .single();
              if (data) {
                setSelectedInvestmentReport(data as InvestmentReport);
              }
            }}
          />
        </Suspense>
      )}

      {comparisonViewerOpen && selectedComparison && (
        <Suspense fallback={<ModalLoader />}>
          <ComparisonViewer
            comparison={selectedComparison}
            isOpen={comparisonViewerOpen}
            onClose={() => {
              setComparisonViewerOpen(false);
              setSelectedComparison(null);
            }}
          />
        </Suspense>
      )}

      {versionHistoryOpen && selectedReportForHistory && (
        <Suspense fallback={<ModalLoader />}>
          <ReportVersionHistory
            reportId={selectedReportForHistory.id}
            currentVersion={selectedReportForHistory.current_version || 1}
            open={versionHistoryOpen}
            onOpenChange={setVersionHistoryOpen}
          />
        </Suspense>
      )}

      {overrideModalOpen && selectedReportForOverride && (
        <Suspense fallback={<ModalLoader />}>
          <ManualDataOverrideModal
            report={selectedReportForOverride}
            isOpen={overrideModalOpen}
            onClose={() => setOverrideModalOpen(false)}
            onSave={handleOverrideSave}
          />
        </Suspense>
      )}
    </div>
  );
}