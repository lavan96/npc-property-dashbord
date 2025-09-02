import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PropertyListing } from '@/lib/airtable';
import { format, subDays, eachDayOfInterval } from 'date-fns';

interface TemporalAnalysisProps {
  listings: PropertyListing[];
}

export function TemporalAnalysis({ listings }: TemporalAnalysisProps) {
  const temporalData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    
    console.log('TemporalAnalysis: Total listings:', listings.length);
    console.log('TemporalAnalysis: Sample listing:', listings[0]);
    console.log('TemporalAnalysis: Listings with receivedAt:', listings.filter(l => l.receivedAt).length);
    
    const dailyData = eachDayOfInterval({ start: startDate, end: endDate }).map(date => {
      const dayListings = listings.filter(listing => {
        // Try multiple date fields as fallback
        const dateToCheck = listing.receivedAt || listing.createdTime || listing.listingDate;
        if (!dateToCheck) return false;
        
        const listingDate = new Date(dateToCheck);
        return format(listingDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
      });

      const avgPrice = dayListings.length > 0 && dayListings.some(l => l.price)
        ? dayListings.filter(l => l.price).reduce((sum, l) => sum + (l.price || 0), 0) / dayListings.filter(l => l.price).length
        : null;

      return {
        date: format(date, 'MMM dd'),
        listings: dayListings.length,
        avgPrice: avgPrice ? Math.round(avgPrice) : null,
        confidenceScore: dayListings.length > 0 
          ? Math.round(dayListings.reduce((sum, l) => sum + (l.confidence || 0), 0) / dayListings.length * 100)
          : null,
      };
    });

    return dailyData;
  }, [listings]);

  const chartConfig = {
    listings: {
      label: "Listings",
      color: "hsl(var(--chart-2))",
    },
    avgPrice: {
      label: "Avg Price",
      color: "hsl(var(--chart-3))",
    },
    confidenceScore: {
      label: "Confidence",
      color: "hsl(var(--chart-4))",
    },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily Listing Activity (Last 30 Days)</CardTitle>
          <CardDescription>Trend analysis of listing volume over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={temporalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="listings" 
                    stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Average Daily Pricing Trends</CardTitle>
            <CardDescription>Price movements over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temporalData.filter(d => d.avgPrice !== null)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent 
                      formatter={(value: any) => [`$${parseInt(value).toLocaleString()}`, 'Avg Price']}
                    />} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgPrice" 
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Data Confidence</CardTitle>
            <CardDescription>Quality score trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={temporalData.filter(d => d.confidenceScore !== null)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis domain={[0, 100]} />
                  <ChartTooltip 
                    content={<ChartTooltipContent 
                      formatter={(value: any) => [`${value}%`, 'Confidence']}
                    />} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="confidenceScore" 
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}