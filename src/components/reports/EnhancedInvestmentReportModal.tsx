import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Download, Copy, Check, Eye, TrendingUp, DollarSign, Home, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';

interface EnhancedInvestmentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyAddress: string;
  propertyDetails?: {
    price?: number;
    weeklyRent?: number;
    propertyType?: string;
    beds?: number;
    baths?: number;
  };
}

export function EnhancedInvestmentReportModal({ 
  isOpen, 
  onClose, 
  propertyAddress, 
  propertyDetails 
}: EnhancedInvestmentReportModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportContent, setReportContent] = useState<string>('');
  const [enhancedData, setEnhancedData] = useState<any>(null);
  const [reportId, setReportId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const generateReport = async () => {
    setIsGenerating(true);
    setHasStartedGeneration(true);
    setProgress(0);
    
    try {
      // Step 1: Generate main report
      setProgress(25);
      const { data, error } = await supabase.functions.invoke('generate-investment-report', {
        body: {
          propertyAddress,
          propertyDetails
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate investment report');
      }

      setProgress(50);
      
      // Step 2: Fetch enhanced data separately for display
      if (propertyDetails?.price) {
        setProgress(75);
        const enhancedDataResponse = await fetchEnhancedData();
        setEnhancedData(enhancedDataResponse);
      }

      setProgress(100);
      setReportContent(data.reportContent);
      
      // Try to fetch the saved report ID
      try {
        const { data: reports } = await supabase
          .from('investment_reports')
          .select('id')
          .eq('property_address', propertyAddress)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (reports && reports.length > 0) {
          setReportId(reports[0].id);
        }
      } catch (error) {
        console.log('Could not fetch report ID:', error);
      }
      
      toast({
        title: "Enhanced Investment Report Generated",
        description: "Your comprehensive property analysis with financial projections is ready.",
      });
    } catch (error) {
      console.error('Report generation failed:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate investment report. Please try again.",
        variant: "destructive",
      });
      setHasStartedGeneration(false);
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const fetchEnhancedData = async () => {
    try {
      const postcodeMatch = propertyAddress.match(/\b(\d{4})\b/);
      const stateMatch = propertyAddress.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1] : null;
      const state = stateMatch ? stateMatch[1].toUpperCase() : 'NSW';

      const [absResponse, rbaResponse, financialResponse] = await Promise.all([
        supabase.functions.invoke('abs-data-service', {
          body: { postcode, state }
        }),
        supabase.functions.invoke('rba-data-service', {}),
        propertyDetails?.price ? supabase.functions.invoke('financial-calculator-service', {
          body: {
            propertyValue: propertyDetails.price,
            deposit: propertyDetails.price * 0.2,
            interestRate: 6.5,
            loanTerm: 30,
            weeklyRent: propertyDetails.weeklyRent || 500,
            state: state,
            propertyType: propertyDetails.propertyType || 'house'
          }
        }) : Promise.resolve({ data: null })
      ]);

      return {
        demographics: absResponse.data?.data,
        economics: rbaResponse.data?.data,
        financials: financialResponse.data?.data
      };
    } catch (error) {
      console.error('Failed to fetch enhanced data:', error);
      return null;
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(reportContent);
      setIsCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Investment report copied successfully.",
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy report to clipboard.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - (margin * 2);
      
      // Add title
      pdf.setFontSize(16);
      pdf.setFont(undefined, 'bold');
      pdf.text('Enhanced Property Investment Analysis', margin, 30);
      
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Property: ${propertyAddress}`, margin, 45);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 55);
      
      // Add enhanced data summary if available
      if (enhancedData?.financials) {
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('Key Financial Metrics:', margin, 70);
        pdf.setFont(undefined, 'normal');
        
        const metrics = [
          `Gross Yield: ${enhancedData.financials.keyMetrics?.grossRentalYield}%`,
          `Net Yield: ${enhancedData.financials.keyMetrics?.netRentalYield}%`,
          `Weekly Cash Flow: $${enhancedData.financials.keyMetrics?.weeklyNet}`,
          `LVR: ${enhancedData.financials.keyMetrics?.lvr}%`
        ];
        
        metrics.forEach((metric, index) => {
          pdf.text(metric, margin, 80 + (index * 6));
        });
      }
      
      // Add content
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(reportContent, maxWidth);
      
      let yPosition = enhancedData?.financials ? 110 : 70;
      const lineHeight = 6;
      
      lines.forEach((line: string) => {
        if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
          pdf.addPage();
          yPosition = 20;
        }
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });
      
      pdf.save(`enhanced-investment-report-${propertyAddress.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
      
      toast({
        title: "Enhanced PDF Downloaded",
        description: "Investment report with financial data downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const viewInGeneratedReports = () => {
    handleClose();
    navigate('/generated-reports');
    
    setTimeout(() => {
      if (reportId) {
        localStorage.setItem('openReportId', reportId);
        window.dispatchEvent(new CustomEvent('openReport', { detail: { reportId } }));
      }
    }, 100);
  };

  const handleClose = () => {
    if (isGenerating) return;
    
    setReportContent('');
    setEnhancedData(null);
    setReportId('');
    setIsGenerating(false);
    setHasStartedGeneration(false);
    setIsCopied(false);
    setProgress(0);
    onClose();
  };

  const renderFinancialMetrics = () => {
    if (!enhancedData?.financials) return null;
    
    const { keyMetrics, projections } = enhancedData.financials;
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{keyMetrics.grossRentalYield}%</p>
                  <p className="text-xs text-muted-foreground">Gross Yield</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">${keyMetrics.weeklyNet}</p>
                  <p className="text-xs text-muted-foreground">Weekly Net</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Home className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">{keyMetrics.lvr}%</p>
                  <p className="text-xs text-muted-foreground">LVR</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-2xl font-bold">{keyMetrics.cashOnCashReturn}%</p>
                  <p className="text-xs text-muted-foreground">Cash on Cash</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {projections && (
          <Card>
            <CardHeader>
              <CardTitle>10-Year Projections</CardTitle>
              <CardDescription>Conservative, Moderate, and Optimistic scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="moderate" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="conservative">Conservative</TabsTrigger>
                  <TabsTrigger value="moderate">Moderate</TabsTrigger>
                  <TabsTrigger value="optimistic">Optimistic</TabsTrigger>
                </TabsList>
                
                {Object.entries(projections).map(([scenario, data]: [string, any]) => (
                  <TabsContent key={scenario} value={scenario} className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          ${Math.round(data[data.length - 1].propertyValue / 1000)}k
                        </p>
                        <p className="text-sm text-muted-foreground">Property Value (Yr 10)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          ${Math.round(data[data.length - 1].equity / 1000)}k
                        </p>
                        <p className="text-sm text-muted-foreground">Equity (Yr 10)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-purple-600">
                          ${Math.round(data[data.length - 1].cumulativeCashFlow / 1000)}k
                        </p>
                        <p className="text-sm text-muted-foreground">Total Cash Flow</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-orange-600">
                          {data[data.length - 1].roi}%
                        </p>
                        <p className="text-sm text-muted-foreground">Average ROI</p>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderDemographicData = () => {
    if (!enhancedData?.demographics) return null;
    
    const { population, income, housing, employment } = enhancedData.demographics;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {population && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Population Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Population:</span>
                  <Badge variant="secondary">{population.total?.toLocaleString()}</Badge>
                </div>
                {population.growth && (
                  <div className="flex justify-between">
                    <span>Growth Rate:</span>
                    <Badge variant="secondary">{population.growth}% p.a.</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {income && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Income & Demographics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Median Income:</span>
                  <Badge variant="secondary">${income.medianHouseholdIncome?.toLocaleString()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Median Age:</span>
                  <Badge variant="secondary">{income.medianAge} years</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Unemployment:</span>
                  <Badge variant="secondary">{income.unemploymentRate}%</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {housing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Housing Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Owner-Occupier:</span>
                  <Badge variant="secondary">{housing.ownerOccupierRate}%</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Renters:</span>
                  <Badge variant="secondary">{housing.renterRate}%</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Median Rent:</span>
                  <Badge variant="secondary">${housing.medianRent}/week</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {employment && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Employment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Participation Rate:</span>
                  <Badge variant="secondary">{employment.laborForceParticipation}%</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Professional Jobs:</span>
                  <Badge variant="secondary">{employment.professionalOccupations}%</Badge>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium">Top Industries:</span>
                  <div className="flex flex-wrap gap-1">
                    {employment.topIndustries?.map((industry: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {industry}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => {
        if (isGenerating) e.preventDefault();
      }}>
        <DialogHeader>
          <DialogTitle>Enhanced Property Investment Analysis</DialogTitle>
          <DialogDescription>
            Comprehensive investment report with financial projections for {propertyAddress}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {!hasStartedGeneration && !reportContent && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4">
                <h3 className="text-lg font-medium">Generate Enhanced Investment Report</h3>
                <p className="text-muted-foreground max-w-md">
                  Generate a comprehensive analysis including ABS demographic data, RBA economic indicators, 
                  and detailed financial projections with 10-year scenarios.
                </p>
                <Button onClick={generateReport} size="lg" disabled={isGenerating}>
                  Generate Enhanced Analysis
                </Button>
              </div>
            </div>
          )}

          {(hasStartedGeneration && !reportContent) && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 w-full max-w-md">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <h3 className="text-lg font-medium">Generating Enhanced Report</h3>
                    <p className="text-muted-foreground">
                      Fetching ABS demographic data, RBA economic indicators, and calculating financial projections...
                    </p>
                    <div className="space-y-2">
                      <Progress value={progress} className="w-full" />
                      <p className="text-xs text-muted-foreground">{progress}% complete</p>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-destructive">Generation Failed</h3>
                    <p className="text-muted-foreground">
                      There was an error generating your enhanced report. Please try again.
                    </p>
                    <Button onClick={generateReport} variant="outline" size="lg">
                      Try Again
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {reportContent && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={isCopied}>
                    {isCopied ? <><Check className="h-4 w-4 mr-2" />Copied</> : <><Copy className="h-4 w-4 mr-2" />Copy</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadPDF}>
                    <Download className="h-4 w-4 mr-2" />Download PDF
                  </Button>
                  {reportId && (
                    <Button variant="outline" size="sm" onClick={viewInGeneratedReports}>
                      <Eye className="h-4 w-4 mr-2" />View Report
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Close Report
                </Button>
              </div>

              <Tabs defaultValue="report" className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="report">Full Report</TabsTrigger>
                  <TabsTrigger value="financials">Financial Analysis</TabsTrigger>
                  <TabsTrigger value="demographics">Demographics</TabsTrigger>
                  <TabsTrigger value="economics">Economic Data</TabsTrigger>
                </TabsList>
                
                <TabsContent value="report" className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 border rounded-lg p-6">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {reportContent}
                      </ReactMarkdown>
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="financials" className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 border rounded-lg p-6">
                    {renderFinancialMetrics()}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="demographics" className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 border rounded-lg p-6">
                    {renderDemographicData()}
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="economics" className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 border rounded-lg p-6">
                    {enhancedData?.economics ? (
                      <div className="space-y-4">
                        <Card>
                          <CardHeader>
                            <CardTitle>RBA Cash Rate & Interest Rates</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex justify-between">
                              <span>Current Cash Rate:</span>
                              <Badge variant="secondary">{enhancedData.economics.cashRate?.current}%</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>Previous Rate:</span>
                              <Badge variant="outline">{enhancedData.economics.cashRate?.previous}%</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>Change:</span>
                              <Badge variant={enhancedData.economics.cashRate?.change > 0 ? "destructive" : "default"}>
                                {enhancedData.economics.cashRate?.change > 0 ? '+' : ''}{enhancedData.economics.cashRate?.change}%
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Inflation & Economic Indicators</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex justify-between">
                              <span>Annual Inflation:</span>
                              <Badge variant="secondary">{enhancedData.economics.inflation?.annual}%</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>GDP Growth:</span>
                              <Badge variant="secondary">{enhancedData.economics.indicators?.gdpGrowth}%</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>National Unemployment:</span>
                              <Badge variant="secondary">{enhancedData.economics.indicators?.unemploymentRate}%</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>House Price Growth:</span>
                              <Badge variant="secondary">{enhancedData.economics.indicators?.housePriceGrowth}%</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Economic data not available</p>
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}