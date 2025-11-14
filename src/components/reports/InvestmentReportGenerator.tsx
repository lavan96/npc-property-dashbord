import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/hooks/useAuth';
import { addBackgroundJob } from '@/components/BackgroundJobTracker';
import { Loader2, MapPin, Hash, Globe, TrendingUp, AlertCircle, FileText } from 'lucide-react';

interface RecentReport {
  id: string;
  property_address: string;
  created_at: string;
}

export function InvestmentReportGenerator() {
  const [queryType, setQueryType] = useState<'address' | 'zipcode' | 'state'>('address');
  const [query, setQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentReports, setRecentReports] = useState<RecentReport[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string>('');
  
  // Property details state
  const [propertyPrice, setPropertyPrice] = useState('');
  const [weeklyRent, setWeeklyRent] = useState('');
  const [propertyType, setPropertyType] = useState<'house' | 'apartment' | 'townhouse'>('house');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();

  const handleGenerate = async () => {
    if (!query.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a property address, zip code, or state.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to generate reports.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setShowResults(false);

    try {
      // Format the query based on type
      let propertyAddress = '';
      switch (queryType) {
        case 'address':
          propertyAddress = query.trim();
          break;
        case 'zipcode':
          propertyAddress = `Properties in ${query.trim()}`;
          break;
        case 'state':
          propertyAddress = `${query.trim()}, Australia`;
          break;
      }

      // Build property details object
      const propertyDetails: any = { 
        queryType, 
        originalQuery: query 
      };
      
      // Add optional property details if provided
      if (propertyPrice) propertyDetails.price = parseFloat(propertyPrice);
      if (weeklyRent) propertyDetails.weeklyRent = parseFloat(weeklyRent);
      if (propertyType) propertyDetails.propertyType = propertyType;
      if (beds) propertyDetails.beds = parseInt(beds);
      if (baths) propertyDetails.baths = parseInt(baths);

      // Create the report record first with pending status
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report...',
          status: 'pending',
          generated_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating report record:', insertError);
        throw new Error(`Failed to create report: ${insertError.message || 'Database error'}`);
      }

      // Add to background job tracker
      addBackgroundJob({
        id: pendingReport.id,
        type: 'investment_report'
      });

      // Get scope text for notification
      const scopeText = queryType === 'address' 
        ? `Property: ${query}` 
        : queryType === 'zipcode' 
          ? `ZIP Code: ${query}` 
          : `Statewide Analysis: ${query}`;

      // Start generation in background (don't await)
      supabase.functions.invoke('generate-investment-report', {
        body: {
          reportId: pendingReport.id,
          propertyAddress,
          propertyDetails
        }
      }).catch(error => {
        console.error('Background generation error:', error);
      });

      toast({
        title: "Report Generation Started",
        description: `Your investment report is being generated in the background. You'll be notified when it's ready. Scope: ${scopeText}`,
      });

      // Refresh recent reports
      fetchRecentReports();
      
      // Clear form
      setQuery('');
      setPropertyPrice('');
      setWeeklyRent('');
      setBeds('');
      setBaths('');

    } catch (error) {
      console.error('Error starting report generation:', error);

      toast({
        title: "Failed to Start Generation",
        description: error instanceof Error ? error.message : "Failed to start report generation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchRecentReports = async () => {
    try {
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching recent reports:', error);
        return;
      }

      setRecentReports(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Fetch recent reports on component mount
  useState(() => {
    fetchRecentReports();
  });

  const getQueryTypeIcon = () => {
    switch (queryType) {
      case 'address':
        return <MapPin className="h-4 w-4" />;
      case 'zipcode':
        return <Hash className="h-4 w-4" />;
      case 'state':
        return <Globe className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getQueryTypePlaceholder = () => {
    switch (queryType) {
      case 'address':
        return 'e.g., 123 Main Street, Sydney NSW 2000';
      case 'zipcode':
        return 'e.g., 2000, 3000, 4000';
      case 'state':
        return 'e.g., NSW, VIC, QLD, WA, SA, TAS, NT, ACT';
      default:
        return 'Enter your query...';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">Investment Report Generator</h2>
        <p className="text-muted-foreground">
          Generate comprehensive property investment analysis using AI-powered research for addresses, zip codes, or states across Australia.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Generator Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Generate Investment Analysis
              </CardTitle>
              <CardDescription>
                Choose your analysis scope and enter the location details to generate a comprehensive investment report.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Query Type Selection */}
              <div className="space-y-3">
                <Label htmlFor="queryType">Analysis Scope</Label>
                <Select value={queryType} onValueChange={(value: 'address' | 'zipcode' | 'state') => setQueryType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select analysis type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="address" className="flex items-center">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Specific Property Address
                      </div>
                    </SelectItem>
                    <SelectItem value="zipcode" className="flex items-center">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Zip Code Area Analysis
                      </div>
                    </SelectItem>
                    <SelectItem value="state" className="flex items-center">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        State-Wide Market Analysis
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Query Input */}
              <div className="space-y-3">
                <Label htmlFor="query" className="flex items-center gap-2">
                  {getQueryTypeIcon()}
                  {queryType === 'address' && 'Property Address'}
                  {queryType === 'zipcode' && 'Zip Code'}
                  {queryType === 'state' && 'State'}
                </Label>
                <Input
                  id="query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={getQueryTypePlaceholder()}
                  disabled={isGenerating}
                />
              </div>

              <Separator />

              {/* Property Details - Optional but Recommended */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Property Details (Optional)</Label>
                  <Badge variant="outline" className="text-xs">Enhances Analysis</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Providing these details enables financial calculations, investment scoring, and location intelligence.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="propertyPrice">Property Price ($)</Label>
                    <Input
                      id="propertyPrice"
                      type="number"
                      value={propertyPrice}
                      onChange={(e) => setPropertyPrice(e.target.value)}
                      placeholder="e.g., 750000"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weeklyRent">Weekly Rent ($)</Label>
                    <Input
                      id="weeklyRent"
                      type="number"
                      value={weeklyRent}
                      onChange={(e) => setWeeklyRent(e.target.value)}
                      placeholder="e.g., 550"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propertyType">Property Type</Label>
                    <Select value={propertyType} onValueChange={(value: 'house' | 'apartment' | 'townhouse') => setPropertyType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="apartment">Apartment</SelectItem>
                        <SelectItem value="townhouse">Townhouse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="beds">Bedrooms</Label>
                    <Input
                      id="beds"
                      type="number"
                      value={beds}
                      onChange={(e) => setBeds(e.target.value)}
                      placeholder="e.g., 3"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baths">Bathrooms</Label>
                    <Input
                      id="baths"
                      type="number"
                      value={baths}
                      onChange={(e) => setBaths(e.target.value)}
                      placeholder="e.g., 2"
                      disabled={isGenerating}
                    />
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>What you'll get:</strong></p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Property basics and financial snapshot</li>
                      <li>Investment & growth potential analysis</li>
                      <li>Location & suburb profile</li>
                      <li>10-year projection calculations</li>
                      <li>Investment recommendation with rating</li>
                      <li>Curated sources and citations</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !query.trim()}
                size="lg"
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Analysis...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Generate Investment Report
                  </>
                )}
              </Button>

              {isGenerating && (
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Analyzing market data and generating comprehensive report...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This may take up to 30 seconds
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Reports Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Reports
              </CardTitle>
              <CardDescription>
                Your recently generated investment analyses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">No reports generated yet</p>
                  <p className="text-xs text-muted-foreground">Generate your first report to see it here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentReports.map((report) => (
                    <div
                      key={report.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // Navigate to the Generated Reports page
                        window.location.href = '/generated-reports';
                      }}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium line-clamp-2">
                          {report.property_address}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(report.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  <Separator />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      window.location.href = '/generated-reports';
                    }}
                  >
                    View All Reports
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Results Display */}
      {showResults && generatedReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Generated Investment Analysis
            </CardTitle>
            <CardDescription>
              Comprehensive investment report for {query} • {queryType}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 rounded-lg p-6 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                {generatedReport}
              </pre>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(generatedReport);
                  toast({
                    title: "Copied to Clipboard",
                    description: "Report content has been copied.",
                  });
                }}
              >
                Copy Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = '/generated-reports';
                }}
              >
                View in Reports Page
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}