import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Building2, Calendar, AlertTriangle, DollarSign, TrendingUp, Image, FileText, Tag, Ruler } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { OverviewFilters } from '@/components/overview/OverviewFilters';
import { DataIntegrityPanel } from '@/components/debug/DataIntegrityPanel';
import { ReviewsDueWidget } from '@/components/clients/ReviewsDueWidget';
import { PropertyListing } from '@/lib/airtable';
import { DashboardKPIs } from '@/types/airtable';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { propertyDataService } from '@/services/propertyDataService';
import { chartDataService } from '@/services/chartDataService';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  ResponsiveContainer,
  Legend
} from 'recharts';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Overview() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<DashboardKPIs>({
    newThisWeek: 0,
    withInspections: 0,
    needsReview: 0,
    averagePrice: 0,
  });
  const [recentListings, setRecentListings] = useState<PropertyListing[]>([]);
  const [suburbData, setSuburbData] = useState<{ suburb: string; count: number }[]>([]);
  const [propertyTypeData, setPropertyTypeData] = useState<{ type: string; count: number }[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; count: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ status: string; count: number }[]>([]);
  const [sourceData, setSourceData] = useState<{ source: string; count: number }[]>([]);
  const [agencyData, setAgencyData] = useState<{ agency: string; count: number }[]>([]);
  const [contentStats, setContentStats] = useState({
    withPrices: 0,
    withImages: 0,
    withFloorplans: 0,
    withKeyEntities: 0,
    emailSources: 0,
  });

  // Filters state
  const [filters, setFilters] = useState({
    state: 'all',
    zipCode: 'all',
    suburb: 'all',
    propertyType: 'all',
  });
  
  const [uniqueValues, setUniqueValues] = useState({
    states: [] as string[],
    zipCodes: [] as string[],
    suburbs: [] as string[],
    propertyTypes: [] as string[],
  });

  // Helper functions (stable references)
  const safeParseDate = useCallback((date: Date | string | null | undefined): Date | null => {
    if (!date) return null;
    
    try {
      const validDate = date instanceof Date ? date : new Date(date);
      if (isNaN(validDate.getTime())) {
        return null;
      }
      return validDate;
    } catch (error) {
      console.warn('Error parsing date:', date, error);
      return null;
    }
  }, []);

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }, []);

  const formatDate = useCallback((date: Date | string | null | undefined) => {
    if (!date) return 'Unknown Date';
    
    try {
      const validDate = date instanceof Date ? date : new Date(date);
      if (isNaN(validDate.getTime())) {
        return 'Invalid Date';
      }
      
      return new Intl.DateTimeFormat('en-AU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(validDate);
    } catch (error) {
      console.warn('Error formatting date:', date, error);
      return 'Invalid Date';
    }
  }, []);

  // Memoize the load function to prevent unnecessary re-renders
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Loading dashboard data...');
      
      // Use the unified data service for consistent data fetching
      const result = await propertyDataService.fetchAllListings({
        includeDebugInfo: true
      });

      console.log('Got unified data:', result.debugInfo);
      console.log('Overview listings count:', result.listings.length);
      let listings = result.listings;

      // Extract unique values for filters
      // Extract states and zip codes from addresses
      const states = [...new Set(listings.map(l => {
        const address = l.address || '';
        // Extract state from address (assuming format like "123 Main St, Sydney NSW 2000")
        const match = address.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
        return match ? match[0].toUpperCase() : null;
      }).filter(Boolean))];
      
      const zipCodes = [...new Set(listings.map(l => {
        const address = l.address || '';
        // Extract 4-digit postcodes from address
        const match = address.match(/\b(\d{4})\b/);
        return match ? match[0] : null;
      }).filter(Boolean))];
      
      const suburbs = [...new Set(listings.map(l => l.suburb).filter(Boolean))];
      const propertyTypes = [...new Set(listings.map(l => l.propertyType).filter(Boolean))];

      setUniqueValues({
        states: states.sort(),
        zipCodes: zipCodes.sort(),
        suburbs: suburbs.sort(),
        propertyTypes: propertyTypes.sort(),
      });

      // Apply filters
      if (filters.state !== 'all') {
        listings = listings.filter(l => {
          const address = l.address || '';
          const match = address.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
          const state = match ? match[0].toUpperCase() : null;
          return state === filters.state;
        });
      }
      if (filters.zipCode !== 'all') {
        listings = listings.filter(l => {
          const address = l.address || '';
          const match = address.match(/\b(\d{4})\b/);
          const zipCode = match ? match[0] : null;
          return zipCode === filters.zipCode;
        });
      }
      if (filters.suburb !== 'all') {
        listings = listings.filter(l => l.suburb === filters.suburb);
      }
      if (filters.propertyType !== 'all') {
        listings = listings.filter(l => l.propertyType === filters.propertyType);
      }
      
      // Calculate KPIs
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const newThisWeek = listings.filter(l => {
        const createdDate = l.createdAt || l.createdTime || l.receivedAt;
        const parsedDate = safeParseDate(createdDate);
        return parsedDate && parsedDate >= oneWeekAgo;
      }).length;

      const withInspections = listings.filter(l => l.inspectionStart).length;
      
      const needsReview = listings.filter(l => 
        l.confidence !== undefined && l.confidence !== null && l.confidence < 0.7
      ).length;

      const recentWithPrice = listings.filter(l => {
        const createdDate = l.createdAt || l.createdTime || l.receivedAt;
        const parsedDate = safeParseDate(createdDate);
        return l.price && parsedDate && parsedDate >= thirtyDaysAgo;
      });
      const averagePrice = recentWithPrice.length > 0 
        ? recentWithPrice.reduce((sum, l) => sum + (l.price || 0), 0) / recentWithPrice.length
        : 0;

      setKpis({
        newThisWeek,
        withInspections,
        needsReview,
        averagePrice,
      });

      // Set recent listings (top 20)
      setRecentListings(listings.slice(0, 20));

      // Use unified chart data service for consistent suburb data
      const suburbChartData = chartDataService.generateSuburbData(listings, 10);
      setSuburbData(suburbChartData.data.map(item => ({ 
        suburb: item.label, 
        count: item.value 
      })));

      // Use unified chart data service for consistent property type data
      const propertyTypeChartData = chartDataService.generatePropertyTypeData(listings);
      setPropertyTypeData(propertyTypeChartData.data.map(item => ({ 
        type: item.label, 
        count: item.value 
      })));

      // Use unified chart data service for consistent daily activity data
      const dailyActivityData = chartDataService.generateDailyActivityData(listings, 30);
      setDailyData(dailyActivityData.data.map(item => ({ 
        date: item.metadata?.fullDate || item.label,
        count: item.value 
      })));

      // Calculate property status distribution (Available vs others)
      const statusCounts = listings.reduce((acc, listing) => {
        const status = listing.status || 'Available';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statusData = Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }));

      setCategoryData(statusData);

      // Use unified chart data service for consistent agency data
      const agencyChartData = chartDataService.generateAgencyData(listings, 10);
      setAgencyData(agencyChartData.data.map(item => ({ 
        agency: item.metadata?.fullName || item.label, 
        count: item.value 
      })));

      // Calculate actual property statistics from Properties table
      const withPrices = listings.filter(l => l.price && l.price > 0).length;
      const withImages = listings.filter(l => l.images && l.images.length > 0).length;
      const withFloorplans = listings.filter(l => l.floorplans && l.floorplans.length > 0).length;
      const withKeyEntities = listings.filter(l => l.keyEntities && l.keyEntities.trim() !== '').length;
      const emailSources = listings.filter(l => l.source && l.source.includes('@')).length;

      console.log('Content Statistics (Corrected):', {
        withPrices,
        withImages,
        withFloorplans,
        withKeyEntities,
        emailSources
      });

      setContentStats({
        withPrices,
        withImages,
        withFloorplans,
        withKeyEntities,
        emailSources,
      });

      // Use unified chart data service for consistent source data
      const sourceChartData = chartDataService.generateSourceData(listings, 10);
      setSourceData(sourceChartData.data.map(item => ({ 
        source: item.label, 
        count: item.value 
      })));

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      // Don't throw the error to prevent auto-refresh from stopping
    } finally {
      setIsLoading(false);
    }
  }, [safeParseDate, filters]); // Depend on filters to reload when they change

  // Auto-refresh functionality - COMPLETELY DISABLED to prevent infinite loops
  const { startAutoRefresh, stopAutoRefresh } = useAutoRefresh(loadDashboardData);

  // Effect for initial load and filter changes
  useEffect(() => {
    console.log('Overview useEffect running...');
    let mounted = true;
    
    const loadData = async () => {
      console.log('loadData called, mounted:', mounted);
      if (mounted) {
        try {
          await loadDashboardData();
          console.log('loadDashboardData completed');
        } catch (error) {
          console.error('Error in loadData:', error);
        }
      }
    };
    
    loadData();

    return () => {
      console.log('Overview component unmounting');
      mounted = false;
      stopAutoRefresh();
    };
  }, [loadDashboardData]); // Depend on loadDashboardData which includes filters

  // Show error state if there's an error
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Property intake dashboard overview and key metrics
          </p>
        </div>

        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-semibold">Configuration Required</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Unable to load dashboard data. This usually means the Airtable integration needs to be configured.
            </p>
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
              <strong>Error:</strong> {error}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => window.location.href = '/settings'}>
                Go to Settings
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Property intake dashboard overview and key metrics
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Property intake dashboard overview and key metrics
          </p>
        </div>
        <OverviewFilters 
          filters={filters}
          setFilters={setFilters}
          uniqueValues={uniqueValues}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 md:gap-6 grid-cols-2 lg:grid-cols-4 animate-fade-in">
        <KPICard
          title="New This Week"
          value={kpis.newThisWeek}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Properties received in last 7 days"
        />
        
        <KPICard
          title="With Inspections"
          value={kpis.withInspections}
          icon={<Calendar className="h-4 w-4" />}
          description="Properties with scheduled inspections"
        />
        
        <KPICard
          title="Needs Review"
          value={kpis.needsReview}
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Low confidence (<0.7) properties"
        />
        
        <KPICard
          title="Average Price"
          value={formatCurrency(kpis.averagePrice)}
          icon={<DollarSign className="h-4 w-4" />}
          description="Last 30 days"
        />
      </div>

      {/* Content Statistics */}
      <div className="grid gap-3 md:gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-5 animate-fade-in">
        <KPICard
          title="With Prices"
          value={contentStats.withPrices}
          icon={<DollarSign className="h-4 w-4" />}
          description="Properties with price information"
        />
        
        <KPICard
          title="With Images" 
          value={contentStats.withImages}
          icon={<Image className="h-4 w-4" />}
          description="Properties with image attachments"
        />
        
        <KPICard
          title="With Floorplans"
          value={contentStats.withFloorplans}
          icon={<FileText className="h-4 w-4" />}
          description="Properties with floorplan documents"
        />
        
        <KPICard
          title="With Key Entities"
          value={contentStats.withKeyEntities}
          icon={<Tag className="h-4 w-4" />}
          description="Properties with extracted entities"
        />

        <KPICard
          title="Email Sources"
          value={contentStats.emailSources}
          icon={<Ruler className="h-4 w-4" />}
          description="Properties from email sources"
        />
      </div>

      {/* Data Integrity Monitor */}
      {/* Reviews Due Widget & Data Integrity Panel */}
      <div className="grid gap-4 lg:grid-cols-2 animate-fade-in">
        <ReviewsDueWidget />
        <DataIntegrityPanel 
          dashboardData={recentListings} 
        />
      </div>

      {/* Charts Section */}
      <div className="space-y-4 md:space-y-8">
        {/* Row 1: Suburbs and Property Types */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 animate-fade-in">
          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Listings by Suburb (Top 10)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 350}>
                <BarChart data={suburbData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 80 } : { top: 20, right: 30, left: 20, bottom: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="suburb" 
                    angle={-45}
                    textAnchor="end"
                    height={isMobile ? 80 : 100}
                    fontSize={isMobile ? 10 : 12}
                    interval={0}
                  />
                  <YAxis fontSize={isMobile ? 10 : 12} width={isMobile ? 30 : 60} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Property Types</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 350}>
                <PieChart margin={isMobile ? { top: 20, right: 10, bottom: 60, left: 10 } : { top: 40, right: 20, bottom: 80, left: 20 }}>
                  <Pie
                    data={propertyTypeData}
                    cx="50%"
                    cy="40%"
                    labelLine={false}
                    outerRadius={isMobile ? 70 : 100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {propertyTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => {
                      const total = propertyTypeData.reduce((sum, item) => sum + item.count, 0);
                      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                      return [`${value} properties (${percentage}%)`];
                    }}
                    labelFormatter={(label, payload) => {
                      const data = payload?.[0]?.payload;
                      return data ? `Property Type: ${data.type}` : 'Property Type';
                    }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={isMobile ? 50 : 60}
                    wrapperStyle={{ paddingTop: '10px', fontSize: isMobile ? '10px' : '12px' }}
                    content={() => (
                      <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                        {propertyTypeData.map((entry, index) => (
                          <div key={entry.type} className="flex items-center gap-1">
                            <div 
                              className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-[10px] md:text-xs text-muted-foreground">
                              {entry.type} ({entry.count})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Daily Listings and Property Status */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 animate-fade-in">
          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Daily Listings (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
                <LineChart data={dailyData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 30 } : { top: 20, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="date"
                    fontSize={isMobile ? 9 : 12}
                    tick={{ textAnchor: 'middle' }}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval={isMobile ? 'preserveStartEnd' : undefined}
                  />
                  <YAxis fontSize={isMobile ? 10 : 12} width={isMobile ? 25 : 60} />
                  <Tooltip 
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
                    }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={isMobile ? 2 : 3}
                    dot={isMobile ? false : { fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: isMobile ? 4 : 6, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Property Status</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 300}>
                <PieChart margin={isMobile ? { top: 10, right: 10, bottom: 50, left: 10 } : { top: 20, right: 20, bottom: 60, left: 20 }}>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="40%"
                    labelLine={false}
                    label={(props: any) => 
                      props.percent > 0.05 ? `${props.count}` : ''
                    }
                    outerRadius={isMobile ? 65 : 90}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => {
                      const total = categoryData.reduce((sum, item) => sum + item.count, 0);
                      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                      return [`${value} properties (${percentage}%)`];
                    }}
                    labelFormatter={(label, payload) => {
                      const data = payload?.[0]?.payload;
                      return data ? `Status: ${data.status}` : 'Status';
                    }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={isMobile ? 35 : 40}
                    wrapperStyle={{ paddingTop: '10px', fontSize: isMobile ? '10px' : '12px' }}
                    content={() => (
                      <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                        {categoryData.map((entry, index) => (
                          <div key={entry.status} className="flex items-center gap-1">
                            <div 
                              className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-[10px] md:text-xs text-muted-foreground">
                              {entry.status} ({entry.count})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Source and Agency Distribution */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 animate-fade-in">
          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Top Sender Emails</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 260 : 350}>
                <BarChart data={sourceData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 90 } : { top: 20, right: 30, left: 20, bottom: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="source" 
                    angle={-45}
                    textAnchor="end"
                    height={isMobile ? 90 : 120}
                    fontSize={isMobile ? 9 : 11}
                    interval={0}
                  />
                  <YAxis fontSize={isMobile ? 10 : 12} width={isMobile ? 25 : 60} />
                  <Tooltip 
                    formatter={(value) => [value, 'Count']}
                    labelFormatter={(value) => `Source: ${value}`}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Top Agencies</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <ResponsiveContainer width="100%" height={isMobile ? 260 : 350}>
                <BarChart data={agencyData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 90 } : { top: 20, right: 30, left: 20, bottom: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="agency" 
                    angle={-45}
                    textAnchor="end"
                    height={isMobile ? 90 : 120}
                    fontSize={isMobile ? 9 : 11}
                    interval={0}
                  />
                  <YAxis fontSize={isMobile ? 10 : 12} width={isMobile ? 25 : 60} />
                  <Tooltip 
                    formatter={(value) => [value, 'Count']}
                    labelFormatter={(value) => `Agency: ${value}`}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="animate-fade-in hover-scale">
        <CardHeader className="flex flex-row items-center justify-between pb-6">
          <CardTitle className="text-xl">Recent Activity</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            className="hover-scale"
            onClick={() => navigate('/listings')}
          >
            View All Listings
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:space-y-4">
            {recentListings.map((listing, index) => (
              <div 
                key={listing.id} 
                className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 border rounded-lg hover:bg-muted/50 transition-all duration-200 hover-scale gap-2"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start md:items-center gap-2 mb-1.5 md:mb-2 flex-wrap">
                    <h4 className="font-medium text-sm md:text-base truncate">{listing.address || 'Unknown Address'}</h4>
                    <Badge variant="outline" className="text-[10px] md:text-xs shrink-0">{listing.propertyType || 'Unknown'}</Badge>
                    {listing.status && listing.status !== 'Available' && (
                      <Badge variant="secondary" className="text-[10px] md:text-xs shrink-0">{listing.status}</Badge>
                    )}
                    {listing.confidence !== undefined && (
                      <ConfidenceBadge confidence={listing.confidence} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
                    <span className="font-medium">{listing.suburb || 'Unknown Suburb'}</span>
                    {listing.price && listing.price > 0 && (
                      <span className="font-semibold text-primary">{formatCurrency(listing.price)}</span>
                    )}
                    {listing.beds && listing.beds > 0 && <span>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>}
                    {listing.baths && listing.baths > 0 && <span>{listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>}
                    {listing.carSpaces && listing.carSpaces > 0 && <span>{listing.carSpaces} car</span>}
                    {!isMobile && listing.images && listing.images.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Image className="h-3 w-3" />
                        <span>{listing.images.length} image{listing.images.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {!isMobile && listing.floorplans && listing.floorplans.length > 0 && (
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>{listing.floorplans.length} floorplan{listing.floorplans.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-left md:text-right flex md:flex-col items-center md:items-end gap-2 md:gap-0">
                  <div className="text-xs md:text-sm font-medium text-foreground">
                    {formatDate(listing.createdAt || listing.createdTime || listing.receivedAt)}
                  </div>
                  <div className="text-[10px] md:text-xs text-muted-foreground truncate max-w-[200px]">
                    From: {listing.source || listing.sourceHost || 'Unknown Sender'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}