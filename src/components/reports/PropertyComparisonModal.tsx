import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Loader2, Download, Copy, Check, TrendingUp, TrendingDown, 
  DollarSign, MapPin, AlertTriangle, Trophy, Target, Home,
  CheckCircle2, XCircle, AlertCircle, ChevronRight, PlayCircle, Settings, ChevronDown, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { addBackgroundJob } from '@/components/BackgroundJobTracker';
import { useNotifications } from '@/contexts/NotificationsContext';

interface PropertyComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportIds: string[];
  propertyAddresses: string[];
}

interface ComparisonAnalysis {
  executiveSummary: string;
  rankings: Array<{
    propertyNumber: number;
    address: string;
    rank: number;
    finalScore: number;
    primaryStrengths: string[];
    primaryConcerns: string[];
    bestSuitedFor: string;
  }>;
  financialComparison: {
    bestYield: { propertyNumber: number; value: string; reason: string };
    bestCashFlow: { propertyNumber: number; value: string; reason: string };
    bestROI: { propertyNumber: number; value: string; reason: string };
    bestValue: { propertyNumber: number; reason: string };
  };
  locationComparison: {
    bestInfrastructure: { propertyNumber: number; reason: string };
    bestGrowthCorridor: { propertyNumber: number; reason: string };
    bestSchools: { propertyNumber: number; reason: string };
    bestLifestyle: { propertyNumber: number; reason: string };
  };
  riskComparison: {
    lowestRisk: { propertyNumber: number; reason: string };
    highestRisk: { propertyNumber: number; reason: string };
    bestRiskReward: { propertyNumber: number; reason: string };
    riskLevels: Array<{
      propertyNumber: number;
      riskLevel: string;
      specificRisks: string[];
    }>;
  };
  investorMatches: Array<{
    propertyNumber: number;
    investorTypes: string[];
    reasoning: string;
  }>;
  competitiveAdvantages: Array<{
    propertyNumber: number;
    advantages: string[];
  }>;
  redFlags: Array<{
    propertyNumber: number;
    concerns: string[];
    severity: string;
  }>;
  finalRecommendation: {
    bestOverall: { propertyNumber: number; reason: string };
    runners: Array<{ propertyNumber: number; reason: string }>;
    avoid: Array<{ propertyNumber: number; reason: string }>;
    alternativeScenarios: Array<{
      scenario: string;
      recommendation: number;
      reason: string;
    }>;
  };
}

export function PropertyComparisonModal({
  isOpen,
  onClose,
  reportIds,
  propertyAddresses
}: PropertyComparisonModalProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<ComparisonAnalysis | null>(null);
  const [comparisonId, setComparisonId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [runInBackground, setRunInBackground] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Analysis parameters (all optional with sensible defaults)
  const [investorProfile, setInvestorProfile] = useState<string>('general');
  const [analysisDepth, setAnalysisDepth] = useState<string>('comprehensive');
  const [timeHorizon, setTimeHorizon] = useState<string>('5-7 years');
  const [riskTolerance, setRiskTolerance] = useState<string>('moderate');
  const [useCustomWeights, setUseCustomWeights] = useState(false);
  const [customWeights, setCustomWeights] = useState({
    growth: 30,
    location: 25,
    yield: 20,
    demand: 15,
    risk: 10
  });
  
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  const startAnalysis = async (background = false) => {
    setRunInBackground(background);
    setIsAnalyzing(true);
    setHasStarted(true);
    setProgress(10);

    try {
      setProgress(30);
      
      const requestBody: any = { 
        reportIds,
        analysisDepth,
        investorProfile,
        timeHorizon,
        riskTolerance
      };
      
      if (useCustomWeights) {
        requestBody.customWeights = customWeights;
      }
      
      const { data, error } = await supabase.functions.invoke('compare-investment-reports', {
        body: requestBody
      });

      if (error) {
        throw new Error(error.message || 'Failed to compare properties');
      }

      setProgress(90);

      if (!data?.analysis) {
        throw new Error('No analysis data received');
      }

      setAnalysis(data.analysis);
      setComparisonId(data.comparisonId);
      setProgress(100);

      if (background) {
        addBackgroundJob({
          id: data.comparisonId,
          type: 'comparison_analysis'
        });
        
        addNotification({
          type: 'info',
          title: 'Comparison Analysis Started',
          message: 'Your comparison is processing in the background. We\'ll notify you when it\'s ready.'
        });
        
        onClose();
      } else {
        toast({
          title: "Comparison Complete",
          description: `Successfully analyzed ${reportIds.length} properties`,
        });
      }

    } catch (error) {
      console.error('Comparison error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to compare properties",
        variant: "destructive",
      });
      setHasStarted(false);
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-orange-600" />;
    return <Target className="h-5 w-5 text-muted-foreground" />;
  };

  const getRiskColor = (riskLevel: string) => {
    const level = riskLevel.toLowerCase();
    if (level.includes('low')) return 'text-green-600 bg-green-50 border-green-200';
    if (level.includes('high')) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  };

  const getSeverityIcon = (severity: string) => {
    const sev = severity.toLowerCase();
    if (sev.includes('high') || sev.includes('critical')) return <XCircle className="h-4 w-4 text-red-500" />;
    if (sev.includes('medium')) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  };

  const copyAnalysis = () => {
    if (!analysis) return;
    
    const textContent = `
PROPERTY COMPARISON ANALYSIS
${(propertyAddresses || []).map((addr, i) => `Property ${i + 1}: ${addr}`).join('\n')}

EXECUTIVE SUMMARY
${analysis.executiveSummary || 'N/A'}

RANKINGS
${(analysis.rankings || []).map(r => `
${r.rank}. ${r.address} (Score: ${r.finalScore})
   Strengths: ${(r.primaryStrengths || []).join(', ')}
   Concerns: ${(r.primaryConcerns || []).join(', ')}
   Best for: ${r.bestSuitedFor}
`).join('\n')}

FINAL RECOMMENDATION
Best Overall: Property ${analysis.finalRecommendation?.bestOverall?.propertyNumber || 'N/A'}
Reason: ${analysis.finalRecommendation?.bestOverall?.reason || 'N/A'}
    `.trim();

    navigator.clipboard.writeText(textContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    
    toast({
      title: "Copied to Clipboard",
      description: "Comparison analysis has been copied",
    });
  };

  const downloadPDF = () => {
    toast({
      title: "PDF Generation",
      description: "PDF download functionality will be implemented in the final version",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isAnalyzing) {
        onClose();
      }
    }}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Multi-Property Comparison Analysis
          </DialogTitle>
          <DialogDescription>
            Comprehensive AI-powered qualitative comparison of {reportIds.length} investment properties
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {!hasStarted && !analysis && (
            <div className="flex-1 flex items-center justify-center p-8">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>Ready to Compare Properties</CardTitle>
                  <CardDescription>
                    Generate a detailed AI analysis comparing these properties across financial performance,
                    location quality, risk factors, and investment potential.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Selected Properties:</h4>
                    {propertyAddresses.map((address, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span className="text-muted-foreground">{address}</span>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Analysis Settings */}
                  <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          <span>Analysis Settings</span>
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-4">
                      <p className="text-xs text-muted-foreground">
                        Customize the analysis or use defaults. All settings are optional with sensible defaults applied automatically.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="investor-profile">Investor Profile</Label>
                        <Select value={investorProfile} onValueChange={setInvestorProfile}>
                          <SelectTrigger id="investor-profile">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">General Investor</SelectItem>
                            <SelectItem value="first-time">First-Time Investor</SelectItem>
                            <SelectItem value="cash-flow">Cash Flow Focused</SelectItem>
                            <SelectItem value="growth">Capital Growth Focused</SelectItem>
                            <SelectItem value="balanced">Balanced Portfolio</SelectItem>
                            <SelectItem value="experienced">Experienced Investor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="analysis-depth">Analysis Depth</Label>
                        <Select value={analysisDepth} onValueChange={setAnalysisDepth}>
                          <SelectTrigger id="analysis-depth">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="quick">Quick Overview (Faster)</SelectItem>
                            <SelectItem value="standard">Standard Analysis</SelectItem>
                            <SelectItem value="comprehensive">Comprehensive (Recommended)</SelectItem>
                            <SelectItem value="deep">Deep Dive (Most Detailed)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="time-horizon">Investment Time Horizon</Label>
                        <Select value={timeHorizon} onValueChange={setTimeHorizon}>
                          <SelectTrigger id="time-horizon">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2-3 years">2-3 Years (Short-term)</SelectItem>
                            <SelectItem value="5-7 years">5-7 Years (Medium-term)</SelectItem>
                            <SelectItem value="10+ years">10+ Years (Long-term)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="risk-tolerance">Risk Tolerance</Label>
                        <Select value={riskTolerance} onValueChange={setRiskTolerance}>
                          <SelectTrigger id="risk-tolerance">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="conservative">Conservative</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="aggressive">Aggressive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Custom Scoring Weights</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUseCustomWeights(!useCustomWeights)}
                          >
                            {useCustomWeights ? 'Use Default' : 'Customize'}
                          </Button>
                        </div>
                        
                        {useCustomWeights && (
                          <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Growth Score</Label>
                                <span className="text-xs font-medium">{customWeights.growth}%</span>
                              </div>
                              <Slider
                                value={[customWeights.growth]}
                                onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, growth: value }))}
                                min={0}
                                max={50}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Location Score</Label>
                                <span className="text-xs font-medium">{customWeights.location}%</span>
                              </div>
                              <Slider
                                value={[customWeights.location]}
                                onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, location: value }))}
                                min={0}
                                max={50}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Yield Score</Label>
                                <span className="text-xs font-medium">{customWeights.yield}%</span>
                              </div>
                              <Slider
                                value={[customWeights.yield]}
                                onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, yield: value }))}
                                min={0}
                                max={50}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Demand Score</Label>
                                <span className="text-xs font-medium">{customWeights.demand}%</span>
                              </div>
                              <Slider
                                value={[customWeights.demand]}
                                onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, demand: value }))}
                                min={0}
                                max={30}
                                step={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Risk Score</Label>
                                <span className="text-xs font-medium">{customWeights.risk}%</span>
                              </div>
                              <Slider
                                value={[customWeights.risk]}
                                onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, risk: value }))}
                                min={0}
                                max={30}
                                step={5}
                              />
                            </div>
                            <div className="pt-2 text-xs text-muted-foreground">
                              Total: {customWeights.growth + customWeights.location + customWeights.yield + customWeights.demand + customWeights.risk}%
                              {(customWeights.growth + customWeights.location + customWeights.yield + customWeights.demand + customWeights.risk) !== 100 && (
                                <span className="text-destructive ml-1">(Must equal 100%)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setInvestorProfile('general');
                        setAnalysisDepth('comprehensive');
                        setTimeHorizon('5-7 years');
                        setRiskTolerance('moderate');
                        setUseCustomWeights(false);
                        setCustomWeights({
                          growth: 30,
                          location: 25,
                          yield: 20,
                          demand: 15,
                          risk: 10
                        });
                      }}
                      className="h-7"
                    >
                      Reset to Defaults
                    </Button>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => startAnalysis(false)} 
                      size="lg" 
                      className="flex-1"
                      disabled={useCustomWeights && (customWeights.growth + customWeights.location + customWeights.yield + customWeights.demand + customWeights.risk) !== 100}
                    >
                      Start Analysis
                    </Button>
                    <Button onClick={() => startAnalysis(true)} variant="outline" size="lg" className="flex-1">
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Run in Background
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isAnalyzing && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 w-full max-w-md">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <h3 className="text-lg font-medium">Analyzing Properties...</h3>
                <p className="text-sm text-muted-foreground">
                  AI is performing comprehensive comparison across financial metrics, location quality,
                  risk factors, and investment potential.
                </p>
                <div className="space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-xs text-muted-foreground">{progress}% complete</p>
                </div>
              </div>
            </div>
          )}

          {analysis && !isAnalyzing && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAnalysis} disabled={isCopied}>
                    {isCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadPDF}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => startAnalysis(false)}
                    className="bg-primary"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-run Analysis
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>

              {/* Current Settings Display */}
              <Card className="mb-4">
                <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          <CardTitle className="text-sm">Analysis Settings</CardTitle>
                          <Badge variant="outline" className="text-xs">Optional</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <Badge variant="secondary" className="text-xs">{investorProfile}</Badge>
                            <Badge variant="secondary" className="text-xs">{timeHorizon}</Badge>
                            <Badge variant="secondary" className="text-xs">{riskTolerance}</Badge>
                          </div>
                          <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                      <p className="text-xs text-muted-foreground">
                        Adjust settings and re-run to see how different parameters affect the analysis. Changes are optional.
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="investor-profile-result">Investor Profile</Label>
                          <Select value={investorProfile} onValueChange={setInvestorProfile}>
                            <SelectTrigger id="investor-profile-result">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General Investor</SelectItem>
                              <SelectItem value="first-time">First-Time Investor</SelectItem>
                              <SelectItem value="cash-flow">Cash Flow Focused</SelectItem>
                              <SelectItem value="growth">Capital Growth Focused</SelectItem>
                              <SelectItem value="balanced">Balanced Portfolio</SelectItem>
                              <SelectItem value="experienced">Experienced Investor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="analysis-depth-result">Analysis Depth</Label>
                          <Select value={analysisDepth} onValueChange={setAnalysisDepth}>
                            <SelectTrigger id="analysis-depth-result">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quick">Quick Overview</SelectItem>
                              <SelectItem value="standard">Standard Analysis</SelectItem>
                              <SelectItem value="comprehensive">Comprehensive</SelectItem>
                              <SelectItem value="deep">Deep Dive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="time-horizon-result">Time Horizon</Label>
                          <Select value={timeHorizon} onValueChange={setTimeHorizon}>
                            <SelectTrigger id="time-horizon-result">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2-3 years">2-3 Years</SelectItem>
                              <SelectItem value="5-7 years">5-7 Years</SelectItem>
                              <SelectItem value="10+ years">10+ Years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="risk-tolerance-result">Risk Tolerance</Label>
                          <Select value={riskTolerance} onValueChange={setRiskTolerance}>
                            <SelectTrigger id="risk-tolerance-result">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="conservative">Conservative</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="aggressive">Aggressive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Custom Scoring Weights</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUseCustomWeights(!useCustomWeights)}
                          >
                            {useCustomWeights ? 'Use Default' : 'Customize'}
                          </Button>
                        </div>
                        
                        {useCustomWeights && (
                          <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <Label className="text-xs">Growth</Label>
                                  <span className="text-xs font-medium">{customWeights.growth}%</span>
                                </div>
                                <Slider
                                  value={[customWeights.growth]}
                                  onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, growth: value }))}
                                  min={0}
                                  max={50}
                                  step={5}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <Label className="text-xs">Location</Label>
                                  <span className="text-xs font-medium">{customWeights.location}%</span>
                                </div>
                                <Slider
                                  value={[customWeights.location]}
                                  onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, location: value }))}
                                  min={0}
                                  max={50}
                                  step={5}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <Label className="text-xs">Yield</Label>
                                  <span className="text-xs font-medium">{customWeights.yield}%</span>
                                </div>
                                <Slider
                                  value={[customWeights.yield]}
                                  onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, yield: value }))}
                                  min={0}
                                  max={50}
                                  step={5}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <Label className="text-xs">Demand</Label>
                                  <span className="text-xs font-medium">{customWeights.demand}%</span>
                                </div>
                                <Slider
                                  value={[customWeights.demand]}
                                  onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, demand: value }))}
                                  min={0}
                                  max={30}
                                  step={5}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <Label className="text-xs">Risk</Label>
                                  <span className="text-xs font-medium">{customWeights.risk}%</span>
                                </div>
                                <Slider
                                  value={[customWeights.risk]}
                                  onValueChange={([value]) => setCustomWeights(prev => ({ ...prev, risk: value }))}
                                  min={0}
                                  max={30}
                                  step={5}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Total: {customWeights.growth + customWeights.location + customWeights.yield + customWeights.demand + customWeights.risk}%
                              {(customWeights.growth + customWeights.location + customWeights.yield + customWeights.demand + customWeights.risk) !== 100 && (
                                <span className="text-destructive ml-1">(Must equal 100%)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="rankings">Rankings</TabsTrigger>
                  <TabsTrigger value="financial">Financial</TabsTrigger>
                  <TabsTrigger value="location">Location</TabsTrigger>
                  <TabsTrigger value="risk">Risk</TabsTrigger>
                  <TabsTrigger value="recommendation">Final</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 mt-4 pr-4">
                  <TabsContent value="overview" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>Executive Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {analysis.executiveSummary}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Quick Comparison</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(analysis.rankings || []).map((ranking) => (
                          <div
                            key={ranking.propertyNumber}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                          >
                            <div className="mt-1">{getRankIcon(ranking.rank)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">#{ranking.rank}</Badge>
                                <h4 className="font-medium text-sm truncate">{ranking.address}</h4>
                                <Badge className="ml-auto">
                                  {typeof ranking.finalScore === 'number' ? ranking.finalScore.toFixed(1) : ranking.finalScore}/100
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {ranking.bestSuitedFor}
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                {(ranking.primaryStrengths || []).slice(0, 2).map((strength, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {strength}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="rankings" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>Detailed Rankings</CardTitle>
                        <CardDescription>
                          Comprehensive ranking of all properties with strengths and concerns
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(analysis.rankings || []).map((ranking) => (
                          <Card key={ranking.propertyNumber}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  {getRankIcon(ranking.rank)}
                                  <div>
                                    <CardTitle className="text-lg">
                                      Rank #{ranking.rank}: Property {ranking.propertyNumber}
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                      {ranking.address}
                                    </CardDescription>
                                  </div>
                                </div>
                                <Badge className="text-lg px-3 py-1">
                                  {typeof ranking.finalScore === 'number' ? ranking.finalScore.toFixed(1) : ranking.finalScore}/100
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div>
                                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  Primary Strengths
                                </h5>
                                <ul className="space-y-1">
                                  {(ranking.primaryStrengths || []).map((strength, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                      {strength}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <Separator />

                              <div>
                                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-orange-600" />
                                  Primary Concerns
                                </h5>
                                <ul className="space-y-1">
                                  {(ranking.primaryConcerns || []).map((concern, i) => (
                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                      <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                      {concern}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <Separator />

                              <div>
                                <h5 className="text-sm font-medium mb-2">Best Suited For</h5>
                                <Badge variant="secondary" className="text-sm">
                                  {ranking.bestSuitedFor}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="financial" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          Financial Performance Comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-green-600" />
                                Best Rental Yield
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Property</span>
                                  <Badge>#{analysis.financialComparison.bestYield.propertyNumber}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Yield</span>
                                  <span className="font-medium">{analysis.financialComparison.bestYield.value}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {analysis.financialComparison.bestYield.reason}
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-blue-600" />
                                Best Cash Flow
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Property</span>
                                  <Badge>#{analysis.financialComparison.bestCashFlow.propertyNumber}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Monthly</span>
                                  <span className="font-medium">{analysis.financialComparison.bestCashFlow.value}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {analysis.financialComparison.bestCashFlow.reason}
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-purple-600" />
                                Best ROI Projection
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Property</span>
                                  <Badge>#{analysis.financialComparison.bestROI.propertyNumber}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Expected ROI</span>
                                  <span className="font-medium">{analysis.financialComparison.bestROI.value}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {analysis.financialComparison.bestROI.reason}
                                </p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Target className="h-4 w-4 text-orange-600" />
                                Best Value
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-muted-foreground">Property</span>
                                  <Badge>#{analysis.financialComparison.bestValue.propertyNumber}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {analysis.financialComparison.bestValue.reason}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="location" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          Location Intelligence Comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4">
                          {Object.entries(analysis.locationComparison).map(([key, value]) => (
                            <Card key={key}>
                              <CardHeader>
                                <CardTitle className="text-base capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm text-muted-foreground">Leading Property</span>
                                  <Badge>Property #{value.propertyNumber}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{value.reason}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="risk" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Risk Assessment
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base text-green-600">Lowest Risk</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">Property</span>
                                <Badge variant="outline">#{analysis.riskComparison.lowestRisk.propertyNumber}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {analysis.riskComparison.lowestRisk.reason}
                              </p>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base text-red-600">Highest Risk</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">Property</span>
                                <Badge variant="outline">#{analysis.riskComparison.highestRisk.propertyNumber}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {analysis.riskComparison.highestRisk.reason}
                              </p>
                            </CardContent>
                          </Card>
                        </div>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Risk Levels by Property</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {(analysis.riskComparison?.riskLevels || []).map((risk) => (
                              <div key={risk.propertyNumber} className="border rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">Property {risk.propertyNumber}</span>
                                  <Badge className={getRiskColor(risk.riskLevel)}>
                                    {risk.riskLevel}
                                  </Badge>
                                </div>
                                {(risk.specificRisks || []).length > 0 && (
                                  <ul className="space-y-1 mt-2">
                                    {(risk.specificRisks || []).map((riskItem, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        {riskItem}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </CardContent>
                        </Card>

                        {analysis.redFlags && analysis.redFlags.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base text-red-600 flex items-center gap-2">
                                <XCircle className="h-5 w-5" />
                                Red Flags & Concerns
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {analysis.redFlags.map((flag) => (
                                <div key={flag.propertyNumber} className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Property {flag.propertyNumber}</span>
                                    <div className="flex items-center gap-2">
                                      {getSeverityIcon(flag.severity)}
                                      <Badge variant="destructive">{flag.severity}</Badge>
                                    </div>
                                  </div>
                                  <ul className="space-y-1">
                                    {(flag.concerns || []).map((concern, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        {concern}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="recommendation" className="space-y-4 mt-0">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Trophy className="h-5 w-5 text-yellow-500" />
                          Final Recommendation
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Card className="border-2 border-primary">
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Trophy className="h-6 w-6 text-yellow-500" />
                              Best Overall Investment
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-lg font-semibold">
                                Property #{analysis.finalRecommendation.bestOverall.propertyNumber}
                              </span>
                              <Badge className="text-lg px-4 py-1">Top Choice</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {analysis.finalRecommendation.bestOverall.reason}
                            </p>
                          </CardContent>
                        </Card>

                        {analysis.finalRecommendation.runners && analysis.finalRecommendation.runners.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Runner-Up Options</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {analysis.finalRecommendation.runners.map((runner, index) => (
                                <div key={index} className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">Property #{runner.propertyNumber}</span>
                                    <Badge variant="secondary">Close Second</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{runner.reason}</p>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}

                        {analysis.finalRecommendation.alternativeScenarios && 
                         analysis.finalRecommendation.alternativeScenarios.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Alternative Scenarios</CardTitle>
                              <CardDescription>
                                Recommendations based on different investment goals
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {analysis.finalRecommendation.alternativeScenarios.map((scenario, index) => (
                                <div key={index} className="border rounded-lg p-3">
                                  <h5 className="font-medium text-sm mb-2">{scenario.scenario}</h5>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-sm text-muted-foreground">Recommended:</span>
                                    <Badge>Property #{scenario.recommendation}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{scenario.reason}</p>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}

                        {analysis.investorMatches && analysis.investorMatches.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Investor Profile Matching</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {analysis.investorMatches.map((match) => (
                                <div key={match.propertyNumber} className="border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">Property {match.propertyNumber}</span>
                                    <div className="flex gap-1 flex-wrap">
                                      {(match.investorTypes || []).map((type, i) => (
                                        <Badge key={i} variant="outline" className="text-xs">
                                          {type}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{match.reasoning}</p>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
