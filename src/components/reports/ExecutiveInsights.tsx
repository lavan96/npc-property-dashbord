import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PropertyListing } from '@/lib/airtable';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ExecutiveInsightsProps {
  listings: PropertyListing[];
}

export function ExecutiveInsights({ listings }: ExecutiveInsightsProps) {
  const insights = useMemo(() => {
    if (!listings.length) return { insights: [], recommendations: [], anomalies: [] };

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recent7 = listings.filter(l => l.receivedAt && new Date(l.receivedAt) >= last7Days);
    const recent30 = listings.filter(l => l.receivedAt && new Date(l.receivedAt) >= last30Days);
    
    // Market insights
    const weeklyVelocity = (recent7.length / 7) * 7; // Weekly rate
    const monthlyVelocity = (recent30.length / 30) * 30; // Monthly rate
    
    const pricesWithData = listings.filter(l => l.price && l.price > 0);
    const avgPrice = pricesWithData.length > 0 
      ? pricesWithData.reduce((sum, l) => sum + l.price!, 0) / pricesWithData.length
      : 0;
    
    const recentPrices = recent30.filter(l => l.price && l.price > 0);
    const recentAvgPrice = recentPrices.length > 0
      ? recentPrices.reduce((sum, l) => sum + l.price!, 0) / recentPrices.length
      : 0;
    
    const priceChange = avgPrice > 0 && recentAvgPrice > 0 
      ? ((recentAvgPrice - avgPrice) / avgPrice * 100)
      : 0;
    
    // Quality insights
    const withConfidence = listings.filter(l => l.confidence && l.confidence > 0);
    const avgConfidence = withConfidence.length > 0
      ? withConfidence.reduce((sum, l) => sum + l.confidence!, 0) / withConfidence.length * 100
      : 0;
    
    const lowConfidenceListings = listings.filter(l => l.confidence && l.confidence < 0.5).length;
    
    // Market coverage
    const suburbanData = listings.reduce((acc, l) => {
      const suburb = l.suburb || 'Unknown';
      acc[suburb] = (acc[suburb] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topSuburbs = Object.entries(suburbanData)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    const marketConcentration = topSuburbs.reduce((sum, [, count]) => sum + count, 0) / listings.length * 100;
    
    // Generate insights
    const generatedInsights = [];
    const recommendations = [];
    const anomalies = [];
    
    // Velocity insights
    if (weeklyVelocity > monthlyVelocity * 1.2) {
      generatedInsights.push({
        type: 'positive',
        title: 'Accelerating Market Activity',
        description: `Weekly listing velocity (${weeklyVelocity.toFixed(1)}) is 20% above monthly average, indicating increased market activity.`,
      });
    } else if (weeklyVelocity < monthlyVelocity * 0.8) {
      generatedInsights.push({
        type: 'warning',
        title: 'Slowing Market Activity',
        description: `Weekly listing velocity (${weeklyVelocity.toFixed(1)}) is 20% below monthly average, suggesting market slowdown.`,
      });
    }
    
    // Price insights
    if (Math.abs(priceChange) > 5) {
      generatedInsights.push({
        type: priceChange > 0 ? 'positive' : 'negative',
        title: `${priceChange > 0 ? 'Price Appreciation' : 'Price Correction'}`,
        description: `Recent listings show ${Math.abs(priceChange).toFixed(1)}% ${priceChange > 0 ? 'increase' : 'decrease'} in average pricing.`,
      });
    }
    
    // Quality insights
    if (avgConfidence < 60) {
      generatedInsights.push({
        type: 'warning',
        title: 'Data Quality Concerns',
        description: `Average confidence score is ${avgConfidence.toFixed(1)}%. Consider reviewing data sources and extraction processes.`,
      });
      
      recommendations.push({
        priority: 'high',
        title: 'Improve Data Quality',
        description: `${lowConfidenceListings} listings have low confidence scores. Review and enhance data collection processes.`,
      });
    }
    
    // Market concentration
    if (marketConcentration > 50) {
      anomalies.push({
        severity: 'medium',
        title: 'High Market Concentration',
        description: `${marketConcentration.toFixed(1)}% of listings are concentrated in top 5 suburbs: ${topSuburbs.map(([suburb]) => suburb).join(', ')}.`,
      });
      
      recommendations.push({
        priority: 'medium',
        title: 'Diversify Market Coverage',
        description: 'Consider expanding data collection to more diverse geographic areas to reduce market concentration risk.',
      });
    }
    
    // Data completeness
    const incompleteListings = listings.filter(l => 
      !l.price || !l.suburb || !l.propertyType || !l.beds
    ).length;
    
    if (incompleteListings > listings.length * 0.2) {
      recommendations.push({
        priority: 'high',
        title: 'Address Data Completeness',
        description: `${incompleteListings} listings (${(incompleteListings/listings.length*100).toFixed(1)}%) have missing critical fields.`,
      });
    }
    
    return { insights: generatedInsights, recommendations, anomalies };
  }, [listings]);

  return (
    <div className="space-y-6">
      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
          <CardDescription>AI-generated insights from your property data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.insights.length > 0 ? (
              insights.insights.map((insight, index) => (
                <Alert key={index} className={`border-l-4 ${
                  insight.type === 'positive' ? 'border-l-success' : 
                  insight.type === 'warning' ? 'border-l-warning' : 'border-l-destructive'
                }`}>
                  <div className="flex items-start gap-2">
                    {insight.type === 'positive' && <TrendingUp className="h-4 w-4 text-success mt-0.5" />}
                    {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />}
                    {insight.type === 'negative' && <TrendingDown className="h-4 w-4 text-destructive mt-0.5" />}
                    <div className="flex-1">
                      <div className="font-medium text-sm">{insight.title}</div>
                      <AlertDescription className="text-xs mt-1">
                        {insight.description}
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))
            ) : (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  No significant market patterns detected. Continue monitoring for trend development.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
            <CardDescription>Recommended actions based on data analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.recommendations.length > 0 ? (
                insights.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                    <CheckCircle className={`h-4 w-4 mt-0.5 ${
                      rec.priority === 'high' ? 'text-destructive' : 
                      rec.priority === 'medium' ? 'text-warning' : 'text-success'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-sm">{rec.title}</div>
                        <Badge variant={
                          rec.priority === 'high' ? 'destructive' : 
                          rec.priority === 'medium' ? 'secondary' : 'default'
                        } className="text-xs">
                          {rec.priority}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{rec.description}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No specific actions required at this time.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Anomalies */}
        <Card>
          <CardHeader>
            <CardTitle>Market Observations</CardTitle>
            <CardDescription>Notable patterns and anomalies detected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.anomalies.length > 0 ? (
                insights.anomalies.map((anomaly, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                      anomaly.severity === 'high' ? 'text-destructive' : 
                      anomaly.severity === 'medium' ? 'text-warning' : 'text-muted-foreground'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-sm">{anomaly.title}</div>
                        <Badge variant="outline" className="text-xs">
                          {anomaly.severity}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{anomaly.description}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No significant anomalies detected in current data.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}