import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PropertyListing } from '@/lib/airtable';
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';

interface AdvancedAnalyticsProps {
  listings: PropertyListing[];
}

export function AdvancedAnalytics({ listings }: AdvancedAnalyticsProps) {
  const analytics = useMemo(() => {
    if (!listings.length) return null;

    // Calculate temporal metrics
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recent30 = listings.filter(l => l.receivedAt && new Date(l.receivedAt) >= last30Days);
    const previous30 = listings.filter(l => 
      l.receivedAt && 
      new Date(l.receivedAt) >= last60Days && 
      new Date(l.receivedAt) < last30Days
    );

    const velocityChange = previous30.length > 0 
      ? ((recent30.length - previous30.length) / previous30.length * 100) 
      : 0;

    // Price analytics
    const pricesWithData = listings.filter(l => l.price && l.price > 0).map(l => l.price!);
    const sortedPrices = pricesWithData.sort((a, b) => a - b);
    
    const median = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length / 2)] 
      : 0;
    
    const q1 = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length * 0.25)] 
      : 0;
    
    const q3 = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length * 0.75)] 
      : 0;

    // Quality metrics
    const withConfidence = listings.filter(l => l.confidence && l.confidence > 0);
    const avgConfidence = withConfidence.length > 0
      ? withConfidence.reduce((sum, l) => sum + l.confidence!, 0) / withConfidence.length
      : 0;

    const dataCompleteness = listings.length > 0 
      ? listings.reduce((sum, l) => {
          let fields = 0;
          let filledFields = 0;
          
          ['address', 'suburb', 'propertyType', 'price', 'beds', 'baths', 'agencyName'].forEach(field => {
            fields++;
            if (l[field as keyof PropertyListing]) filledFields++;
          });
          
          return sum + (filledFields / fields);
        }, 0) / listings.length * 100
      : 0;

    // Market insights
    const suburbCounts = listings.reduce((acc, l) => {
      const suburb = l.suburb || 'Unknown';
      acc[suburb] = (acc[suburb] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const marketSaturation = Object.values(suburbCounts).reduce((sum, count) => {
      return sum + (count > 10 ? 1 : 0);
    }, 0);

    return {
      velocity: {
        current: recent30.length,
        previous: previous30.length,
        change: velocityChange,
      },
      pricing: {
        median,
        q1,
        q3,
        range: q3 - q1,
      },
      quality: {
        avgConfidence: avgConfidence * 100,
        dataCompleteness,
      },
      market: {
        saturatedSuburbs: marketSaturation,
        totalSuburbs: Object.keys(suburbCounts).length,
      }
    };
  }, [listings]);

  if (!analytics) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Velocity</CardTitle>
          {analytics.velocity.change > 0 ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.velocity.current}</div>
          <div className="flex items-center text-xs text-muted-foreground">
            <Badge 
              variant={analytics.velocity.change > 0 ? "default" : "destructive"}
              className="mr-1"
            >
              {analytics.velocity.change > 0 ? '+' : ''}{analytics.velocity.change.toFixed(1)}%
            </Badge>
            vs previous 30 days
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Price Distribution</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${analytics.pricing.median.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">
            Median • IQR: ${analytics.pricing.range.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Q1: ${analytics.pricing.q1.toLocaleString()} • Q3: ${analytics.pricing.q3.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${analytics.quality.avgConfidence > 70 ? 'text-success' : analytics.quality.avgConfidence > 50 ? 'text-warning' : 'text-destructive'}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.quality.avgConfidence.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">
            Avg. Confidence
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Completeness: {analytics.quality.dataCompleteness.toFixed(1)}%
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Coverage</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.market.totalSuburbs}</div>
          <div className="text-xs text-muted-foreground">
            Total Suburbs
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {analytics.market.saturatedSuburbs} with 10+ listings
          </div>
        </CardContent>
      </Card>
    </div>
  );
}