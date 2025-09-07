import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PropertyListing } from '@/lib/airtable';
import { propertyDataService } from '@/services/propertyDataService';
import { chartDataService } from '@/services/chartDataService';
import { KPICard } from '@/components/dashboard/KPICard';
import { ReportConfigModal } from '@/components/reports/ReportConfigModal';
import { useReportGenerator } from '@/hooks/useReportGenerator';
import { AdvancedAnalytics } from '@/components/reports/AdvancedAnalytics';
import { TemporalAnalysis } from '@/components/reports/TemporalAnalysis';
import { GeographicAnalysis } from '@/components/reports/GeographicAnalysis';
import { AgentPerformance } from '@/components/reports/AgentPerformance';
import { ExecutiveInsights } from '@/components/reports/ExecutiveInsights';
import { DataQualityAnalysis } from '@/components/reports/DataQualityAnalysis';
import { Building2, MapPin, DollarSign, Calendar, TrendingUp, Users, Globe, BarChart3, Lightbulb } from 'lucide-react';

const COLORS = [
  'hsl(var(--chart-1))', 
  'hsl(var(--chart-2))', 
  'hsl(var(--chart-3))', 
  'hsl(var(--chart-4))', 
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))', 
  'hsl(var(--chart-7))', 
  'hsl(var(--chart-8))', 
  'hsl(var(--chart-9))', 
  'hsl(var(--chart-10))'
];

export default function Reports() {
  const [allListings, setAllListings] = useState<PropertyListing[]>([]);
  const { generateReport, isGenerating, progress, currentStep } = useReportGenerator();
  
  // Chart refs for PDF generation
  const kpisRef = useRef<HTMLDivElement>(null);
  const advancedAnalyticsRef = useRef<HTMLDivElement>(null);
  const temporalAnalysisRef = useRef<HTMLDivElement>(null);
  const suburbChartRef = useRef<HTMLDivElement>(null);
  const propertyTypeChartRef = useRef<HTMLDivElement>(null);
  const priceRangeChartRef = useRef<HTMLDivElement>(null);
  const bedroomChartRef = useRef<HTMLDivElement>(null);
  const geographicAnalysisRef = useRef<HTMLDivElement>(null);
  const agentPerformanceRef = useRef<HTMLDivElement>(null);
  const executiveInsightsRef = useRef<HTMLDivElement>(null);

  const { data: listings, isLoading } = useQuery({
    queryKey: ['all-listings'],
    queryFn: async () => {
      // Use unified data service for consistent data fetching
      const result = await propertyDataService.fetchAllListings({
        includeDebugInfo: true
      });
      
      console.log('Reports data fetch:', result.debugInfo);
      console.log('Reports listings count:', result.listings.length);
      return result.listings;
    },
  });

  useEffect(() => {
    if (listings) {
      setAllListings(listings);
    }
  }, [listings]);

  // Calculate metrics
  const totalListings = allListings.length;
  const avgPrice = allListings.length > 0 
    ? Math.round(allListings.reduce((sum, listing) => sum + (listing.price || 0), 0) / allListings.length)
    : 0;

  // Use unified chart data service for consistent suburb data
  const suburbChartData = chartDataService.generateSuburbData(allListings, 10).data
    .map(item => ({ suburb: item.label, count: item.value }));

  // Use unified chart data service for consistent property type data
  const propertyTypeChartData = chartDataService.generatePropertyTypeData(allListings).data
    .map(item => ({ type: item.label, count: item.value }));

  // Use unified chart data service for consistent price range data
  const priceRangeChartData = chartDataService.generatePriceRangeData(allListings).data
    .map(item => ({ range: item.label, count: item.value }));

  // Use unified chart data service for consistent bedroom data
  const bedroomChartData = chartDataService.generateBedroomData(allListings).data
    .map(item => ({ beds: item.label, count: item.value }));

  // Recent listings (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentListings = allListings.filter(listing => {
    const receivedAt = listing.receivedAt;
    return receivedAt && new Date(receivedAt) >= thirtyDaysAgo;
  }).length;

  const chartConfig = {
    count: {
      label: "Count",
      color: "hsl(var(--chart-1))",
    },
    listings: {
      label: "Listings", 
      color: "hsl(var(--chart-2))",
    },
    price: {
      label: "Price",
      color: "hsl(var(--chart-3))",
    },
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground">Quantitative analysis of your property listings</p>
          </div>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading reporting data...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleGenerateReport = async (config: any) => {
    await generateReport(config, allListings, {
      kpis: kpisRef.current,
      advancedAnalytics: advancedAnalyticsRef.current,
      temporalAnalysis: temporalAnalysisRef.current,
      suburbChart: suburbChartRef.current,
      propertyTypeChart: propertyTypeChartRef.current,
      priceRangeChart: priceRangeChartRef.current,
      bedroomChart: bedroomChartRef.current,
      geographicAnalysis: geographicAnalysisRef.current,
      agentPerformance: agentPerformanceRef.current,
      executiveInsights: executiveInsightsRef.current,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Quantitative analysis of your property listings</p>
        </div>
        <ReportConfigModal 
          onGenerateReport={handleGenerateReport}
          isGenerating={isGenerating}
          progress={progress}
          currentStep={currentStep}
        />
      </div>

      {/* KPIs */}
      <div ref={kpisRef} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Listings"
          value={totalListings.toLocaleString()}
          icon={<Building2 className="h-4 w-4" />}
          description="All property listings"
        />
        <KPICard
          title="Average Price"
          value={`$${avgPrice.toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
          description="Across all listings"
        />
        <KPICard
          title="Recent Listings"
          value={recentListings.toLocaleString()}
          icon={<Calendar className="h-4 w-4" />}
          description="Last 30 days"
        />
        <KPICard
          title="Unique Suburbs"
          value={suburbChartData.length.toLocaleString()}
          icon={<MapPin className="h-4 w-4" />}
          description="Coverage areas"
        />
      </div>

      {/* Advanced Analytics */}
      <div ref={advancedAnalyticsRef}>
        <AdvancedAnalytics listings={allListings} />
      </div>

      {/* Executive Insights */}
      <div ref={executiveInsightsRef}>
        <ExecutiveInsights listings={allListings} />
      </div>

      {/* Charts and Analysis */}
      <Tabs defaultValue="temporal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="temporal" className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="geographic" className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            Geographic
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="data-quality" className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="suburbs" className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Suburbs
          </TabsTrigger>
          <TabsTrigger value="property-type" className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            Types
          </TabsTrigger>
          <TabsTrigger value="price-range" className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Pricing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="temporal" className="space-y-4">
          <div ref={temporalAnalysisRef}>
            <TemporalAnalysis listings={allListings} />
          </div>
        </TabsContent>

        <TabsContent value="geographic" className="space-y-4">
          <div ref={geographicAnalysisRef}>
            <GeographicAnalysis listings={allListings} />
          </div>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <div ref={agentPerformanceRef}>
            <AgentPerformance listings={allListings} />
          </div>
        </TabsContent>

        <TabsContent value="data-quality" className="space-y-4">
          <DataQualityAnalysis listings={allListings} />
        </TabsContent>

        <TabsContent value="suburbs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Listings by Suburb</CardTitle>
              <CardDescription>Top 10 suburbs by listing count</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer ref={suburbChartRef} config={chartConfig} className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={suburbChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="suburb" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--chart-1))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="property-type" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Property Type Distribution</CardTitle>
              <CardDescription>Breakdown by property category</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer ref={propertyTypeChartRef} config={chartConfig} className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={propertyTypeChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ type, percent }) => `${type}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {propertyTypeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="price-range" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Price Range Distribution</CardTitle>
              <CardDescription>Listings grouped by price brackets</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer ref={priceRangeChartRef} config={chartConfig} className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priceRangeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bedroom Distribution</CardTitle>
              <CardDescription>Listings by number of bedrooms</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer ref={bedroomChartRef} config={chartConfig} className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bedroomChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="beds" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--chart-4))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}