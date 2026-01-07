import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface PortfolioAnalysisData {
  clientId: string;
  clientName: string;
  portfolioMetrics: {
    totalProperties: number;
    investmentCount: number;
    ownerOccupiedCount: number;
    totalValue: number;
    totalDebt: number;
    totalEquity: number;
    averageLVR: number;
    totalMonthlyRentalIncome: number;
    totalMonthlyExpenses: number;
    netMonthlyCashflow: number;
    averageYield: number;
  };
  propertyAnalyses: Array<{
    propertyNumber: number;
    address: string;
    propertyType: string;
    value: number;
    equity: number;
    lvr: string;
    grossYield: string;
    netMonthlyCashflow: number;
    portfolioContribution: string;
  }>;
  analysis: {
    executiveSummary: {
      overallHealth: string;
      healthScore: number;
      keyStrengths: string[];
      keyConcerns: string[];
      primaryRecommendation: string;
    };
    compositionAnalysis: {
      assetAllocation: string;
      diversificationScore: number;
      propertyMixAssessment: string;
      recommendations: string[];
    };
    financialHealth: {
      cashflowStatus: string;
      equityPosition: string;
      debtServiceability: string;
      lvrRisk: string;
      analysis: string;
    };
    propertyRankings: Array<{
      rank: number;
      address: string;
      performanceRating: string;
      strengths: string[];
      concerns: string[];
      recommendation: string;
    }>;
    riskAssessment: {
      overallRiskLevel: string;
      concentrationRisk: string;
      interestRateSensitivity: string;
      vacancyRisk: string;
      marketRisks: string[];
      mitigationStrategies: string[];
    };
    growthOpportunities: {
      equityReleaseOptions: string[];
      refinancingOpportunities: string[];
      nextPurchaseRecommendations: string[];
      optimizationStrategies: string[];
    };
    projections: {
      years: number;
      projectedPortfolioValue: number;
      projectedEquity: number;
      projectedMonthlyCashflow: number;
      assumptions: string[];
    };
    strategicRecommendations: {
      shortTerm: string[];
      mediumTerm: string[];
      longTerm: string[];
      priorityActions: string[];
    };
  };
  generatedAt: string;
}

interface PortfolioAnalysisPDFGeneratorProps {
  clientId: string;
  clientName: string;
  onComplete?: () => void;
}

const formatCurrency = (value: number): string => {
  return '$' + value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const getHealthColor = (health: string): string => {
  switch (health?.toLowerCase()) {
    case 'excellent': return 'text-green-600';
    case 'good': return 'text-blue-600';
    case 'fair': return 'text-yellow-600';
    case 'poor': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
};

const getRiskBadgeVariant = (risk: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (risk?.toLowerCase()) {
    case 'low': return 'default';
    case 'medium': return 'secondary';
    case 'high': return 'destructive';
    default: return 'outline';
  }
};

export function PortfolioAnalysisPDFGenerator({ 
  clientId, 
  clientName,
  onComplete 
}: PortfolioAnalysisPDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisData, setAnalysisData] = useState<PortfolioAnalysisData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const generateAnalysis = async () => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-portfolio-analysis', {
        body: {
          clientId,
          investorProfile: 'general',
          analysisDepth: 'comprehensive',
          includeProjections: true,
          projectionYears: 10,
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Analysis failed');

      setAnalysisData(data);
      setShowPreview(true);
      toast.success('Portfolio analysis generated successfully');
      
    } catch (error: any) {
      console.error('Portfolio analysis error:', error);
      toast.error('Failed to generate analysis: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!analysisData) return;
    
    setIsDownloading(true);
    
    try {
      const container = document.getElementById('portfolio-analysis-content');
      if (!container) throw new Error('Content not found');

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `Portfolio_Analysis_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      toast.success('PDF downloaded successfully');
      onComplete?.();
      
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={generateAnalysis}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <TrendingUp className="h-4 w-4 mr-2" />
        )}
        {isGenerating ? 'Analyzing...' : 'Portfolio Analysis'}
      </Button>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Portfolio Performance Analysis</span>
              <Button 
                onClick={downloadPDF} 
                disabled={isDownloading}
                size="sm"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download PDF
              </Button>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)]">
            {analysisData && (
              <div id="portfolio-analysis-content" className="p-6 bg-white space-y-6">
                {/* Header */}
                <div className="text-center border-b pb-4">
                  <h1 className="text-2xl font-bold text-primary">Portfolio Performance Analysis</h1>
                  <p className="text-lg text-muted-foreground">{analysisData.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    Generated: {new Date(analysisData.generatedAt).toLocaleDateString('en-AU', { 
                      day: 'numeric', month: 'long', year: 'numeric' 
                    })}
                  </p>
                </div>

                {/* Executive Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Portfolio Health</p>
                        <p className={`text-2xl font-bold ${getHealthColor(analysisData.analysis.executiveSummary.overallHealth)}`}>
                          {analysisData.analysis.executiveSummary.overallHealth}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Health Score</p>
                        <p className="text-3xl font-bold text-primary">
                          {analysisData.analysis.executiveSummary.healthScore}/100
                        </p>
                      </div>
                    </div>
                    
                    <p className="text-sm">{analysisData.analysis.executiveSummary.primaryRecommendation}</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-green-700 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Key Strengths
                        </p>
                        <ul className="text-sm space-y-1 mt-1">
                          {analysisData.analysis.executiveSummary.keyStrengths.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Key Concerns
                        </p>
                        <ul className="text-sm space-y-1 mt-1">
                          {analysisData.analysis.executiveSummary.keyConcerns.map((c, i) => (
                            <li key={i}>• {c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Portfolio Metrics */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Portfolio Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Value</p>
                        <p className="text-xl font-bold">{formatCurrency(analysisData.portfolioMetrics.totalValue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Equity</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(analysisData.portfolioMetrics.totalEquity)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Average LVR</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.averageLVR.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Properties</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.totalProperties}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Cashflow</p>
                        <p className={`text-xl font-bold ${analysisData.portfolioMetrics.netMonthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(analysisData.portfolioMetrics.netMonthlyCashflow)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg. Yield</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.averageYield.toFixed(2)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Property Rankings */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Property Rankings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysisData.analysis.propertyRankings.map((prop) => (
                      <div key={prop.rank} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">#{prop.rank}</Badge>
                              <span className="font-medium text-sm">{prop.address}</span>
                            </div>
                            <Badge 
                              variant={prop.performanceRating === 'Star' ? 'default' : 'secondary'}
                              className="mt-1"
                            >
                              {prop.performanceRating}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">{prop.recommendation}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Risk Assessment */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Risk Assessment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">Overall Risk Level:</span>
                      <Badge variant={getRiskBadgeVariant(analysisData.analysis.riskAssessment.overallRiskLevel)}>
                        {analysisData.analysis.riskAssessment.overallRiskLevel}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Market Risks</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.riskAssessment.marketRisks.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mitigation Strategies</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.riskAssessment.mitigationStrategies.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Projections */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{analysisData.analysis.projections.years}-Year Projections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Projected Value</p>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(analysisData.analysis.projections.projectedPortfolioValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Projected Equity</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(analysisData.analysis.projections.projectedEquity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Cashflow</p>
                        <p className="text-xl font-bold">
                          {formatCurrency(analysisData.analysis.projections.projectedMonthlyCashflow)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Strategic Recommendations */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Strategic Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-medium text-sm text-primary">Priority Actions</p>
                      <ul className="text-sm mt-1 space-y-1">
                        {analysisData.analysis.strategicRecommendations.priorityActions.map((a, i) => (
                          <li key={i}>• {a}</li>
                        ))}
                      </ul>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="font-medium">Short-Term (0-12m)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.shortTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium">Medium-Term (1-3y)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.mediumTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium">Long-Term (3-10y)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.longTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Footer */}
                <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                  <p>This analysis is for informational purposes only. Please consult with qualified financial advisors.</p>
                  <p>Generated by NPC Property Analytics</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
