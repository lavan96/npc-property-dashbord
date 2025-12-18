import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CashFlowAnalysisModal } from '@/components/reports/CashFlowAnalysisModal';
import { format } from 'date-fns';
import { Calculator, Search, Eye, FileText, TrendingUp, DollarSign, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InvestmentReport {
  id: string;
  property_address: string;
  created_at: string;
  status?: string;
  manual_overrides?: any;
  financial_calculations?: any;
  investment_score?: any;
}

export default function CashFlowAnalysis() {
  const [reports, setReports] = useState<InvestmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<InvestmentReport | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, created_at, status, manual_overrides, financial_calculations, investment_score')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
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

  const filteredReports = reports.filter(report =>
    report.property_address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasRequiredData = (report: InvestmentReport) => {
    const fc = report.financial_calculations || {};
    const mo = report.manual_overrides || {};
    
    // Check for essential fields
    const hasPrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue;
    const hasRent = mo.weeklyRent || fc.weeklyRent;
    
    return hasPrice && hasRent;
  };

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
  };

  return (
    <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-8 w-8 text-primary" />
              10-Year Cash Flow Analysis
            </h1>
            <p className="text-muted-foreground mt-1">
              Generate detailed 10-year cash flow projections for investment reports
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
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by property address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Investment Reports Found</h3>
              <p className="text-muted-foreground mb-4">
                Generate investment reports first to run cash flow analysis
              </p>
              <Button onClick={() => navigate('/generated-reports')}>
                Go to Generated Reports
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => {
              const gradeInfo = getInvestmentGrade(report);
              const hasData = hasRequiredData(report);
              const fc = report.financial_calculations || {};
              const mo = report.manual_overrides || {};
              
              const purchasePrice = mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0;
              const weeklyRent = mo.weeklyRent || fc.weeklyRent || 0;

              return (
                <Card key={report.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2">
                        {report.property_address}
                      </CardTitle>
                      {gradeInfo && (
                        <Badge className={`${gradeInfo.color} text-white shrink-0`}>
                          {gradeInfo.grade}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {format(new Date(report.created_at), 'dd MMM yyyy')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Purchase Price</p>
                        <p className="font-medium">
                          {purchasePrice ? `$${purchasePrice.toLocaleString()}` : 'Not set'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Weekly Rent</p>
                        <p className="font-medium">
                          {weeklyRent ? `$${weeklyRent.toLocaleString()}` : 'Not set'}
                        </p>
                      </div>
                    </div>

                    {!hasData && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-xs text-amber-700">
                          Missing required data. Configure manual overrides first.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate('/generated-reports')}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View Report
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!hasData}
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
        />
    </div>
  );
}
