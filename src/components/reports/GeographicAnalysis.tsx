import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PropertyListing } from '@/lib/airtable';
import { Badge } from '@/components/ui/badge';

interface GeographicAnalysisProps {
  listings: PropertyListing[];
}

export function GeographicAnalysis({ listings }: GeographicAnalysisProps) {
  const geoData = useMemo(() => {
    const suburbStats = listings.reduce((acc, listing) => {
      const suburb = listing.suburb || 'Unknown';
      if (!acc[suburb]) {
        acc[suburb] = {
          count: 0,
          prices: [],
          totalPrice: 0,
          confidenceScores: [],
        };
      }
      
      acc[suburb].count++;
      if (listing.price && listing.price > 0) {
        acc[suburb].prices.push(listing.price);
        acc[suburb].totalPrice += listing.price;
      }
      if (listing.confidence) {
        acc[suburb].confidenceScores.push(listing.confidence);
      }
      
      return acc;
    }, {} as Record<string, { count: number; prices: number[]; totalPrice: number; confidenceScores: number[] }>);

    const suburbAnalysis = Object.entries(suburbStats).map(([suburb, stats]) => {
      const avgPrice = stats.prices.length > 0 ? stats.totalPrice / stats.prices.length : 0;
      const avgConfidence = stats.confidenceScores.length > 0 
        ? stats.confidenceScores.reduce((sum, c) => sum + c, 0) / stats.confidenceScores.length * 100 
        : 0;
      
      const priceVsVolume = avgPrice > 0 && stats.count > 0 ? avgPrice / stats.count : 0;
      
      return {
        suburb,
        count: stats.count,
        avgPrice: Math.round(avgPrice),
        avgConfidence: Math.round(avgConfidence),
        priceVsVolume: Math.round(priceVsVolume),
        marketActivity: stats.count > 5 ? 'High' : stats.count > 2 ? 'Medium' : 'Low',
      };
    }).sort((a, b) => b.count - a.count);

    return {
      topSuburbs: suburbAnalysis.slice(0, 12),
      priceVsVolume: suburbAnalysis.filter(s => s.avgPrice > 0).slice(0, 20),
    };
  }, [listings]);

  const chartConfig = {
    count: { label: "Listings", color: "hsl(var(--chart-1))" },
    avgPrice: { label: "Avg Price", color: "hsl(var(--chart-3))" },
    avgConfidence: { label: "Confidence", color: "hsl(var(--chart-4))" },
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Suburb Performance Matrix</CardTitle>
          <CardDescription>Top suburbs by listing volume with price and quality metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              {geoData.topSuburbs.slice(0, 8).map((suburb) => (
                <div key={suburb.suburb} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{suburb.suburb}</div>
                    <div className="text-sm text-muted-foreground">
                      {suburb.count} listings • ${suburb.avgPrice.toLocaleString()} avg
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      suburb.marketActivity === 'High' ? 'default' : 
                      suburb.marketActivity === 'Medium' ? 'secondary' : 'outline'
                    }>
                      {suburb.marketActivity}
                    </Badge>
                    <Badge 
                      variant={suburb.avgConfidence > 70 ? 'default' : suburb.avgConfidence > 50 ? 'secondary' : 'destructive'}
                    >
                      {suburb.avgConfidence}% conf.
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Suburb Volume Distribution</CardTitle>
            <CardDescription>Listing count by location</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geoData.topSuburbs.slice(0, 8)}>
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

        <Card>
          <CardHeader>
            <CardTitle>Price vs Volume Analysis</CardTitle>
            <CardDescription>Relationship between average price and listing volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart data={geoData.priceVsVolume}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="count" 
                    name="Listings"
                    type="number"
                  />
                  <YAxis 
                    dataKey="avgPrice" 
                    name="Avg Price"
                    type="number"
                    tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent 
                      formatter={(value: any, name: string) => {
                        if (name === 'avgPrice') return [`$${parseInt(value).toLocaleString()}`, 'Avg Price'];
                        return [value, 'Listings'];
                      }}
                    />} 
                  />
                  <Scatter 
                    dataKey="avgPrice" 
                    fill="hsl(var(--chart-3))"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}