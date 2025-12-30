import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useAuth } from '@/hooks/useAuth';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { addBackgroundJob } from '@/components/BackgroundJobTracker';
import { Loader2, MapPin, Hash, Globe, TrendingUp, AlertCircle, FileText, Link, Upload, X, Image, Car } from 'lucide-react';
import { convertPdfToImages, isPdfFile, isImageFile, imageFileToBase64 } from '@/utils/pdfToImages';
import { PreGenerationOverrides, PreGenerationData } from './PreGenerationOverrides';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';

interface RecentReport {
  id: string;
  property_address: string;
  created_at: string;
}

export function InvestmentReportGenerator() {
  // Input mode: 'manual', 'url', or 'pdf'
  const [inputMode, setInputMode] = useState<'manual' | 'url' | 'pdf' | 'overrides'>('manual');
  
  // URL scraping state
  const [propertyUrl, setPropertyUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [urlScrapedData, setUrlScrapedData] = useState<{ propertyAddress: string; scrapedContent: string; sourceUrl: string } | null>(null);
  const [isUrlGenerating, setIsUrlGenerating] = useState(false);
  
  // PDF upload state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ current: number; total: number } | null>(null);
  const [pdfParsedData, setPdfParsedData] = useState<{ propertyAddress: string; pdfContent: string } | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  
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
  const [carSpaces, setCarSpaces] = useState('');
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
  const { logActivity } = useActivityLogger();
  
  // Pre-generation overrides data
  const [preGenData, setPreGenData] = useState<PreGenerationData>({ buildType: 'existing_property' });
  
  // Track if sync is in progress to prevent loops
  const isSyncingFromPreGen = useRef(false);
  const isSyncingToPreGen = useRef(false);

  // Handle currency input change with comma formatting
  const handleCurrencyInputChange = useCallback((setter: (value: string) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = removeCommas(e.target.value);
      if (rawValue === '' || rawValue === '-' || /^-?\d*\.?\d*$/.test(rawValue)) {
        setter(rawValue);
      }
    };
  }, []);

  // Sync propertyPrice with preGenData.purchasePrice (bidirectional)
  const handlePropertyPriceChange = useCallback((value: string) => {
    const rawValue = removeCommas(value);
    if (rawValue === '' || rawValue === '-' || /^-?\d*\.?\d*$/.test(rawValue)) {
      setPropertyPrice(rawValue);
      
      if (!isSyncingFromPreGen.current) {
        isSyncingToPreGen.current = true;
        const numValue = parseFloat(rawValue);
        if (!isNaN(numValue) && numValue > 0) {
          setPreGenData(prev => ({ ...prev, purchasePrice: numValue }));
        } else if (rawValue === '') {
          setPreGenData(prev => ({ ...prev, purchasePrice: undefined }));
        }
        requestAnimationFrame(() => { isSyncingToPreGen.current = false; });
      }
    }
  }, []);

  // Sync weeklyRent with preGenData.weeklyRent (bidirectional)
  const handleWeeklyRentChange = useCallback((value: string) => {
    const rawValue = removeCommas(value);
    if (rawValue === '' || rawValue === '-' || /^-?\d*\.?\d*$/.test(rawValue)) {
      setWeeklyRent(rawValue);
      
      if (!isSyncingFromPreGen.current) {
        isSyncingToPreGen.current = true;
        const numValue = parseFloat(rawValue);
        if (!isNaN(numValue) && numValue > 0) {
          setPreGenData(prev => ({ ...prev, weeklyRent: numValue }));
        } else if (rawValue === '') {
          setPreGenData(prev => ({ ...prev, weeklyRent: undefined }));
        }
        requestAnimationFrame(() => { isSyncingToPreGen.current = false; });
      }
    }
  }, []);

  // Handle carSpaces change and sync to preGenData
  const handleCarSpacesChange = useCallback((value: string) => {
    setCarSpaces(value);
    
    if (!isSyncingFromPreGen.current) {
      isSyncingToPreGen.current = true;
      const numValue = parseInt(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setPreGenData(prev => ({ ...prev, carSpaces: numValue }));
      } else if (value === '') {
        setPreGenData(prev => ({ ...prev, carSpaces: undefined }));
      }
      requestAnimationFrame(() => { isSyncingToPreGen.current = false; });
    }
  }, []);

  // Handle preGenData changes from PreGenerationOverrides - sync back to main form fields
  const handlePreGenDataChange = useCallback((data: PreGenerationData) => {
    setPreGenData(data);
    
    // Only sync back if not currently syncing TO PreGen (prevents loops)
    if (!isSyncingToPreGen.current) {
      isSyncingFromPreGen.current = true;
      
      // Sync purchasePrice back to propertyPrice if changed in PreGenerationOverrides
      if (data.purchasePrice !== undefined) {
        const dataValueStr = data.purchasePrice.toString();
        if (propertyPrice !== dataValueStr) {
          setPropertyPrice(dataValueStr);
        }
      }
      
      // Sync weeklyRent back to main form if changed in PreGenerationOverrides
      if (data.weeklyRent !== undefined) {
        const dataValueStr = data.weeklyRent.toString();
        if (weeklyRent !== dataValueStr) {
          setWeeklyRent(dataValueStr);
        }
      }
      
      // Sync carSpaces back to main form if changed in PreGenerationOverrides
      if (data.carSpaces !== undefined) {
        const dataValueStr = data.carSpaces.toString();
        if (carSpaces !== dataValueStr) {
          setCarSpaces(dataValueStr);
        }
      }
      
      // Reset flag after React has processed the state updates
      requestAnimationFrame(() => { isSyncingFromPreGen.current = false; });
    }
  }, [propertyPrice, weeklyRent, carSpaces]);

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
        title: "Purchase Price Required",
        description: "Please enter a valid purchase price to calculate investment score.",
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

      // Build property details object with pre-generation overrides
      const propertyDetails: any = { 
        queryType, 
        originalQuery: query,
        // Include pre-generation manual overrides for context injection
        manualOverrides: preGenData,
      };
      
      // Add optional property details if provided (form values take precedence over preGenData)
      if (propertyPrice) {
        propertyDetails.price = parseFloat(propertyPrice);
      } else if (preGenData.purchasePrice) {
        propertyDetails.price = preGenData.purchasePrice;
      }
      
      if (weeklyRent) {
        propertyDetails.weeklyRent = parseFloat(weeklyRent);
      } else if (preGenData.weeklyRent) {
        propertyDetails.weeklyRent = preGenData.weeklyRent;
      }
      
      if (propertyType) propertyDetails.propertyType = propertyType;
      if (beds) propertyDetails.beds = parseInt(beds);
      if (baths) propertyDetails.baths = parseInt(baths);
      if (carSpaces) propertyDetails.carSpaces = parseInt(carSpaces);
      if (landSize) propertyDetails.landSizeSqm = parseFloat(landSize);
      if (buildSize) propertyDetails.buildSizeSqm = parseFloat(buildSize);
      
      // Include build type from pre-generation data
      propertyDetails.buildType = preGenData.buildType;
      
      // For new builds, add land and build prices
      if (preGenData.buildType === 'new_build') {
        if (preGenData.landPrice) propertyDetails.landPrice = preGenData.landPrice;
        if (preGenData.buildPrice) propertyDetails.buildPrice = preGenData.buildPrice;
        if (preGenData.agentFee) propertyDetails.agentFee = preGenData.agentFee;
      } else {
        if (preGenData.depositValue) propertyDetails.depositValue = preGenData.depositValue;
      }
      
      // Add financial assumptions
      if (preGenData.loanToValueRatio) propertyDetails.loanToValueRatio = preGenData.loanToValueRatio;
      if (preGenData.interestRate) propertyDetails.interestRate = preGenData.interestRate;
      if (preGenData.capitalGrowth) propertyDetails.capitalGrowth = preGenData.capitalGrowth;
      
      // Add expense overrides
      if (preGenData.stampDuty) propertyDetails.stampDuty = preGenData.stampDuty;
      if (preGenData.bodyCorporateFees) propertyDetails.bodyCorporateFees = preGenData.bodyCorporateFees;
      if (preGenData.landTax) propertyDetails.landTax = preGenData.landTax;
      if (preGenData.councilRates) propertyDetails.councilRates = preGenData.councilRates;
      if (preGenData.waterRates) propertyDetails.waterRates = preGenData.waterRates;
      if (preGenData.solicitorFees) propertyDetails.solicitorFees = preGenData.solicitorFees;
      if (preGenData.buildingLandlordInsurance) propertyDetails.buildingLandlordInsurance = preGenData.buildingLandlordInsurance;
      if (preGenData.propertyManagementFees) propertyDetails.propertyManagementFees = preGenData.propertyManagementFees;
      if (preGenData.repairsMaintenance) propertyDetails.repairsMaintenance = preGenData.repairsMaintenance;
      if (preGenData.lettingFees) propertyDetails.lettingFees = preGenData.lettingFees;
      
      // Add strata breakdown
      if (preGenData.strataAdminFund) propertyDetails.strataAdminFund = preGenData.strataAdminFund;
      if (preGenData.strataSinkingFund) propertyDetails.strataSinkingFund = preGenData.strataSinkingFund;
      if (preGenData.strataSpecialLevies) propertyDetails.strataSpecialLevies = preGenData.strataSpecialLevies;
      
      // Add cash flow analysis overrides (optional values that cascade to 10-year analysis)
      if (preGenData.cpiGrowthRate) propertyDetails.cpiGrowthRate = preGenData.cpiGrowthRate;
      if (preGenData.depreciation) propertyDetails.depreciation = preGenData.depreciation;
      if (preGenData.taxRate) propertyDetails.taxRate = preGenData.taxRate;
      if (preGenData.occupancyRate) propertyDetails.occupancyRate = preGenData.occupancyRate;
      if (preGenData.loanType) propertyDetails.loanType = preGenData.loanType;
      if (preGenData.loanTermYears) propertyDetails.loanTermYears = preGenData.loanTermYears;
      if (preGenData.marketValueNow) propertyDetails.marketValueNow = preGenData.marketValueNow;
      
      // Additional cash flow fields (optional)
      if (preGenData.loanAmount) propertyDetails.loanAmount = preGenData.loanAmount;
      if (preGenData.interestOnlyPeriodYears) propertyDetails.interestOnlyPeriodYears = preGenData.interestOnlyPeriodYears;
      if (preGenData.repaymentFrequency) propertyDetails.repaymentFrequency = preGenData.repaymentFrequency;
      if (preGenData.extraRepaymentPerMonth) propertyDetails.extraRepaymentPerMonth = preGenData.extraRepaymentPerMonth;
      if (preGenData.offsetBalance) propertyDetails.offsetBalance = preGenData.offsetBalance;
      if (preGenData.constructionDurationMonths) propertyDetails.constructionDurationMonths = preGenData.constructionDurationMonths;
      if (preGenData.constructionYear) propertyDetails.constructionYear = preGenData.constructionYear;
      if (preGenData.landSizeSqm) propertyDetails.landSizeSqm = preGenData.landSizeSqm;
      if (preGenData.buildSizeSqm) propertyDetails.buildSizeSqm = preGenData.buildSizeSqm;
      
      // First Home Buyer flag for stamp duty concessions
      if (preGenData.isFirstHomeBuyer) propertyDetails.isFirstHomeBuyer = preGenData.isFirstHomeBuyer;
      
      // Construction Stage Percentages (new build only)
      if (preGenData.buildType === 'new_build') {
        if (preGenData.stageDepositPercent) propertyDetails.stageDepositPercent = preGenData.stageDepositPercent;
        if (preGenData.stageSlabPercent) propertyDetails.stageSlabPercent = preGenData.stageSlabPercent;
        if (preGenData.stageFramePercent) propertyDetails.stageFramePercent = preGenData.stageFramePercent;
        if (preGenData.stageLockupPercent) propertyDetails.stageLockupPercent = preGenData.stageLockupPercent;
        if (preGenData.stageFixingPercent) propertyDetails.stageFixingPercent = preGenData.stageFixingPercent;
        if (preGenData.stageCompletionPercent) propertyDetails.stageCompletionPercent = preGenData.stageCompletionPercent;
      }
      
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

      // Create the report record first with pending status and pre-generation overrides
      // Filter out undefined values and cast to Json for Supabase compatibility
      const cleanedOverrides = Object.fromEntries(
        Object.entries(preGenData).filter(([_, v]) => v !== undefined)
      ) as Json;
      
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report...',
          status: 'pending',
          report_scope: queryType, // Track the scope type
          generated_by: null, // Set to null to avoid foreign key constraint issues
          manual_overrides: cleanedOverrides, // Save pre-generation overrides immediately
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

      // Log report generation activity
      logActivity({
        actionType: 'report_generated',
        entityType: 'investment_report',
        entityId: pendingReport.id,
        entityName: propertyAddress,
        metadata: { queryType, scope: queryType }
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

  // Handle URL scraping ONLY - populates fields without generating report
  const handleScrapeUrlOnly = async () => {
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
        description: "Please log in to scrape listings.",
        variant: "destructive",
      });
      return;
    }

    setIsScraping(true);
    setScrapeError(null);
    setUrlScrapedData(null);

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

      console.log('Scrape successful:', data);
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
        const title = scrapedResult.metadata?.title || '';
        const cleanedTitle = title
          .replace(/\s*[-|]\s*(Domain|realestate\.com\.au|Real Estate|Property|For Sale|Sold).*$/i, '')
          .replace(/^(Domain|realestate\.com\.au|Real Estate|Property|For Sale)\s*[-|]\s*/i, '')
          .trim();
        propertyAddress = cleanedTitle || `Property from ${new URL(propertyUrl).hostname}`;
      }

      // Store scraped data for later generation
      setUrlScrapedData({
        propertyAddress,
        scrapedContent: scrapedResult.markdown,
        sourceUrl: scrapedResult.sourceUrl || propertyUrl,
      });

      // Populate form fields with scraped data (without triggering sync loops)
      isSyncingFromPreGen.current = true;
      
      if (extracted.extractedPrice) {
        setPropertyPrice(extracted.extractedPrice.toString());
      }
      if (extracted.extractedBedrooms) {
        setBeds(extracted.extractedBedrooms.toString());
      }
      if (extracted.extractedBathrooms) {
        setBaths(extracted.extractedBathrooms.toString());
      }
      if (extracted.extractedCarSpaces) {
        setCarSpaces(extracted.extractedCarSpaces.toString());
      }
      if (extracted.extractedLandSize) {
        setLandSize(extracted.extractedLandSize.toString());
      }
      if (extracted.extractedBuildSize) {
        setBuildSize(extracted.extractedBuildSize.toString());
      }
      if (extracted.extractedPropertyType) {
        const pType = extracted.extractedPropertyType.toLowerCase();
        if (pType === 'house' || pType === 'apartment' || pType === 'townhouse') {
          setPropertyType(pType);
        }
      }
      if (extracted.extractedWeeklyRent) {
        setWeeklyRent(extracted.extractedWeeklyRent.toString());
      }

      // Update preGenData with scraped values
      setPreGenData(prev => ({
        ...prev,
        purchasePrice: extracted.extractedPrice || prev.purchasePrice,
        weeklyRent: extracted.extractedWeeklyRent || prev.weeklyRent,
        carSpaces: extracted.extractedCarSpaces || prev.carSpaces,
        landSizeSqm: extracted.extractedLandSize || prev.landSizeSqm,
        buildSizeSqm: extracted.extractedBuildSize || prev.buildSizeSqm,
      }));

      requestAnimationFrame(() => { isSyncingFromPreGen.current = false; });

      // Show what was extracted
      const extractedInfo = [];
      if (extracted.extractedPrice) extractedInfo.push(`$${extracted.extractedPrice.toLocaleString()}`);
      if (extracted.extractedBedrooms) extractedInfo.push(`${extracted.extractedBedrooms} beds`);
      if (extracted.extractedBathrooms) extractedInfo.push(`${extracted.extractedBathrooms} baths`);
      if (extracted.extractedLandSize) extractedInfo.push(`${extracted.extractedLandSize}m²`);
      
      const extractedSummary = extractedInfo.length > 0 
        ? `Found: ${extractedInfo.join(', ')}` 
        : 'Limited details extracted - review and add missing data';

      toast({
        title: "Scraping Successful",
        description: extractedSummary + ". Review the fields below, add any overrides, then generate the report.",
      });

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

  // Handle report generation from scraped URL data
  const handleGenerateFromUrl = async () => {
    if (!urlScrapedData) {
      toast({
        title: "Scrape Required",
        description: "Please scrape a URL first before generating a report.",
        variant: "destructive",
      });
      return;
    }

    if (!propertyPrice || parseFloat(propertyPrice) <= 0) {
      toast({
        title: "Purchase Price Required",
        description: "Please enter a valid purchase price to calculate investment score.",
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

    setIsUrlGenerating(true);

    try {
      const { propertyAddress, scrapedContent, sourceUrl } = urlScrapedData;

      // Build property details with form values and preGenData
      const propertyDetails: any = { 
        queryType: 'address', 
        originalQuery: propertyAddress,
        scrapedContent,
        sourceUrl,
        fromUrlScrape: true,
        manualOverrides: preGenData,
      };
      
      // Add form field values
      if (propertyPrice) propertyDetails.price = parseFloat(propertyPrice);
      if (weeklyRent) propertyDetails.weeklyRent = parseFloat(weeklyRent);
      if (propertyType) propertyDetails.propertyType = propertyType;
      if (beds) propertyDetails.beds = parseInt(beds);
      if (baths) propertyDetails.baths = parseInt(baths);
      if (carSpaces) propertyDetails.carSpaces = parseInt(carSpaces);
      if (landSize) propertyDetails.landSizeSqm = parseFloat(landSize);
      if (buildSize) propertyDetails.buildSizeSqm = parseFloat(buildSize);

      // Apply all preGenData overrides
      propertyDetails.buildType = preGenData.buildType;
      if (preGenData.purchasePrice) propertyDetails.price = preGenData.purchasePrice;
      if (preGenData.weeklyRent) propertyDetails.weeklyRent = preGenData.weeklyRent;
      if (preGenData.carSpaces) propertyDetails.carSpaces = preGenData.carSpaces;
      if (preGenData.landSizeSqm) propertyDetails.landSizeSqm = preGenData.landSizeSqm;
      if (preGenData.buildSizeSqm) propertyDetails.buildSizeSqm = preGenData.buildSizeSqm;
      
      if (preGenData.buildType === 'new_build') {
        if (preGenData.landPrice) propertyDetails.landPrice = preGenData.landPrice;
        if (preGenData.buildPrice) propertyDetails.buildPrice = preGenData.buildPrice;
        if (preGenData.agentFee) propertyDetails.agentFee = preGenData.agentFee;
      } else {
        if (preGenData.depositValue) propertyDetails.depositValue = preGenData.depositValue;
      }
      
      if (preGenData.loanToValueRatio) propertyDetails.loanToValueRatio = preGenData.loanToValueRatio;
      if (preGenData.interestRate) propertyDetails.interestRate = preGenData.interestRate;
      if (preGenData.capitalGrowth) propertyDetails.capitalGrowth = preGenData.capitalGrowth;
      if (preGenData.stampDuty) propertyDetails.stampDuty = preGenData.stampDuty;
      if (preGenData.bodyCorporateFees) propertyDetails.bodyCorporateFees = preGenData.bodyCorporateFees;
      if (preGenData.landTax) propertyDetails.landTax = preGenData.landTax;
      if (preGenData.councilRates) propertyDetails.councilRates = preGenData.councilRates;
      if (preGenData.waterRates) propertyDetails.waterRates = preGenData.waterRates;
      if (preGenData.solicitorFees) propertyDetails.solicitorFees = preGenData.solicitorFees;
      if (preGenData.buildingLandlordInsurance) propertyDetails.buildingLandlordInsurance = preGenData.buildingLandlordInsurance;
      if (preGenData.propertyManagementFees) propertyDetails.propertyManagementFees = preGenData.propertyManagementFees;
      if (preGenData.repairsMaintenance) propertyDetails.repairsMaintenance = preGenData.repairsMaintenance;
      if (preGenData.lettingFees) propertyDetails.lettingFees = preGenData.lettingFees;
      if (preGenData.strataAdminFund) propertyDetails.strataAdminFund = preGenData.strataAdminFund;
      if (preGenData.strataSinkingFund) propertyDetails.strataSinkingFund = preGenData.strataSinkingFund;
      if (preGenData.strataSpecialLevies) propertyDetails.strataSpecialLevies = preGenData.strataSpecialLevies;
      if (preGenData.cpiGrowthRate) propertyDetails.cpiGrowthRate = preGenData.cpiGrowthRate;
      if (preGenData.depreciation) propertyDetails.depreciation = preGenData.depreciation;
      if (preGenData.taxRate) propertyDetails.taxRate = preGenData.taxRate;
      if (preGenData.occupancyRate) propertyDetails.occupancyRate = preGenData.occupancyRate;
      if (preGenData.loanType) propertyDetails.loanType = preGenData.loanType;
      if (preGenData.loanTermYears) propertyDetails.loanTermYears = preGenData.loanTermYears;
      if (preGenData.marketValueNow) propertyDetails.marketValueNow = preGenData.marketValueNow;
      if (preGenData.loanAmount) propertyDetails.loanAmount = preGenData.loanAmount;
      if (preGenData.interestOnlyPeriodYears) propertyDetails.interestOnlyPeriodYears = preGenData.interestOnlyPeriodYears;
      if (preGenData.repaymentFrequency) propertyDetails.repaymentFrequency = preGenData.repaymentFrequency;
      if (preGenData.extraRepaymentPerMonth) propertyDetails.extraRepaymentPerMonth = preGenData.extraRepaymentPerMonth;
      if (preGenData.offsetBalance) propertyDetails.offsetBalance = preGenData.offsetBalance;
      if (preGenData.constructionDurationMonths) propertyDetails.constructionDurationMonths = preGenData.constructionDurationMonths;
      if (preGenData.constructionYear) propertyDetails.constructionYear = preGenData.constructionYear;
      if (preGenData.isFirstHomeBuyer) propertyDetails.isFirstHomeBuyer = preGenData.isFirstHomeBuyer;
      
      if (preGenData.buildType === 'new_build') {
        if (preGenData.stageDepositPercent) propertyDetails.stageDepositPercent = preGenData.stageDepositPercent;
        if (preGenData.stageSlabPercent) propertyDetails.stageSlabPercent = preGenData.stageSlabPercent;
        if (preGenData.stageFramePercent) propertyDetails.stageFramePercent = preGenData.stageFramePercent;
        if (preGenData.stageLockupPercent) propertyDetails.stageLockupPercent = preGenData.stageLockupPercent;
        if (preGenData.stageFixingPercent) propertyDetails.stageFixingPercent = preGenData.stageFixingPercent;
        if (preGenData.stageCompletionPercent) propertyDetails.stageCompletionPercent = preGenData.stageCompletionPercent;
      }
      
      if (preGenData.depreciationSchedule) propertyDetails.depreciationSchedule = preGenData.depreciationSchedule;
      if (preGenData.depreciationMethod) propertyDetails.depreciationMethod = preGenData.depreciationMethod;

      // Create the report record
      const cleanedOverrides = Object.fromEntries(
        Object.entries(preGenData).filter(([_, v]) => v !== undefined)
      ) as Json;
      
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report from scraped listing...',
          status: 'pending',
          report_scope: 'address',
          generated_by: null,
          manual_overrides: cleanedOverrides,
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

      // Start generation in background
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
      
      // Clear form
      setPropertyUrl('');
      setUrlScrapedData(null);

    } catch (error) {
      console.error('Error generating report from URL:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Failed to generate report',
        variant: "destructive",
      });
    } finally {
      setIsUrlGenerating(false);
    }
  };


  // Handle PDF/image file drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isPdfFile(file) || isImageFile(file)) {
        setPdfFile(file);
        setPdfError(null);
      } else {
        setPdfError('Please upload a PDF or image file (PNG, JPG, WEBP)');
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
      if (isPdfFile(file) || isImageFile(file)) {
        setPdfFile(file);
        setPdfError(null);
      } else {
        setPdfError('Please upload a PDF or image file (PNG, JPG, WEBP)');
      }
    }
  };

  // Handle PDF/image parsing ONLY - populates fields without generating report
  const handleParsePdfOnly = async () => {
    if (!pdfFile) {
      toast({
        title: "File Required",
        description: "Please upload a PDF or image file first.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to parse documents.",
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    setPdfError(null);
    setConversionProgress(null);
    setPdfParsedData(null);

    try {
      console.log('Processing file:', pdfFile.name, 'Type:', pdfFile.type);
      
      let requestBody: any = { fileName: pdfFile.name };
      
      if (isPdfFile(pdfFile)) {
        console.log('🔄 Converting PDF to images...');
        
        toast({
          title: "Converting PDF",
          description: "Rendering PDF pages as images for analysis...",
        });
        
        const conversionResult = await convertPdfToImages(pdfFile, (current, total) => {
          setConversionProgress({ current, total });
          console.log(`📄 Rendering page ${current}/${total}`);
        });
        
        if (!conversionResult.success) {
          throw new Error(conversionResult.error || 'Failed to convert PDF to images');
        }
        
        console.log(`✅ PDF converted: ${conversionResult.images.length} pages rendered`);
        
        requestBody.pageImages = conversionResult.images.map(img => ({
          pageNumber: img.pageNumber,
          base64: img.base64,
          width: img.width,
          height: img.height,
        }));
        
        toast({
          title: "Analyzing Document",
          description: `Sending ${conversionResult.images.length} page(s) to GPT-4o Vision for analysis...`,
        });
        
      } else if (isImageFile(pdfFile)) {
        console.log('🖼️ Processing image file...');
        
        const base64 = await imageFileToBase64(pdfFile);
        requestBody.singleImage = base64;
        requestBody.imageMimeType = pdfFile.type || 'image/png';
        
        toast({
          title: "Analyzing Image",
          description: "Sending image to GPT-4o Vision for analysis...",
        });
        
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or image file.');
      }

      const { data, error } = await supabase.functions.invoke('parse-property-pdf', {
        body: requestBody
      });

      setConversionProgress(null);

      if (error) {
        throw new Error(error.message || 'Failed to parse document');
      }

      if (!data.success) {
        throw new Error(data.error || 'Document parsing failed');
      }

      console.log('✅ Document parsed successfully:', data);
      const extracted = data.extractedData || {};
      
      // Build property address
      let propertyAddress = extracted.extractedAddress;
      if (!propertyAddress && extracted.extractedSuburb) {
        propertyAddress = `${extracted.extractedSuburb}${extracted.extractedState ? ', ' + extracted.extractedState : ''}${extracted.extractedPostcode ? ' ' + extracted.extractedPostcode : ''}`;
      }
      if (!propertyAddress) {
        propertyAddress = `Property from ${pdfFile.name}`;
      }

      // Store parsed data for later generation
      setPdfParsedData({
        propertyAddress,
        pdfContent: data.pdfContent,
      });

      // Populate form fields with extracted data (without triggering sync loops)
      isSyncingFromPreGen.current = true;
      
      if (extracted.extractedPrice) {
        setPropertyPrice(extracted.extractedPrice.toString());
      }
      if (extracted.extractedBedrooms) {
        setBeds(extracted.extractedBedrooms.toString());
      }
      if (extracted.extractedBathrooms) {
        setBaths(extracted.extractedBathrooms.toString());
      }
      if (extracted.extractedCarSpaces) {
        setCarSpaces(extracted.extractedCarSpaces.toString());
      }
      if (extracted.extractedLandSize) {
        setLandSize(extracted.extractedLandSize.toString());
      }
      if (extracted.extractedBuildSize) {
        setBuildSize(extracted.extractedBuildSize.toString());
      }
      if (extracted.extractedPropertyType) {
        const pType = extracted.extractedPropertyType.toLowerCase();
        if (pType === 'house' || pType === 'apartment' || pType === 'townhouse') {
          setPropertyType(pType);
        }
      }
      if (extracted.extractedWeeklyRent) {
        setWeeklyRent(extracted.extractedWeeklyRent.toString());
      }

      // If new build detected, update build type
      if (extracted.extractedIsNewBuild) {
        setPreGenData(prev => ({ ...prev, buildType: 'new_build' }));
      }

      // Update preGenData with extracted values
      setPreGenData(prev => ({
        ...prev,
        purchasePrice: extracted.extractedPrice || prev.purchasePrice,
        weeklyRent: extracted.extractedWeeklyRent || prev.weeklyRent,
        carSpaces: extracted.extractedCarSpaces || prev.carSpaces,
        landSizeSqm: extracted.extractedLandSize || prev.landSizeSqm,
        buildSizeSqm: extracted.extractedBuildSize || prev.buildSizeSqm,
        landPrice: extracted.extractedLandPrice || prev.landPrice,
        buildPrice: extracted.extractedBuildPrice || prev.buildPrice,
      }));

      requestAnimationFrame(() => { isSyncingFromPreGen.current = false; });

      // Show what was extracted
      const extractedInfo = [];
      if (extracted.extractedPrice) extractedInfo.push(`$${extracted.extractedPrice.toLocaleString()}`);
      if (extracted.extractedBedrooms) extractedInfo.push(`${extracted.extractedBedrooms} beds`);
      if (extracted.extractedBathrooms) extractedInfo.push(`${extracted.extractedBathrooms} baths`);
      if (extracted.extractedLandSize) extractedInfo.push(`${extracted.extractedLandSize}m² land`);
      if (extracted.extractedIsNewBuild) extractedInfo.push('New Build');
      
      const extractedSummary = extractedInfo.length > 0 
        ? `Found: ${extractedInfo.join(', ')}` 
        : 'Limited details extracted - review and add missing data';

      toast({
        title: "PDF Parsed Successfully",
        description: extractedSummary + ". Review the fields below, add any overrides, then generate the report.",
      });

    } catch (error) {
      console.error('Error processing document:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process document';
      setPdfError(errorMessage);
      toast({
        title: "Document Processing Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
      setConversionProgress(null);
    }
  };

  // Handle report generation from parsed PDF data
  const handleGenerateFromPdf = async () => {
    if (!pdfParsedData) {
      toast({
        title: "Parse Required",
        description: "Please parse a PDF first before generating a report.",
        variant: "destructive",
      });
      return;
    }

    if (!propertyPrice || parseFloat(propertyPrice) <= 0) {
      toast({
        title: "Purchase Price Required",
        description: "Please enter a valid purchase price to calculate investment score.",
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

    setIsPdfGenerating(true);

    try {
      const { propertyAddress, pdfContent } = pdfParsedData;

      // Build property details with form values and preGenData
      const propertyDetails: any = { 
        queryType: 'address', 
        originalQuery: propertyAddress,
        pdfContent,
        fromPdfUpload: true,
        manualOverrides: preGenData,
      };
      
      // Add form field values
      if (propertyPrice) propertyDetails.price = parseFloat(propertyPrice);
      if (weeklyRent) propertyDetails.weeklyRent = parseFloat(weeklyRent);
      if (propertyType) propertyDetails.propertyType = propertyType;
      if (beds) propertyDetails.beds = parseInt(beds);
      if (baths) propertyDetails.baths = parseInt(baths);
      if (carSpaces) propertyDetails.carSpaces = parseInt(carSpaces);
      if (landSize) propertyDetails.landSizeSqm = parseFloat(landSize);
      if (buildSize) propertyDetails.buildSizeSqm = parseFloat(buildSize);

      // Apply all preGenData overrides
      propertyDetails.buildType = preGenData.buildType;
      if (preGenData.purchasePrice) propertyDetails.price = preGenData.purchasePrice;
      if (preGenData.weeklyRent) propertyDetails.weeklyRent = preGenData.weeklyRent;
      if (preGenData.carSpaces) propertyDetails.carSpaces = preGenData.carSpaces;
      if (preGenData.landSizeSqm) propertyDetails.landSizeSqm = preGenData.landSizeSqm;
      if (preGenData.buildSizeSqm) propertyDetails.buildSizeSqm = preGenData.buildSizeSqm;
      
      if (preGenData.buildType === 'new_build') {
        if (preGenData.landPrice) propertyDetails.landPrice = preGenData.landPrice;
        if (preGenData.buildPrice) propertyDetails.buildPrice = preGenData.buildPrice;
        if (preGenData.agentFee) propertyDetails.agentFee = preGenData.agentFee;
      } else {
        if (preGenData.depositValue) propertyDetails.depositValue = preGenData.depositValue;
      }
      
      if (preGenData.loanToValueRatio) propertyDetails.loanToValueRatio = preGenData.loanToValueRatio;
      if (preGenData.interestRate) propertyDetails.interestRate = preGenData.interestRate;
      if (preGenData.capitalGrowth) propertyDetails.capitalGrowth = preGenData.capitalGrowth;
      if (preGenData.stampDuty) propertyDetails.stampDuty = preGenData.stampDuty;
      if (preGenData.bodyCorporateFees) propertyDetails.bodyCorporateFees = preGenData.bodyCorporateFees;
      if (preGenData.landTax) propertyDetails.landTax = preGenData.landTax;
      if (preGenData.councilRates) propertyDetails.councilRates = preGenData.councilRates;
      if (preGenData.waterRates) propertyDetails.waterRates = preGenData.waterRates;
      if (preGenData.solicitorFees) propertyDetails.solicitorFees = preGenData.solicitorFees;
      if (preGenData.buildingLandlordInsurance) propertyDetails.buildingLandlordInsurance = preGenData.buildingLandlordInsurance;
      if (preGenData.propertyManagementFees) propertyDetails.propertyManagementFees = preGenData.propertyManagementFees;
      if (preGenData.repairsMaintenance) propertyDetails.repairsMaintenance = preGenData.repairsMaintenance;
      if (preGenData.lettingFees) propertyDetails.lettingFees = preGenData.lettingFees;
      if (preGenData.strataAdminFund) propertyDetails.strataAdminFund = preGenData.strataAdminFund;
      if (preGenData.strataSinkingFund) propertyDetails.strataSinkingFund = preGenData.strataSinkingFund;
      if (preGenData.strataSpecialLevies) propertyDetails.strataSpecialLevies = preGenData.strataSpecialLevies;
      if (preGenData.cpiGrowthRate) propertyDetails.cpiGrowthRate = preGenData.cpiGrowthRate;
      if (preGenData.depreciation) propertyDetails.depreciation = preGenData.depreciation;
      if (preGenData.taxRate) propertyDetails.taxRate = preGenData.taxRate;
      if (preGenData.occupancyRate) propertyDetails.occupancyRate = preGenData.occupancyRate;
      if (preGenData.loanType) propertyDetails.loanType = preGenData.loanType;
      if (preGenData.loanTermYears) propertyDetails.loanTermYears = preGenData.loanTermYears;
      if (preGenData.marketValueNow) propertyDetails.marketValueNow = preGenData.marketValueNow;
      if (preGenData.loanAmount) propertyDetails.loanAmount = preGenData.loanAmount;
      if (preGenData.interestOnlyPeriodYears) propertyDetails.interestOnlyPeriodYears = preGenData.interestOnlyPeriodYears;
      if (preGenData.repaymentFrequency) propertyDetails.repaymentFrequency = preGenData.repaymentFrequency;
      if (preGenData.extraRepaymentPerMonth) propertyDetails.extraRepaymentPerMonth = preGenData.extraRepaymentPerMonth;
      if (preGenData.offsetBalance) propertyDetails.offsetBalance = preGenData.offsetBalance;
      if (preGenData.constructionDurationMonths) propertyDetails.constructionDurationMonths = preGenData.constructionDurationMonths;
      if (preGenData.constructionYear) propertyDetails.constructionYear = preGenData.constructionYear;
      if (preGenData.isFirstHomeBuyer) propertyDetails.isFirstHomeBuyer = preGenData.isFirstHomeBuyer;
      
      if (preGenData.buildType === 'new_build') {
        if (preGenData.stageDepositPercent) propertyDetails.stageDepositPercent = preGenData.stageDepositPercent;
        if (preGenData.stageSlabPercent) propertyDetails.stageSlabPercent = preGenData.stageSlabPercent;
        if (preGenData.stageFramePercent) propertyDetails.stageFramePercent = preGenData.stageFramePercent;
        if (preGenData.stageLockupPercent) propertyDetails.stageLockupPercent = preGenData.stageLockupPercent;
        if (preGenData.stageFixingPercent) propertyDetails.stageFixingPercent = preGenData.stageFixingPercent;
        if (preGenData.stageCompletionPercent) propertyDetails.stageCompletionPercent = preGenData.stageCompletionPercent;
      }
      
      if (preGenData.depreciationSchedule) propertyDetails.depreciationSchedule = preGenData.depreciationSchedule;
      if (preGenData.depreciationMethod) propertyDetails.depreciationMethod = preGenData.depreciationMethod;

      // Create the report record
      const pdfOverrides = Object.fromEntries(
        Object.entries(preGenData).filter(([_, v]) => v !== undefined)
      ) as Json;
      
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          report_content: 'Generating report from PDF...',
          status: 'pending',
          report_scope: 'address',
          generated_by: null,
          manual_overrides: pdfOverrides,
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

      // Start generation in background
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
      
      // Clear form
      setPdfFile(null);
      setPdfParsedData(null);

    } catch (error) {
      console.error('Error generating report from PDF:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Failed to generate report',
        variant: "destructive",
      });
    } finally {
      setIsPdfGenerating(false);
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
                  {/* Build Type Radio Selection */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Build Type</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="buildType"
                          value="existing_property"
                          checked={preGenData.buildType === 'existing_property'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'existing_property' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isGenerating}
                        />
                        <span className="text-sm">Existing Property</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="buildType"
                          value="new_build"
                          checked={preGenData.buildType === 'new_build'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'new_build' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isGenerating}
                        />
                        <span className="text-sm">New Build</span>
                      </label>
                    </div>
                  </div>

                  <Separator />
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
                  Purchase price is required for investment scoring. Other details are optional but enhance analysis accuracy.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="propertyPrice" className="flex items-center gap-1">
                      Purchase Price ($) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="propertyPrice"
                      type="text"
                      inputMode="numeric"
                      value={formatNumberWithCommas(propertyPrice)}
                      onChange={(e) => handlePropertyPriceChange(e.target.value)}
                      placeholder="e.g., 750,000"
                      disabled={isGenerating}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="weeklyRent">Weekly Rent ($)</Label>
                    <Input
                      id="weeklyRent"
                      type="text"
                      inputMode="numeric"
                      value={formatNumberWithCommas(weeklyRent)}
                      onChange={(e) => handleWeeklyRentChange(e.target.value)}
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
                    <Label htmlFor="carSpaces" className="flex items-center gap-1">
                      <Car className="h-4 w-4" />
                      Car Spaces
                    </Label>
                    <Input
                      id="carSpaces"
                      type="number"
                      min="0"
                      value={carSpaces}
                      onChange={(e) => handleCarSpacesChange(e.target.value)}
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

              <Separator />

              {/* Pre-Generation Manual Inputs */}
              <PreGenerationOverrides
                propertyAddress={query}
                onDataChange={handlePreGenDataChange}
                disabled={isGenerating}
                buildType={preGenData.buildType}
                onBuildTypeChange={(bt) => setPreGenData(prev => ({ ...prev, buildType: bt }))}
                externalPurchasePrice={propertyPrice ? parseFloat(propertyPrice) : undefined}
                externalWeeklyRent={weeklyRent ? parseFloat(weeklyRent) : undefined}
                externalCarSpaces={carSpaces ? parseInt(carSpaces) : undefined}
              />

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
                  {/* Build Type Radio Selection */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Build Type</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="urlBuildType"
                          value="existing_property"
                          checked={preGenData.buildType === 'existing_property'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'existing_property' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isScraping}
                        />
                        <span className="text-sm">Existing Property</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="urlBuildType"
                          value="new_build"
                          checked={preGenData.buildType === 'new_build'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'new_build' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isScraping}
                        />
                        <span className="text-sm">New Build</span>
                      </label>
                    </div>
                  </div>

                  <Separator />

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

                  <Separator />

                  {/* Property Details - Required for URL Scrape */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Property Details</Label>
                      <Badge variant="default" className="text-xs">Required for Scoring</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Purchase price is required for investment scoring. Other details are optional but will override scraped values.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="urlPropertyPrice" className="flex items-center gap-1">
                          Purchase Price ($) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="urlPropertyPrice"
                          type="text"
                          inputMode="numeric"
                          value={formatNumberWithCommas(propertyPrice)}
                          onChange={(e) => handlePropertyPriceChange(e.target.value)}
                          placeholder="e.g., 750,000"
                          disabled={isScraping}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlWeeklyRent">Weekly Rent ($)</Label>
                        <Input
                          id="urlWeeklyRent"
                          type="text"
                          inputMode="numeric"
                          value={formatNumberWithCommas(weeklyRent)}
                          onChange={(e) => handleWeeklyRentChange(e.target.value)}
                          placeholder="e.g., 550"
                          disabled={isScraping}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlPropertyType">Property Type</Label>
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
                        <Label htmlFor="urlBeds">Bedrooms</Label>
                        <Input
                          id="urlBeds"
                          type="number"
                          value={beds}
                          onChange={(e) => setBeds(e.target.value)}
                          placeholder="e.g., 3"
                          disabled={isScraping}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlBaths">Bathrooms</Label>
                        <Input
                          id="urlBaths"
                          type="number"
                          value={baths}
                          onChange={(e) => setBaths(e.target.value)}
                          placeholder="e.g., 2"
                          disabled={isScraping}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlCarSpaces" className="flex items-center gap-1">
                          <Car className="h-4 w-4" />
                          Car Spaces
                        </Label>
                        <Input
                          id="urlCarSpaces"
                          type="number"
                          min="0"
                          value={carSpaces}
                          onChange={(e) => handleCarSpacesChange(e.target.value)}
                          placeholder="e.g., 2"
                          disabled={isScraping}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlLandSize">Land Size (m²)</Label>
                        <Input
                          id="urlLandSize"
                          type="number"
                          value={landSize}
                          onChange={(e) => setLandSize(e.target.value)}
                          placeholder="e.g., 450"
                          disabled={isScraping}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="urlBuildSize">Build Size (m²)</Label>
                        <Input
                          id="urlBuildSize"
                          type="number"
                          value={buildSize}
                          onChange={(e) => setBuildSize(e.target.value)}
                          placeholder="e.g., 180"
                          disabled={isScraping}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Pre-Generation Overrides for URL mode */}
                  <PreGenerationOverrides
                    propertyAddress={propertyUrl}
                    onDataChange={handlePreGenDataChange}
                    disabled={isScraping}
                    buildType={preGenData.buildType}
                    onBuildTypeChange={(bt) => setPreGenData(prev => ({ ...prev, buildType: bt }))}
                    externalPurchasePrice={propertyPrice ? parseFloat(propertyPrice) : undefined}
                    externalWeeklyRent={weeklyRent ? parseFloat(weeklyRent) : undefined}
                    externalCarSpaces={carSpaces ? parseInt(carSpaces) : undefined}
                  />

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
                          The scraper will extract property details and automatically generate a comprehensive investment report. Override values above will be used if provided.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scrape Button */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleScrapeUrlOnly}
                      disabled={isScraping || !propertyUrl.trim()}
                      size="lg"
                      variant={urlScrapedData ? "outline" : "default"}
                      className="flex-1"
                    >
                      {isScraping ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Scraping...
                        </>
                      ) : urlScrapedData ? (
                        <>
                          <Link className="h-4 w-4 mr-2" />
                          Re-Scrape URL
                        </>
                      ) : (
                        <>
                          <Link className="h-4 w-4 mr-2" />
                          Scrape URL
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleGenerateFromUrl}
                      disabled={isUrlGenerating || !urlScrapedData || !propertyPrice || parseFloat(propertyPrice) <= 0}
                      size="lg"
                      className="flex-1"
                    >
                      {isUrlGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Generate Report
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Scraped data indicator */}
                  {urlScrapedData && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      <p className="text-sm text-green-700 dark:text-green-400">
                        ✓ Scraped: <strong>{urlScrapedData.propertyAddress}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Review the fields above, add any overrides, then click "Generate Report"
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* PDF Upload Tab */}
                <TabsContent value="pdf" className="space-y-6 pt-4">
                  {/* Build Type Radio Selection */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Build Type</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="pdfBuildType"
                          value="existing_property"
                          checked={preGenData.buildType === 'existing_property'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'existing_property' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isParsing}
                        />
                        <span className="text-sm">Existing Property</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="pdfBuildType"
                          value="new_build"
                          checked={preGenData.buildType === 'new_build'}
                          onChange={() => setPreGenData(prev => ({ ...prev, buildType: 'new_build' }))}
                          className="h-4 w-4 text-primary"
                          disabled={isParsing}
                        />
                        <span className="text-sm">New Build</span>
                      </label>
                    </div>
                  </div>

                  <Separator />

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
                            Drag and drop a PDF or image file here, or click to browse
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Supports property PDFs, brochures, and images (PNG, JPG)
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    {/* Conversion Progress */}
                    {conversionProgress && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Image className="h-4 w-4" />
                            Rendering page {conversionProgress.current} of {conversionProgress.total}...
                          </span>
                          <span className="font-medium">{Math.round((conversionProgress.current / conversionProgress.total) * 100)}%</span>
                        </div>
                        <Progress value={(conversionProgress.current / conversionProgress.total) * 100} />
                      </div>
                    )}
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

                  <Separator />

                  {/* Property Details - Required for PDF mode */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Property Details</Label>
                      <Badge variant="default" className="text-xs">Required for Scoring</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Purchase price is required for investment scoring. Other details are optional but will override extracted values.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pdfPropertyPrice" className="flex items-center gap-1">
                          Purchase Price ($) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="pdfPropertyPrice"
                          type="text"
                          inputMode="numeric"
                          value={formatNumberWithCommas(propertyPrice)}
                          onChange={(e) => handlePropertyPriceChange(e.target.value)}
                          placeholder="e.g., 750,000"
                          disabled={isParsing}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfWeeklyRent">Weekly Rent ($)</Label>
                        <Input
                          id="pdfWeeklyRent"
                          type="text"
                          inputMode="numeric"
                          value={formatNumberWithCommas(weeklyRent)}
                          onChange={(e) => handleWeeklyRentChange(e.target.value)}
                          placeholder="e.g., 550"
                          disabled={isParsing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfPropertyType">Property Type</Label>
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
                        <Label htmlFor="pdfBeds">Bedrooms</Label>
                        <Input
                          id="pdfBeds"
                          type="number"
                          value={beds}
                          onChange={(e) => setBeds(e.target.value)}
                          placeholder="e.g., 3"
                          disabled={isParsing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfBaths">Bathrooms</Label>
                        <Input
                          id="pdfBaths"
                          type="number"
                          value={baths}
                          onChange={(e) => setBaths(e.target.value)}
                          placeholder="e.g., 2"
                          disabled={isParsing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfCarSpaces" className="flex items-center gap-1">
                          <Car className="h-4 w-4" />
                          Car Spaces
                        </Label>
                        <Input
                          id="pdfCarSpaces"
                          type="number"
                          min="0"
                          value={carSpaces}
                          onChange={(e) => handleCarSpacesChange(e.target.value)}
                          placeholder="e.g., 2"
                          disabled={isParsing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfLandSize">Land Size (m²)</Label>
                        <Input
                          id="pdfLandSize"
                          type="number"
                          value={landSize}
                          onChange={(e) => setLandSize(e.target.value)}
                          placeholder="e.g., 450"
                          disabled={isParsing}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pdfBuildSize">Build Size (m²)</Label>
                        <Input
                          id="pdfBuildSize"
                          type="number"
                          value={buildSize}
                          onChange={(e) => setBuildSize(e.target.value)}
                          placeholder="e.g., 180"
                          disabled={isParsing}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Pre-Generation Overrides for PDF mode */}
                  <PreGenerationOverrides
                    propertyAddress={pdfFile?.name || ''}
                    onDataChange={handlePreGenDataChange}
                    disabled={isParsing}
                    buildType={preGenData.buildType}
                    onBuildTypeChange={(bt) => setPreGenData(prev => ({ ...prev, buildType: bt }))}
                    externalPurchasePrice={propertyPrice ? parseFloat(propertyPrice) : undefined}
                    externalWeeklyRent={weeklyRent ? parseFloat(weeklyRent) : undefined}
                    externalCarSpaces={carSpaces ? parseInt(carSpaces) : undefined}
                  />

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
                          AI will extract property details (address, price, size, etc.) and generate a comprehensive investment report. Override values above will be used if provided.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Parse & Generate Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={handleParsePdfOnly}
                      disabled={isParsing || !pdfFile}
                      size="lg"
                      variant={pdfParsedData ? "outline" : "default"}
                      className="flex-1"
                    >
                      {isParsing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Parsing...
                        </>
                      ) : pdfParsedData ? (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Re-Parse PDF
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Parse PDF
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleGenerateFromPdf}
                      disabled={isPdfGenerating || !pdfParsedData || !propertyPrice || parseFloat(propertyPrice) <= 0}
                      size="lg"
                      className="flex-1"
                    >
                      {isPdfGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Generate Report
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Parsed data indicator */}
                  {pdfParsedData && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      <p className="text-sm text-green-700 dark:text-green-400">
                        ✓ Parsed: <strong>{pdfParsedData.propertyAddress}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Review the fields above, add any overrides, then click "Generate Report"
                      </p>
                    </div>
                  )}
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