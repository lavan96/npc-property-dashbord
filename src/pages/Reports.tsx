import { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PropertyListing } from '@/lib/airtable';
import { propertyDataService } from '@/services/propertyDataService';
import { chartDataService } from '@/services/chartDataService';
import { KPICard } from '@/components/dashboard/KPICard';
import { ReportConfigModal } from '@/components/reports/ReportConfigModal';
import { useReportGenerator } from '@/hooks/useReportGenerator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Building2, MapPin, DollarSign, Calendar, TrendingUp, Users, Globe, BarChart3, Lightbulb } from 'lucide-react';

// Lazy load heavy analytics components
const AdvancedAnalytics = lazy(() => import('@/components/reports/AdvancedAnalytics').then(m => ({ default: m.AdvancedAnalytics })));
const TemporalAnalysis = lazy(() => import('@/components/reports/TemporalAnalysis').then(m => ({ default: m.TemporalAnalysis })));
const GeographicAnalysis = lazy(() => import('@/components/reports/GeographicAnalysis').then(m => ({ default: m.GeographicAnalysis })));
const AgentPerformance = lazy(() => import('@/components/reports/AgentPerformance').then(m => ({ default: m.AgentPerformance })));
const ExecutiveInsights = lazy(() => import('@/components/reports/ExecutiveInsights').then(m => ({ default: m.ExecutiveInsights })));
const DataQualityAnalysis = lazy(() => import('@/components/reports/DataQualityAnalysis').then(m => ({ default: m.DataQualityAnalysis })));
const InvestmentReportGenerator = lazy(() => import('@/components/reports/InvestmentReportGenerator').then(m => ({ default: m.InvestmentReportGenerator })));

// Loading fallback component
const ComponentLoader = () => (
  <Card className="ci-card-premium">
    <CardContent className="p-6">
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    </CardContent>
  </Card>
);

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
  const { canEdit: canEditReports } = useModulePermissions('reports');
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
    <div className="ci-foundation ci-page-shell reports-page-premium">
      <Tabs defaultValue="quantitative" className="w-full space-y-6">
        <Card className="ci-suite-header overflow-hidden reports-top-command">
          <CardContent className="relative z-10 space-y-5 p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="ci-header-icon reports-header-icon"><BarChart3 className="h-6 w-6" /></span>
                <div>
                  <p className="ci-tab-eyebrow">NPC reporting command centre</p>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Reports</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">Generate property analysis and investment reports</p>
                </div>
              </div>
              <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                Quantitative insights · Investment analysis
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/55 p-1.5 shadow-inner shadow-black/10 backdrop-blur">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0">
                <TabsTrigger value="quantitative" className="reports-primary-tab">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden xs:inline">Quantitative</span>
                  <span className="xs:hidden">Quant</span>
                </TabsTrigger>
                <TabsTrigger value="investment" className="reports-primary-tab">
                  <TrendingUp className="h-4 w-4" />
                  <span>Investment</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="quantitative" className="space-y-5 md:space-y-7 mt-0">
          <Card className="ci-card-premium">
            <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
            <div>
              <p className="ci-tab-eyebrow">Quantitative intelligence</p>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">Quantitative Analysis</h2>
              <p className="text-sm text-muted-foreground">Statistical analysis of your property listings</p>
            </div>
            <ReportConfigModal 
              onGenerateReport={handleGenerateReport}
              isGenerating={isGenerating}
              progress={progress}
              currentStep={currentStep}
            />
          </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div ref={kpisRef} className="grid gap-4 grid-cols-2 lg:grid-cols-4 reports-kpi-grid">
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
            <Suspense fallback={<ComponentLoader />}>
              <AdvancedAnalytics listings={allListings} />
            </Suspense>
          </div>

          {/* Executive Insights */}
          <div ref={executiveInsightsRef}>
            <Suspense fallback={<ComponentLoader />}>
              <ExecutiveInsights listings={allListings} />
            </Suspense>
          </div>

          {/* Charts and Analysis */}
          <Tabs defaultValue="temporal" className="ci-card-premium p-3 md:p-4 space-y-4">
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-7 h-auto bg-background/60 border border-border/70 rounded-2xl p-1">
                <TabsTrigger value="temporal" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Trends
                </TabsTrigger>
                <TabsTrigger value="geographic" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Globe className="h-3 w-3" />
                  Geographic
                </TabsTrigger>
                <TabsTrigger value="agents" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Users className="h-3 w-3" />
                  Agents
                </TabsTrigger>
                <TabsTrigger value="data-quality" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <BarChart3 className="h-3 w-3" />
                  Quality
                </TabsTrigger>
                <TabsTrigger value="suburbs" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <MapPin className="h-3 w-3" />
                  Suburbs
                </TabsTrigger>
                <TabsTrigger value="property-type" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Building2 className="h-3 w-3" />
                  Types
                </TabsTrigger>
                <TabsTrigger value="price-range" className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <DollarSign className="h-3 w-3" />
                  Pricing
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="temporal" className="space-y-4">
              <div ref={temporalAnalysisRef}>
                <Suspense fallback={<ComponentLoader />}>
                  <TemporalAnalysis listings={allListings} />
                </Suspense>
              </div>
            </TabsContent>

            <TabsContent value="geographic" className="space-y-4">
              <div ref={geographicAnalysisRef}>
                <Suspense fallback={<ComponentLoader />}>
                  <GeographicAnalysis listings={allListings} />
                </Suspense>
              </div>
            </TabsContent>

            <TabsContent value="agents" className="space-y-4">
              <div ref={agentPerformanceRef}>
                <Suspense fallback={<ComponentLoader />}>
                  <AgentPerformance listings={allListings} />
                </Suspense>
              </div>
            </TabsContent>

            <TabsContent value="data-quality" className="space-y-4">
              <Suspense fallback={<ComponentLoader />}>
                <DataQualityAnalysis listings={allListings} />
              </Suspense>
            </TabsContent>

            <TabsContent value="suburbs" className="space-y-4">
              <Card className="ci-card">
                <CardHeader>
                  <CardTitle>Listings by Suburb</CardTitle>
                  <CardDescription>Top 10 suburbs by listing volume — higher bars indicate stronger market activity in that area</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer ref={suburbChartRef} config={chartConfig} className="h-[280px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={suburbChartData} margin={{ bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis 
                          dataKey="suburb" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          fontSize={11}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <ChartTooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            const pct = totalListings > 0 ? ((data.count / totalListings) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-popover/95 border border-primary/25 rounded-xl p-3 shadow-xl shadow-black/20 backdrop-blur">
                                <p className="font-semibold text-sm text-foreground">{data.suburb}</p>
                                <p className="text-xs text-muted-foreground mt-1">{data.count} listings ({pct}% of total)</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Sub-metrics */}
                  {suburbChartData.length >= 2 && (() => {
                    const top = suburbChartData[0];
                    const second = suburbChartData[1];
                    const topPct = totalListings > 0 ? ((top.count / totalListings) * 100).toFixed(0) : '0';
                    const ratio = second.count > 0 ? (top.count / second.count).toFixed(1) : '—';
                    return (
                      <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                        <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
                        <p className="text-xs text-foreground">
                          <span className="font-semibold">{top.suburb}</span> leads with {topPct}% of all listings ({top.count}), {ratio}× the volume of the next suburb ({second.suburb} at {second.count}).
                          {suburbChartData.length >= 3 && ` The top 3 suburbs account for ${totalListings > 0 ? (((suburbChartData[0].count + suburbChartData[1].count + suburbChartData[2].count) / totalListings) * 100).toFixed(0) : 0}% of total activity.`}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{suburbChartData.length}</p>
                      <p className="text-[11px] text-muted-foreground">Suburbs Tracked</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{suburbChartData[0]?.suburb || '—'}</p>
                      <p className="text-[11px] text-muted-foreground">Top Suburb</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {suburbChartData.length > 0 ? Math.round(suburbChartData.reduce((s, d) => s + d.count, 0) / suburbChartData.length) : 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Avg per Suburb</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="property-type" className="space-y-4">
              <Card className="ci-card">
                <CardHeader>
                  <CardTitle>Property Type Distribution</CardTitle>
                  <CardDescription>Proportional breakdown of listings by property category</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer ref={propertyTypeChartRef} config={chartConfig} className="h-[280px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={propertyTypeChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={(props: any) => {
                            const pct = (props.percent * 100).toFixed(0);
                            return `${props.type} (${pct}%)`;
                          }}
                          outerRadius={110}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="count"
                          paddingAngle={2}
                        >
                          {propertyTypeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            const pct = totalListings > 0 ? ((data.count / totalListings) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-popover/95 border border-primary/25 rounded-xl p-3 shadow-xl shadow-black/20 backdrop-blur">
                                <p className="font-semibold text-sm text-foreground">{data.type}</p>
                                <p className="text-xs text-muted-foreground mt-1">{data.count} listings • {pct}% of total</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Dominant type callout */}
                  {propertyTypeChartData.length > 0 && (() => {
                    const dominant = propertyTypeChartData.reduce((max, d) => d.count > max.count ? d : max, propertyTypeChartData[0]);
                    const dominantPct = totalListings > 0 ? ((dominant.count / totalListings) * 100).toFixed(0) : '0';
                    return (
                      <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                        <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0" />
                        <p className="text-xs text-foreground">
                          <span className="font-semibold">{dominant.type}</span> properties dominate at <span className="font-semibold">{dominantPct}%</span> of all listings ({dominant.count} of {totalListings}).
                        </p>
                        <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Dominant</Badge>
                      </div>
                    );
                  })()}
                  {/* Legend table */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t">
                    {propertyTypeChartData.map((entry, i) => {
                      const pct = totalListings > 0 ? ((entry.count / totalListings) * 100).toFixed(1) : '0';
                      return (
                        <div key={entry.type} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground truncate">{entry.type}</span>
                          <span className="font-medium ml-auto">{entry.count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="price-range" className="space-y-4">
              <Card className="ci-card">
                <CardHeader>
                  <CardTitle>Price Range Distribution</CardTitle>
                  <CardDescription>Listings grouped by price brackets — identifies the dominant market segment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer ref={priceRangeChartRef} config={chartConfig} className="h-[280px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={priceRangeChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="range" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <ChartTooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            const pct = totalListings > 0 ? ((data.count / totalListings) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-popover/95 border border-primary/25 rounded-xl p-3 shadow-xl shadow-black/20 backdrop-blur">
                                <p className="font-semibold text-sm text-foreground">{data.range}</p>
                                <p className="text-xs text-muted-foreground mt-1">{data.count} listings • {pct}% of total</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Price insights row */}
                  {(() => {
                    const validPrices = allListings.filter(l => l.price && l.price > 0).map(l => l.price!).sort((a, b) => a - b);
                    const medianPrice = validPrices.length > 0 ? validPrices[Math.floor(validPrices.length / 2)] : 0;
                    const p25 = validPrices.length > 0 ? validPrices[Math.floor(validPrices.length * 0.25)] : 0;
                    const p75 = validPrices.length > 0 ? validPrices[Math.floor(validPrices.length * 0.75)] : 0;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t">
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">${medianPrice.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">Median Price</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">${avgPrice.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">Average Price</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">${p25.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">25th Percentile</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">${p75.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">75th Percentile</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">
                            {priceRangeChartData.length > 0 
                              ? priceRangeChartData.reduce((max, d) => d.count > max.count ? d : max, priceRangeChartData[0]).range 
                              : '—'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Most Common Range</p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="ci-card">
                <CardHeader>
                  <CardTitle>Bedroom Distribution</CardTitle>
                  <CardDescription>Listings by number of bedrooms — reveals the dominant property configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChartContainer ref={bedroomChartRef} config={chartConfig} className="h-[280px] md:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bedroomChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="beds" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                        <ChartTooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload;
                            const pct = totalListings > 0 ? ((data.count / totalListings) * 100).toFixed(1) : '0';
                            return (
                              <div className="bg-popover/95 border border-primary/25 rounded-xl p-3 shadow-xl shadow-black/20 backdrop-blur">
                                <p className="font-semibold text-sm text-foreground">{data.beds} Bedroom{data.beds !== '1' ? 's' : ''}</p>
                                <p className="text-xs text-muted-foreground mt-1">{data.count} listings • {pct}% of total</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                  {/* Bedroom insights */}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {bedroomChartData.length > 0 
                          ? bedroomChartData.reduce((max, d) => d.count > max.count ? d : max, bedroomChartData[0]).beds 
                          : '—'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Most Common</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{bedroomChartData.length}</p>
                      <p className="text-[11px] text-muted-foreground">Configurations</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {allListings.filter(l => l.beds && l.beds > 0).length}
                      </p>
                      <p className="text-[11px] text-muted-foreground">With Bed Data</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="investment" className="space-y-6 mt-0">
          <ErrorBoundary fallback={
            <Card>
              <CardContent className="p-6">
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Investment Report Generator encountered an error. Please refresh the page.</p>
                </div>
              </CardContent>
            </Card>
          }>
            <Suspense fallback={<ComponentLoader />}>
              <InvestmentReportGenerator />
            </Suspense>
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}