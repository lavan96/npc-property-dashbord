import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Calendar, AlertTriangle, DollarSign, TrendingUp, Image, FileText, Tag, Ruler } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { airtableService, PropertyListing } from '@/lib/airtable';
import { DashboardKPIs } from '@/types/airtable';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
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
    withImages: 0,
    withFloorplans: 0,
    withKeyEntities: 0,
    emailSources: 0,
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
      
      // Get recent records
      const response = await airtableService.getRecords({
        pageSize: 100,
        sortField: 'ReceivedAt',
        sortDirection: 'desc'
      });

      console.log('Got response:', response);
      const listings = response.records;
      
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

      // Calculate suburb distribution
      const suburbCounts = listings.reduce((acc, listing) => {
        const suburb = listing.suburb || 'Unknown';
        acc[suburb] = (acc[suburb] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topSuburbs = Object.entries(suburbCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([suburb, count]) => ({ suburb, count }));

      setSuburbData(topSuburbs);

      // Calculate property type distribution
      const typeCounts = listings.reduce((acc, listing) => {
        const type = listing.propertyType || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const typeData = Object.entries(typeCounts)
        .map(([type, count]) => ({ type, count }));

      setPropertyTypeData(typeData);

      // Calculate daily data for last 30 days
      const dailyCounts: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        dailyCounts[dateStr] = 0;
      }

      listings.forEach(listing => {
        const createdDate = listing.createdAt || listing.createdTime || listing.receivedAt;
        const parsedDate = safeParseDate(createdDate);
        if (parsedDate && parsedDate >= thirtyDaysAgo) {
          const dateStr = parsedDate.toISOString().split('T')[0];
          if (dailyCounts[dateStr] !== undefined) {
            dailyCounts[dateStr]++;
          }
        }
      });

      const dailyChartData = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }));

      setDailyData(dailyChartData);

      // Calculate property status distribution (Available vs others)
      const statusCounts = listings.reduce((acc, listing) => {
        const status = listing.status || 'Available';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statusData = Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }));

      setCategoryData(statusData);

      // Calculate agency distribution (from actual data)
      const agencyCounts = listings.reduce((acc, listing) => {
        const agency = listing.agencyName || 'Unknown Agency';
        acc[agency] = (acc[agency] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topAgencies = Object.entries(agencyCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([agency, count]) => ({ agency, count }));

      setAgencyData(topAgencies);

      // Calculate actual property statistics from Properties table
      const withPrices = listings.filter(l => l.price && l.price > 0).length;
      const withLandSize = listings.filter(l => l.landSize && parseFloat(l.landSize) > 0).length;
      const withLotNumbers = listings.filter(l => l.lotNumber).length;
      const commercialProperties = listings.filter(l => l.propertyType === 'Other').length;

      setContentStats({
        withImages: withPrices,
        withFloorplans: withLandSize,
        withKeyEntities: withLotNumbers,
        emailSources: commercialProperties,
      });

      // Calculate sender email distribution (source field)
      const sourceCounts = listings.reduce((acc, listing) => {
        const senderEmail = listing.source || 'Unknown Sender';
        acc[senderEmail] = (acc[senderEmail] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sourceData = Object.entries(sourceCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([source, count]) => ({ source, count }));

      setSourceData(sourceData);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      // Don't throw the error to prevent auto-refresh from stopping
    } finally {
      setIsLoading(false);
    }
  }, [safeParseDate]); // Only depend on safeParseDate, which is stable

  // Auto-refresh functionality - COMPLETELY DISABLED to prevent infinite loops
  const { startAutoRefresh, stopAutoRefresh } = useAutoRefresh(loadDashboardData);

  // Single effect for initial load only
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
  }, []); // Empty dependency array - only run once

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          Property intake dashboard overview and key metrics
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-fade-in">
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-fade-in">
        <KPICard
          title="With Prices"
          value={contentStats.withImages}
          icon={<DollarSign className="h-4 w-4" />}
          description="Properties with price information"
        />
        
        <KPICard
          title="With Land Size" 
          value={contentStats.withFloorplans}
          icon={<Ruler className="h-4 w-4" />}
          description="Properties with land/square footage"
        />
        
        <KPICard
          title="With Lot Numbers"
          value={contentStats.withKeyEntities}
          icon={<Tag className="h-4 w-4" />}
          description="Properties with lot number data"
        />
        
        <KPICard
          title="Commercial Properties"
          value={contentStats.emailSources}
          icon={<Building2 className="h-4 w-4" />}
          description="Commercial/industrial properties"
        />
      </div>

      {/* Charts Section */}
      <div className="space-y-8">
        {/* Primary Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3 animate-fade-in">
          <Card className="lg:col-span-2 hover-scale">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Listings by Suburb (Top 10)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={suburbData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="suburb" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis fontSize={12} />
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
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Property Types</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart margin={{ top: 20, right: 80, bottom: 60, left: 80 }}>
                  <Pie
                    data={propertyTypeData}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    label={({ type, count, percent }) => 
                      percent > 0.02 ? `${type}: ${count}` : ''
                    }
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {propertyTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: number, name) => {
                      const total = propertyTypeData.reduce((sum, item) => sum + item.count, 0);
                      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                      return [`${value} properties (${percentage}%)`, name];
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={50}
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => {
                      const item = propertyTypeData.find(d => d.type === value);
                      return `${value} (${item?.count || 0})`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3 animate-fade-in">
          <Card className="lg:col-span-2 hover-scale">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Daily Listings (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                    fontSize={11}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleDateString('en-AU')}
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
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Property Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, percent }) => 
                      percent > 0.05 ? `${status} ${(percent * 100).toFixed(0)}%` : ''
                    }
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Third Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3 animate-fade-in">
          <Card className="lg:col-span-2 hover-scale">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Sender Email Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={sourceData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="source" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={11}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip 
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
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Agency Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={agencyData} layout="horizontal" margin={{ top: 20, right: 30, left: 80, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" fontSize={12} />
                  <YAxis dataKey="agency" type="category" width={80} fontSize={10} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
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
          <div className="space-y-4">
            {recentListings.map((listing, index) => (
              <div 
                key={listing.id} 
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-all duration-200 hover-scale"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-base">{listing.address || 'Unknown Address'}</h4>
                    <Badge variant="outline" className="text-xs">{listing.propertyType || 'Unknown'}</Badge>
                    {listing.status && listing.status !== 'Available' && (
                      <Badge variant="secondary" className="text-xs">{listing.status}</Badge>
                    )}
                    {listing.confidence !== undefined && (
                      <ConfidenceBadge confidence={listing.confidence} />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-medium">{listing.suburb || 'Unknown Suburb'}</span>
                    {listing.price && listing.price > 0 && (
                      <span className="font-semibold text-primary">{formatCurrency(listing.price)}</span>
                    )}
                    {listing.beds && listing.beds > 0 && <span>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>}
                    {listing.baths && listing.baths > 0 && <span>{listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>}
                    {listing.carSpaces && listing.carSpaces > 0 && <span>{listing.carSpaces} car</span>}
                    {listing.landSize && parseFloat(listing.landSize) > 0 && (
                      <div className="flex items-center gap-1">
                        <Ruler className="h-3 w-3" />
                        <span>{listing.landSize} sqft</span>
                      </div>
                    )}
                    {listing.lotNumber && (
                      <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        <span>Lot {listing.lotNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {formatDate(listing.createdAt || listing.createdTime || listing.receivedAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
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