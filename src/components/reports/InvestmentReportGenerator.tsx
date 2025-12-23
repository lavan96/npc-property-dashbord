import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/hooks/useAuth';
import { addBackgroundJob } from '@/components/BackgroundJobTracker';
import { Loader2, MapPin, Hash, Globe, TrendingUp, AlertCircle, FileText, Link, Upload, X } from 'lucide-react';

interface RecentReport {
  id: string;
  property_address: string;
  created_at: string;
}

export function InvestmentReportGenerator() {
  // Input mode: 'manual', 'url', or 'pdf'
  const [inputMode, setInputMode] = useState<'manual' | 'url' | 'pdf'>('manual');
  
  // URL scraping state
  const [propertyUrl, setPropertyUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  
  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [queryType, setQueryType] = useState<'address' | 'zipcode' | 'suburb' | 'state'>('address');
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
  const [landSize, setLandSize] = useState('');
  const [buildSize, setBuildSize] = useState('');
  
  // New build specific fields
  const [landPrice, setLandPrice] = useState('');
  const [buildPrice, setBuildPrice] = useState('');
  
  // Suburb analysis year context state
  const [dataYearType, setDataYearType] = useState<'single' | 'range'>('single');
  const [singleYear, setSingleYear] = useState('');
  const [yearRangeStart, setYearRangeStart] = useState('');
  const [yearRangeEnd, setYearRangeEnd] = useState('');
  
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

    if (!propertyPrice || parseFloat(propertyPrice) <= 0) {
      toast({
        title: "Property Price Required",
        description: "Please enter a valid property price to calculate investment score.",
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
        case 'suburb':
          propertyAddress = `${query.trim()}, Australia`;
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
      if (landSize) propertyDetails.landSizeSqm = parseFloat(landSize);
      if (buildSize) propertyDetails.buildSizeSqm = parseFloat(buildSize);
      
      // Add suburb year context if provided (only for suburb analysis)
      if (queryType === 'suburb') {
        if (dataYearType === 'single' && singleYear) {
          propertyDetails.dataYearType = 'single';
          propertyDetails.dataYear = parseInt(singleYear);
        } else if (dataYearType === 'range' && yearRangeStart && yearRangeEnd) {
          propertyDetails.dataYearType = 'range';
          propertyDetails.dataYearStart = parseInt(yearRangeStart);
          propertyDetails.dataYearEnd = parseInt(yearRangeEnd);
        }
      }

      // Create the report record first with pending status
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report...',
          status: 'pending',
          report_scope: queryType, // Track the scope type
          generated_by: null, // Set to null to avoid foreign key constraint issues
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
          : queryType === 'suburb'
            ? `Suburb: ${query}`
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
      setLandSize('');
      setBuildSize('');
      setSingleYear('');
      setYearRangeStart('');
      setYearRangeEnd('');

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

  // Handle URL scraping and auto-generate report
  const handleScrapeUrl = async () => {
    if (!propertyUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a property listing URL to scrape.",
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

    setIsScraping(true);
    setScrapeError(null);

    try {
      console.log('Scraping property URL:', propertyUrl);
      
      const { data, error } = await supabase.functions.invoke('scrape-property-listing', {
        body: { url: propertyUrl }
      });

      if (error) {
        console.error('Scrape function error:', error);
        throw new Error(error.message || 'Failed to scrape property listing');
      }

      if (!data.success) {
        throw new Error(data.error || 'Scraping failed');
      }

      console.log('Scrape successful, auto-generating report:', data);
      const scrapedResult = data.data;
      
      // Extract property details
      const extracted = scrapedResult.extractedDetails || {};
      console.log('Extracted details from scrape:', extracted);
      
      // Build property address - try multiple sources
      let propertyAddress = extracted.extractedAddress;
      if (!propertyAddress && extracted.extractedSuburb && extracted.extractedState) {
        propertyAddress = `${extracted.extractedSuburb}, ${extracted.extractedState}${extracted.extractedPostcode ? ' ' + extracted.extractedPostcode : ''}`;
      }
      if (!propertyAddress) {
        // Try to clean up the title - remove common prefixes/suffixes
        const title = scrapedResult.metadata?.title || '';
        const cleanedTitle = title
          .replace(/\s*[-|]\s*(Domain|realestate\.com\.au|Real Estate|Property|For Sale|Sold).*$/i, '')
          .replace(/^(Domain|realestate\.com\.au|Real Estate|Property|For Sale)\s*[-|]\s*/i, '')
          .trim();
        propertyAddress = cleanedTitle || `Property from ${new URL(propertyUrl).hostname}`;
      }

      // Build property details with scraped context - include ALL extracted data
      const propertyDetails: any = { 
        queryType: 'address', 
        originalQuery: propertyAddress,
        scrapedContent: scrapedResult.markdown,
        sourceUrl: scrapedResult.sourceUrl || propertyUrl,
        fromUrlScrape: true, // Flag to indicate this came from URL scrape
      };
      
      // Include all extracted fields
      if (extracted.extractedPrice) propertyDetails.price = extracted.extractedPrice;
      if (extracted.extractedBedrooms) propertyDetails.beds = extracted.extractedBedrooms;
      if (extracted.extractedBathrooms) propertyDetails.baths = extracted.extractedBathrooms;
      if (extracted.extractedCarSpaces) propertyDetails.carSpaces = extracted.extractedCarSpaces;
      if (extracted.extractedLandSize) propertyDetails.landSizeSqm = extracted.extractedLandSize;
      if (extracted.extractedBuildSize) propertyDetails.buildSizeSqm = extracted.extractedBuildSize;
      if (extracted.extractedPropertyType) propertyDetails.propertyType = extracted.extractedPropertyType.toLowerCase();
      if (extracted.extractedPostcode) propertyDetails.postcode = extracted.extractedPostcode;
      if (extracted.extractedState) propertyDetails.state = extracted.extractedState;
      if (extracted.extractedSuburb) propertyDetails.suburb = extracted.extractedSuburb;

      // Log what was extracted for debugging
      console.log('Final property address:', propertyAddress);
      console.log('Final property details:', propertyDetails);

      // Show what was extracted in the toast
      const extractedInfo = [];
      if (extracted.extractedPrice) extractedInfo.push(`$${extracted.extractedPrice.toLocaleString()}`);
      if (extracted.extractedBedrooms) extractedInfo.push(`${extracted.extractedBedrooms} beds`);
      if (extracted.extractedBathrooms) extractedInfo.push(`${extracted.extractedBathrooms} baths`);
      if (extracted.extractedLandSize) extractedInfo.push(`${extracted.extractedLandSize}m²`);
      
      const extractedSummary = extractedInfo.length > 0 
        ? `Found: ${extractedInfo.join(', ')}` 
        : 'Limited details extracted - AI will analyze listing content';

      toast({
        title: "Scraping Successful",
        description: extractedSummary + ". Starting report generation...",
      });

      // Create the report record
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report from scraped listing...',
          status: 'pending',
          report_scope: 'address',
          generated_by: null,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create report: ${insertError.message}`);
      }

      addBackgroundJob({
        id: pendingReport.id,
        type: 'investment_report'
      });

      // Start generation in background with scraped content
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
        description: `Investment report is being generated for "${propertyAddress}". You'll be notified when it's ready.`,
      });

      fetchRecentReports();
      
      // Clear URL form
      setPropertyUrl('');

    } catch (error) {
      console.error('Error scraping URL:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to scrape property listing';
      setScrapeError(errorMessage);
      toast({
        title: "Scraping Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  // Handle PDF file drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setPdfFile(file);
        setPdfError(null);
      } else {
        setPdfError('Please upload a PDF file');
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setPdfFile(file);
        setPdfError(null);
      } else {
        setPdfError('Please upload a PDF file');
      }
    }
  };

  // Handle PDF upload and parse
  const handlePdfUpload = async () => {
    if (!pdfFile) {
      toast({
        title: "PDF Required",
        description: "Please upload a PDF file first.",
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

    setIsParsing(true);
    setPdfError(null);

    try {
      console.log('Processing PDF:', pdfFile.name);
      
      // Read PDF file and convert to base64 for GPT-4o Vision analysis
      const arrayBuffer = await pdfFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64 for sending to edge function
      let binary = '';
      uint8Array.forEach(byte => binary += String.fromCharCode(byte));
      const base64Content = btoa(binary);
      
      console.log('PDF converted to base64, length:', base64Content.length);

      // Call edge function to parse PDF using GPT-4o Vision
      const { data, error } = await supabase.functions.invoke('parse-property-pdf', {
        body: { 
          base64Content: base64Content,
          fileName: pdfFile.name
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to parse PDF');
      }

      if (!data.success) {
        throw new Error(data.error || 'PDF parsing failed');
      }

      console.log('PDF parsed successfully:', data);
      const extracted = data.extractedData || {};
      
      // Build property address
      let propertyAddress = extracted.extractedAddress;
      if (!propertyAddress && extracted.extractedSuburb) {
        propertyAddress = `${extracted.extractedSuburb}${extracted.extractedState ? ', ' + extracted.extractedState : ''}${extracted.extractedPostcode ? ' ' + extracted.extractedPostcode : ''}`;
      }
      if (!propertyAddress) {
        propertyAddress = `Property from ${pdfFile.name}`;
      }

      // Show what was extracted
      const extractedInfo = [];
      if (extracted.extractedPrice) extractedInfo.push(`$${extracted.extractedPrice.toLocaleString()}`);
      if (extracted.extractedBedrooms) extractedInfo.push(`${extracted.extractedBedrooms} beds`);
      if (extracted.extractedBathrooms) extractedInfo.push(`${extracted.extractedBathrooms} baths`);
      if (extracted.extractedLandSize) extractedInfo.push(`${extracted.extractedLandSize}m² land`);
      if (extracted.extractedIsNewBuild) extractedInfo.push('New Build');
      
      const extractedSummary = extractedInfo.length > 0 
        ? `Found: ${extractedInfo.join(', ')}` 
        : 'Limited details extracted - AI will analyze document content';

      toast({
        title: "PDF Parsed Successfully",
        description: extractedSummary + ". Starting report generation...",
      });

      // Build property details with extracted context
      const propertyDetails: any = { 
        queryType: 'address', 
        originalQuery: propertyAddress,
        pdfContent: data.pdfContent,
        fromPdfUpload: true,
      };
      
      // Include all extracted fields
      if (extracted.extractedPrice) propertyDetails.price = extracted.extractedPrice;
      if (extracted.extractedBedrooms) propertyDetails.beds = extracted.extractedBedrooms;
      if (extracted.extractedBathrooms) propertyDetails.baths = extracted.extractedBathrooms;
      if (extracted.extractedCarSpaces) propertyDetails.carSpaces = extracted.extractedCarSpaces;
      if (extracted.extractedLandSize) propertyDetails.landSizeSqm = extracted.extractedLandSize;
      if (extracted.extractedBuildSize) propertyDetails.buildSizeSqm = extracted.extractedBuildSize;
      if (extracted.extractedPropertyType) propertyDetails.propertyType = extracted.extractedPropertyType.toLowerCase();
      if (extracted.extractedPostcode) propertyDetails.postcode = extracted.extractedPostcode;
      if (extracted.extractedState) propertyDetails.state = extracted.extractedState;
      if (extracted.extractedSuburb) propertyDetails.suburb = extracted.extractedSuburb;
      if (extracted.extractedWeeklyRent) propertyDetails.weeklyRent = extracted.extractedWeeklyRent;
      if (extracted.extractedLandPrice) propertyDetails.landPrice = extracted.extractedLandPrice;
      if (extracted.extractedBuildPrice) propertyDetails.buildPrice = extracted.extractedBuildPrice;
      if (extracted.extractedIsNewBuild) propertyDetails.isNewBuild = extracted.extractedIsNewBuild;

      // Create the report record
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report from PDF...',
          status: 'pending',
          report_scope: 'address',
          generated_by: null,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create report: ${insertError.message}`);
      }

      addBackgroundJob({
        id: pendingReport.id,
        type: 'investment_report'
      });

      // Start generation in background with PDF content
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
        description: `Investment report is being generated for "${propertyAddress}". You'll be notified when it's ready.`,
      });

      fetchRecentReports();
      
      // Clear PDF form
      setPdfFile(null);

    } catch (error) {
      console.error('Error processing PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF';
      setPdfError(errorMessage);
      toast({
        title: "PDF Processing Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
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
      case 'suburb':
        return <MapPin className="h-4 w-4" />;
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
      case 'suburb':
        return 'e.g., Bondi NSW, Carlton VIC, Fortitude Valley QLD';
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
                Choose your input method - enter details manually, scrape from a URL, or upload a PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Input Mode Tabs */}
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'manual' | 'url' | 'pdf')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="manual" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Manual Entry
                  </TabsTrigger>
                  <TabsTrigger value="url" className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    URL Scrape
                  </TabsTrigger>
                  <TabsTrigger value="pdf" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    PDF Upload
                  </TabsTrigger>
                </TabsList>

                {/* Manual Entry Tab */}
                <TabsContent value="manual" className="space-y-6 pt-4">
                  {/* Query Type Selection */}
                  <div className="space-y-3">
                    <Label htmlFor="queryType">Analysis Scope</Label>
                    <Select value={queryType} onValueChange={(value: 'address' | 'zipcode' | 'suburb' | 'state') => setQueryType(value)}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select analysis type" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="address">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Specific Property Address
                          </div>
                        </SelectItem>
                        <SelectItem value="zipcode">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4" />
                            Zip Code Area Analysis
                          </div>
                        </SelectItem>
                        <SelectItem value="suburb">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Suburb Investment Analysis
                          </div>
                        </SelectItem>
                        <SelectItem value="state">
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
                      {queryType === 'suburb' && 'Suburb Name'}
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
                  <Label className="text-base font-semibold">Property Details</Label>
                  <Badge variant="default" className="text-xs">Required for Scoring</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Property price is required for investment scoring. Other details are optional but enhance analysis accuracy.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="propertyPrice" className="flex items-center gap-1">
                      Property Price ($) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="propertyPrice"
                      type="number"
                      value={propertyPrice}
                      onChange={(e) => setPropertyPrice(e.target.value)}
                      placeholder="e.g., 750000"
                      disabled={isGenerating}
                      required
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

                  <div className="space-y-2">
                    <Label htmlFor="landSize">Land Size (m²)</Label>
                    <Input
                      id="landSize"
                      type="number"
                      value={landSize}
                      onChange={(e) => setLandSize(e.target.value)}
                      placeholder="e.g., 450"
                      disabled={isGenerating}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="buildSize">Build Size (m²)</Label>
                    <Input
                      id="buildSize"
                      type="number"
                      value={buildSize}
                      onChange={(e) => setBuildSize(e.target.value)}
                      placeholder="e.g., 180"
                      disabled={isGenerating}
                    />
                  </div>
                </div>
              </div>

              {/* Suburb Year Context - Only show for suburb analysis */}
              {queryType === 'suburb' && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Data Year Context (Optional)</Label>
                      <Badge variant="outline" className="text-xs">Suburb Analysis</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Specify the year(s) for which data should be sourced and analyzed. Leave empty for the most current data.
                    </p>

                    <div className="space-y-3">
                      <Label>Data Period Type</Label>
                      <Select value={dataYearType} onValueChange={(value: 'single' | 'range') => setDataYearType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Year</SelectItem>
                          <SelectItem value="range">Year Range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {dataYearType === 'single' ? (
                      <div className="space-y-2">
                        <Label htmlFor="singleYear">Data Year</Label>
                        <Input
                          id="singleYear"
                          type="number"
                          min="2010"
                          max={new Date().getFullYear()}
                          value={singleYear}
                          onChange={(e) => setSingleYear(e.target.value)}
                          placeholder={`e.g., ${new Date().getFullYear()}`}
                          disabled={isGenerating}
                        />
                        <p className="text-xs text-muted-foreground">
                          Focus on data from a specific year (e.g., 2024 for latest annual data)
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="yearRangeStart">From Year</Label>
                          <Input
                            id="yearRangeStart"
                            type="number"
                            min="2010"
                            max={new Date().getFullYear()}
                            value={yearRangeStart}
                            onChange={(e) => setYearRangeStart(e.target.value)}
                            placeholder="e.g., 2020"
                            disabled={isGenerating}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="yearRangeEnd">To Year</Label>
                          <Input
                            id="yearRangeEnd"
                            type="number"
                            min="2010"
                            max={new Date().getFullYear()}
                            value={yearRangeEnd}
                            onChange={(e) => setYearRangeEnd(e.target.value)}
                            placeholder={`e.g., ${new Date().getFullYear()}`}
                            disabled={isGenerating}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-2">
                          Analyze trends and data across multiple years (e.g., 2020-2024 for 5-year trends)
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

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
                </TabsContent>

                {/* URL Scrape Tab */}
                <TabsContent value="url" className="space-y-6 pt-4">
                  {/* URL Input */}
                  <div className="space-y-3">
                    <Label htmlFor="propertyUrl" className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Property Listing URL
                    </Label>
                    <Input
                      id="propertyUrl"
                      value={propertyUrl}
                      onChange={(e) => setPropertyUrl(e.target.value)}
                      placeholder="https://www.domain.com.au/property/..."
                      disabled={isScraping}
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste a URL from Domain, REA, or other property listing sites. We'll extract property details and generate a report automatically.
                    </p>
                  </div>

                  {/* Scrape Error */}
                  {scrapeError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Scraping Failed</p>
                          <p className="text-sm text-destructive/80">{scrapeError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info for URL mode */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>Supported Sites:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Domain.com.au</li>
                          <li>Realestate.com.au</li>
                          <li>Allhomes.com.au</li>
                          <li>Most Australian property listing sites</li>
                        </ul>
                        <p className="mt-2">
                          The scraper will extract property details and automatically generate a comprehensive investment report.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scrape & Generate Button */}
                  <Button
                    onClick={handleScrapeUrl}
                    disabled={isScraping || !propertyUrl.trim()}
                    size="lg"
                    className="w-full"
                  >
                    {isScraping ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scraping & Generating Report...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Scrape & Generate Report
                      </>
                    )}
                  </Button>
                </TabsContent>

                {/* PDF Upload Tab */}
                <TabsContent value="pdf" className="space-y-6 pt-4">
                  {/* PDF Drop Zone */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Property PDF
                    </Label>
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`
                        border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                        ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                        ${pdfFile ? 'bg-muted/30' : ''}
                      `}
                      onClick={() => document.getElementById('pdf-upload')?.click()}
                    >
                      {pdfFile ? (
                        <div className="space-y-2">
                          <FileText className="h-12 w-12 mx-auto text-primary" />
                          <p className="text-sm font-medium">{pdfFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPdfFile(null);
                            }}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Drag and drop a PDF file here, or click to browse
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Supports property listing PDFs, brochures, and contracts
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* PDF Error */}
                  {pdfError && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Processing Failed</p>
                          <p className="text-sm text-destructive/80">{pdfError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info for PDF mode */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><strong>Supported Documents:</strong></p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Property listing brochures</li>
                          <li>House and land package documents</li>
                          <li>Building contracts with pricing</li>
                          <li>Property investment summaries</li>
                        </ul>
                        <p className="mt-2">
                          AI will extract property details (address, price, size, etc.) and generate a comprehensive investment report.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Parse & Generate Button */}
                  <Button
                    onClick={handlePdfUpload}
                    disabled={isParsing || !pdfFile}
                    size="lg"
                    className="w-full"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing PDF & Generating Report...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Parse PDF & Generate Report
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
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