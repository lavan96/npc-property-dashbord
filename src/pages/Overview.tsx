import { useEffect, useState } from 'react';
import { Building2, Calendar, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { airtableService, PropertyListing } from '@/lib/airtable';
import { DashboardKPIs } from '@/types/airtable';
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
  ResponsiveContainer 
} from 'recharts';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Overview() {
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Get recent records
      const response = await airtableService.getRecords({
        pageSize: 100,
        sortField: 'ReceivedAt',
        sortDirection: 'desc'
      });

      const listings = response.records;
      
      // Calculate KPIs
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const newThisWeek = listings.filter(l => 
        l.receivedAt && l.receivedAt >= oneWeekAgo
      ).length;

      const withInspections = listings.filter(l => l.inspectionStart).length;
      
      const needsReview = listings.filter(l => 
        l.confidence !== undefined && l.confidence < 0.7
      ).length;

      const recentWithPrice = listings.filter(l => 
        l.price && l.receivedAt && l.receivedAt >= thirtyDaysAgo
      );
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
        if (listing.receivedAt && listing.receivedAt >= thirtyDaysAgo) {
          const dateStr = listing.receivedAt.toISOString().split('T')[0];
          if (dailyCounts[dateStr] !== undefined) {
            dailyCounts[dateStr]++;
          }
        }
      });

      const dailyChartData = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }));

      setDailyData(dailyChartData);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Listings by Suburb (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={suburbData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="suburb" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property Types</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={propertyTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, percent }) => 
                    percent > 0.05 ? `${type} ${(percent * 100).toFixed(0)}%` : ''
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {propertyTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Daily Listings (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en-AU')}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Button variant="outline" size="sm">
            View All Listings
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentListings.map((listing) => (
              <div key={listing.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{listing.address || 'Unknown Address'}</h4>
                    <Badge variant="outline">{listing.propertyType || 'Unknown'}</Badge>
                    {listing.confidence !== undefined && (
                      <ConfidenceBadge confidence={listing.confidence} />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <span>{listing.suburb || 'Unknown Suburb'}</span>
                    {listing.price && <span>{formatCurrency(listing.price)}</span>}
                    {listing.beds && <span>{listing.beds} bed{listing.beds !== 1 ? 's' : ''}</span>}
                    {listing.baths && <span>{listing.baths} bath{listing.baths !== 1 ? 's' : ''}</span>}
                    {listing.carSpaces && <span>{listing.carSpaces} car</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {listing.receivedAt && formatDate(listing.receivedAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {listing.sourceHost || 'Unknown Source'}
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