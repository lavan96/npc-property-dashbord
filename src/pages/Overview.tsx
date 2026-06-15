import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Building2, Calendar, AlertTriangle, DollarSign, TrendingUp, Image, FileText, Tag, Ruler, Download, MapPin, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlattenPdfIconButton } from '@/components/common/FlattenPdfIconButton';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { OverviewFilters } from '@/components/overview/OverviewFilters';
import { DataIntegrityPanel } from '@/components/debug/DataIntegrityPanel';
import { UpcomingRemindersWidget } from '@/components/overview/UpcomingRemindersWidget';
import { CommercialPortfolioWidget } from '@/components/commercial/CommercialPortfolioWidget';
import { IndustrialPortfolioWidget } from '@/components/industrial/IndustrialPortfolioWidget';

import { PropertyListing } from '@/lib/airtable';
import { DashboardKPIs } from '@/types/airtable';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { propertyDataService } from '@/services/propertyDataService';
import { chartDataService } from '@/services/chartDataService';
import { toast } from 'sonner';
import { generateOverviewSnapshotPDF } from '@/components/overview/OverviewSnapshotPDF';
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

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))',
  'hsl(var(--chart-7))', 'hsl(var(--chart-8))', 'hsl(var(--chart-9))', 
  'hsl(var(--chart-10))'
];

export default function Overview() {
  const { canEdit: canEditOverview } = useModulePermissions('overview');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allListings, setAllListings] = useState<PropertyListing[]>([]);
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

  // Filters state — renamed zipCode → postcode for AU localization
  const [filters, setFilters] = useState({
    state: 'all',
    postcode: 'all',
    suburb: 'all',
    propertyType: 'all',
  });
  
  const [uniqueValues, setUniqueValues] = useState({
    states: [] as string[],
    postcodes: [] as string[],
    suburbs: [] as string[],
    propertyTypes: [] as string[],
  });

  // Stable helpers
  const safeParseDate = useCallback((date: Date | string | null | undefined): Date | null => {
    if (!date) return null;
    try {
      const validDate = date instanceof Date ? date : new Date(date);
      return isNaN(validDate.getTime()) ? null : validDate;
    } catch {
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
      if (isNaN(validDate.getTime())) return 'Invalid Date';
      return new Intl.DateTimeFormat('en-AU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(validDate);
    } catch {
      return 'Invalid Date';
    }
  }, []);

  // Extract state from address
  const extractState = useCallback((address: string): string | null => {
    const match = address.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
    return match ? match[0].toUpperCase() : null;
  }, []);

  // Extract postcode from address
  const extractPostcode = useCallback((address: string): string | null => {
    const match = address.match(/\b(\d{4})\b/);
    return match ? match[0] : null;
  }, []);

  // ─── STEP 1: Fetch raw data (cached, only re-fetches when cache expires) ───
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await propertyDataService.fetchAllListings({
        includeDebugInfo: true
      });

      console.log('Fetched data:', result.debugInfo.totalFetched, 'records, fromCache:', result.debugInfo.fromCache, 'in', result.debugInfo.fetchTime, 'ms');
      setAllListings(result.listings);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── STEP 2: Compute filtered data + KPIs client-side (instant on filter change) ───
  useEffect(() => {
    if (allListings.length === 0 && !isLoading) return;
    if (allListings.length === 0) return;

    const listings = allListings;

    // Extract unique values for filters (from ALL data, not filtered)
    const states = [...new Set(listings.map(l => extractState(l.address || '')).filter(Boolean))] as string[];
    const postcodes = [...new Set(listings.map(l => l.zipCode || extractPostcode(l.address || '')).filter(Boolean))] as string[];
    const suburbs = [...new Set(listings.map(l => l.suburb).filter(Boolean))] as string[];
    const propertyTypes = [...new Set(listings.map(l => l.propertyType).filter(Boolean))] as string[];

    setUniqueValues({
      states: states.sort(),
      postcodes: postcodes.sort(),
      suburbs: suburbs.sort(),
      propertyTypes: propertyTypes.sort(),
    });

    // Apply filters
    let filtered = listings;
    if (filters.state !== 'all') {
      filtered = filtered.filter(l => extractState(l.address || '') === filters.state);
    }
    if (filters.postcode !== 'all') {
      filtered = filtered.filter(l => {
        const pc = l.zipCode || extractPostcode(l.address || '');
        return pc === filters.postcode;
      });
    }
    if (filters.suburb !== 'all') {
      filtered = filtered.filter(l => l.suburb === filters.suburb);
    }
    if (filters.propertyType !== 'all') {
      filtered = filtered.filter(l => l.propertyType === filters.propertyType);
    }

    // Calculate KPIs
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newThisWeek = filtered.filter(l => {
      const parsedDate = safeParseDate(l.createdAt || l.createdTime || l.receivedAt);
      return parsedDate && parsedDate >= oneWeekAgo;
    }).length;

    const withInspections = filtered.filter(l => l.inspectionStart).length;
    const needsReview = filtered.filter(l => l.confidence !== undefined && l.confidence !== null && l.confidence < 0.7).length;

    const recentWithPrice = filtered.filter(l => {
      const parsedDate = safeParseDate(l.createdAt || l.createdTime || l.receivedAt);
      return l.price && parsedDate && parsedDate >= thirtyDaysAgo;
    });
    const averagePrice = recentWithPrice.length > 0
      ? recentWithPrice.reduce((sum, l) => sum + (l.price || 0), 0) / recentWithPrice.length
      : 0;

    setKpis({ newThisWeek, withInspections, needsReview, averagePrice });
    setRecentListings(filtered.slice(0, 20));

    // Chart data
    const suburbChartData = chartDataService.generateSuburbData(filtered, 10);
    setSuburbData(suburbChartData.data.map(item => ({ suburb: item.label, count: item.value })));

    const propertyTypeChartData = chartDataService.generatePropertyTypeData(filtered);
    setPropertyTypeData(propertyTypeChartData.data.map(item => ({ type: item.label, count: item.value })));

    const dailyActivityData = chartDataService.generateDailyActivityData(filtered, 30);
    setDailyData(dailyActivityData.data.map(item => ({ date: item.metadata?.fullDate || item.label, count: item.value })));

    const statusCounts = filtered.reduce((acc, listing) => {
      const status = listing.status || 'Available';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    setCategoryData(Object.entries(statusCounts).map(([status, count]) => ({ status, count })));

    const agencyChartData = chartDataService.generateAgencyData(filtered, 10);
    setAgencyData(agencyChartData.data.map(item => ({ agency: item.metadata?.fullName || item.label, count: item.value })));

    // Content statistics — properly check for images/floorplans including attachment objects and alternate field names
    const withPrices = filtered.filter(l => l.price && l.price > 0).length;
    const withImages = filtered.filter(l => {
      const raw = l as any;
      const imgs = l.images || raw.Images || raw.Property_Images || raw.Attachments || raw.Photos;
      if (!imgs) return false;
      if (Array.isArray(imgs) && imgs.length > 0) return true;
      if (typeof imgs === 'string' && imgs.trim().length > 0) return true;
      return false;
    }).length;
    const withFloorplans = filtered.filter(l => {
      const raw = l as any;
      const fps = l.floorplans || raw.Floorplans || raw.Floor_Plans || raw.FloorPlan;
      if (!fps) return false;
      if (Array.isArray(fps) && fps.length > 0) return true;
      if (typeof fps === 'string' && fps.trim().length > 0) return true;
      return false;
    }).length;
    const withKeyEntities = filtered.filter(l => l.keyEntities && l.keyEntities.trim() !== '').length;
    const emailSources = filtered.filter(l => l.source && l.source.includes('@')).length;

    setContentStats({ withPrices, withImages, withFloorplans, withKeyEntities, emailSources });

    const sourceChartData = chartDataService.generateSourceData(filtered, 10);
    setSourceData(sourceChartData.data.map(item => ({ source: item.label, count: item.value })));

  }, [allListings, filters, safeParseDate, extractState, extractPostcode]);

  // ─── STEP 3: Initial data fetch (only once) ───
  const { startAutoRefresh, stopAutoRefresh } = useAutoRefresh(fetchData);

  useEffect(() => {
    fetchData();
    return () => { stopAutoRefresh(); };
  }, [fetchData]);

  // ─── Export snapshot PDF ───
  const buildSnapshotData = useCallback(() => ({
    kpis,
    contentStats,
    totalListings: allListings.length,
    filters,
    suburbData: suburbData.slice(0, 15),
    propertyTypeData,
    agencyData: agencyData.slice(0, 10),
    recentListings: recentListings.map(l => ({
      address: l.address,
      suburb: l.suburb,
      postcode: l.zipCode || extractPostcode(l.address || '') || undefined,
      price: l.price,
      propertyType: l.propertyType,
      beds: l.beds,
      baths: l.baths,
      source: l.source,
    })),
  }), [allListings, kpis, contentStats, filters, suburbData, propertyTypeData, agencyData, recentListings, extractPostcode]);

  const handleExportSnapshot = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Generating Overview Snapshot PDF...');
    try {
      const pdfBlob = await generateOverviewSnapshotPDF(buildSnapshotData());
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Overview_Snapshot_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Overview Snapshot PDF exported!', { id: toastId });
    } catch (err) {
      console.error('Snapshot PDF export failed:', err);
      toast.error('Failed to export snapshot PDF', { id: toastId, description: err instanceof Error ? err.message : 'An unexpected error occurred' });
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, buildSnapshotData]);

  // ─── Error state ───
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Property intake dashboard overview and key metrics</p>
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
              <Button variant="outline" onClick={() => window.location.href = '/settings'}>Go to Settings</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Property intake dashboard overview and key metrics</p>
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
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent><Skeleton className="h-64 w-full" /></CardContent>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportSnapshot} disabled={isExporting || isLoading}>
            {isExporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Snapshot
              </>
            )}
          </Button>
          <OverviewFilters 
            filters={filters}
            setFilters={setFilters}
            uniqueValues={uniqueValues}
          />
        </div>
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

      {/* Upcoming Reminders & Data Integrity Panel */}
      <div className="grid gap-4 lg:grid-cols-2 animate-fade-in">
        <UpcomingRemindersWidget />
        <DataIntegrityPanel 
          dashboardData={recentListings} 
        />
      </div>

      {/* Commercial Portfolio KPIs */}
      <div className="animate-fade-in">
        <CommercialPortfolioWidget />
        <IndustrialPortfolioWidget />
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
                    labelLine={!isMobile}
                    label={(props: any) => {
                      const total = propertyTypeData.reduce((sum, item) => sum + item.count, 0);
                      const percentage = total > 0 ? ((props.count / total) * 100).toFixed(1) : '0.0';
                      if (parseFloat(percentage) < 5) return null;
                      const RADIAN = Math.PI / 180;
                      const radius = (props.outerRadius || 100) + (isMobile ? 14 : 22);
                      const x = props.cx + radius * Math.cos(-props.midAngle * RADIAN);
                      const y = props.cy + radius * Math.sin(-props.midAngle * RADIAN);
                      return (
                        <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > props.cx ? 'start' : 'end'} dominantBaseline="central" fontSize={isMobile ? 9 : 11} fontWeight="500">
                          {props.type} ({percentage}%)
                        </text>
                      );
                    }}
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
                        {propertyTypeData.map((entry, index) => {
                          const total = propertyTypeData.reduce((sum, item) => sum + item.count, 0);
                          const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={entry.type} className="flex items-center gap-1">
                              <div 
                                className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm" 
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <span className="text-[10px] md:text-xs text-muted-foreground">
                                {entry.type} ({entry.count} · {pct}%)
                              </span>
                            </div>
                          );
                        })}
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
                      return `${date.getDate()}/${date.getMonth() + 1}`;
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
                <PieChart margin={isMobile ? { top: 20, right: 10, bottom: 60, left: 10 } : { top: 40, right: 20, bottom: 80, left: 20 }}>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="40%"
                    labelLine={!isMobile}
                    label={(props: any) => {
                      const total = categoryData.reduce((sum, item) => sum + item.count, 0);
                      const percentage = total > 0 ? ((props.count / total) * 100).toFixed(1) : '0.0';
                      if (parseFloat(percentage) < 5) return null;
                      const RADIAN = Math.PI / 180;
                      const radius = (props.outerRadius || 90) + (isMobile ? 14 : 22);
                      const x = props.cx + radius * Math.cos(-props.midAngle * RADIAN);
                      const y = props.cy + radius * Math.sin(-props.midAngle * RADIAN);
                      return (
                        <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > props.cx ? 'start' : 'end'} dominantBaseline="central" fontSize={isMobile ? 9 : 11} fontWeight="500">
                          {props.status} ({percentage}%)
                        </text>
                      );
                    }}
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
                    height={isMobile ? 50 : 60}
                    wrapperStyle={{ paddingTop: '10px', fontSize: isMobile ? '10px' : '12px' }}
                    content={() => (
                      <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                        {categoryData.map((entry, index) => {
                          const total = categoryData.reduce((sum, item) => sum + item.count, 0);
                          const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0.0';
                          return (
                            <div key={entry.status} className="flex items-center gap-1">
                              <div 
                                className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm" 
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <span className="text-[10px] md:text-xs text-muted-foreground">
                                {entry.status} ({entry.count} · {pct}%)
                              </span>
                            </div>
                          );
                        })}
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
                    {listing.confidence !== undefined && listing.confidence !== null && (
                      <ConfidenceBadge confidence={listing.confidence} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
                    {/* Suburb + Postcode */}
                    <span className="font-medium flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {listing.suburb || 'Unknown Suburb'}
                      {(listing.zipCode || extractPostcode(listing.address || '')) && (
                        <span className="text-muted-foreground/70">
                          {listing.zipCode || extractPostcode(listing.address || '')}
                        </span>
                      )}
                    </span>
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
