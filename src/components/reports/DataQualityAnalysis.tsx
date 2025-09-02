import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PropertyListing } from '@/lib/airtable';
import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';

interface DataQualityAnalysisProps {
  listings: PropertyListing[];
}

export function DataQualityAnalysis({ listings }: DataQualityAnalysisProps) {
  const qualityMetrics = useMemo(() => {
    if (!listings.length) return null;

    // Field completeness analysis
    const fieldAnalysis = {
      required: [
        { field: 'address', label: 'Address', weight: 2 },
        { field: 'suburb', label: 'Suburb', weight: 2 },
        { field: 'price', label: 'Price', weight: 3 },
        { field: 'propertyType', label: 'Property Type', weight: 1 },
      ],
      important: [
        { field: 'beds', label: 'Bedrooms', weight: 1 },
        { field: 'baths', label: 'Bathrooms', weight: 1 },
        { field: 'agentName', label: 'Agent Name', weight: 1 },
        { field: 'agencyName', label: 'Agency Name', weight: 1 },
      ],
      optional: [
        { field: 'carSpaces', label: 'Car Spaces', weight: 0.5 },
        { field: 'landSize', label: 'Land Size', weight: 0.5 },
        { field: 'description', label: 'Description', weight: 0.5 },
        { field: 'images', label: 'Images', weight: 0.5 },
      ]
    };

    const calculateCompleteness = (fields: typeof fieldAnalysis.required) => {
      let totalWeight = 0;
      let filledWeight = 0;

      fields.forEach(({ field, weight }) => {
        totalWeight += weight;
        listings.forEach(listing => {
          const value = listing[field as keyof PropertyListing];
          if (value && 
              value !== 'Unknown' && 
              value !== 'Unknown Agent' && 
              value !== 'Unknown Agency' &&
              value !== 'Unknown Address' &&
              value !== 'Unknown Suburb') {
            if (field === 'price' && typeof value === 'number' && value > 0) {
              filledWeight += weight / listings.length;
            } else if (field !== 'price' && value) {
              filledWeight += weight / listings.length;
            }
          }
        });
      });

      return totalWeight > 0 ? (filledWeight / totalWeight) * 100 : 0;
    };

    // Data quality issues
    const issues = {
      duplicates: 0,
      invalidPrices: listings.filter(l => l.price && (l.price <= 0 || l.price > 50000000)).length,
      missingAgents: listings.filter(l => !l.agentName || l.agentName === 'Unknown Agent').length,
      missingLocations: listings.filter(l => !l.address || l.address === 'Unknown Address').length,
      lowConfidence: listings.filter(l => l.confidence && l.confidence < 0.5).length,
      missingDates: listings.filter(l => !l.receivedAt && !l.createdTime && !l.createdAt).length,
    };

    // Confidence distribution
    const confidenceDistribution = {
      high: listings.filter(l => l.confidence && l.confidence >= 0.8).length,
      medium: listings.filter(l => l.confidence && l.confidence >= 0.5 && l.confidence < 0.8).length,
      low: listings.filter(l => l.confidence && l.confidence < 0.5).length,
      unknown: listings.filter(l => !l.confidence).length,
    };

    return {
      completeness: {
        required: calculateCompleteness(fieldAnalysis.required),
        important: calculateCompleteness(fieldAnalysis.important),
        optional: calculateCompleteness(fieldAnalysis.optional),
      },
      issues,
      confidenceDistribution,
      totalListings: listings.length,
    };
  }, [listings]);

  if (!qualityMetrics) return null;

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCompletenessVariant = (percentage: number) => {
    if (percentage >= 80) return 'default';
    if (percentage >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Field Completeness */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Field Completeness
          </CardTitle>
          <CardDescription>
            Percentage of listings with complete data across different field categories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Required Fields</span>
                <span className={`text-sm font-bold ${getCompletenessColor(qualityMetrics.completeness.required)}`}>
                  {qualityMetrics.completeness.required.toFixed(1)}%
                </span>
              </div>
              <Progress value={qualityMetrics.completeness.required} className="h-2" />
              <p className="text-xs text-muted-foreground">Address, Suburb, Price, Property Type</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Important Fields</span>
                <span className={`text-sm font-bold ${getCompletenessColor(qualityMetrics.completeness.important)}`}>
                  {qualityMetrics.completeness.important.toFixed(1)}%
                </span>
              </div>
              <Progress value={qualityMetrics.completeness.important} className="h-2" />
              <p className="text-xs text-muted-foreground">Beds, Baths, Agent, Agency</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Optional Fields</span>
                <span className={`text-sm font-bold ${getCompletenessColor(qualityMetrics.completeness.optional)}`}>
                  {qualityMetrics.completeness.optional.toFixed(1)}%
                </span>
              </div>
              <Progress value={qualityMetrics.completeness.optional} className="h-2" />
              <p className="text-xs text-muted-foreground">Car Spaces, Land Size, Description</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Quality Issues */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Data Quality Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Invalid Prices</span>
                <Badge variant={qualityMetrics.issues.invalidPrices > 0 ? "destructive" : "secondary"}>
                  {qualityMetrics.issues.invalidPrices}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Missing Agents</span>
                <Badge variant={qualityMetrics.issues.missingAgents > 0 ? "destructive" : "secondary"}>
                  {qualityMetrics.issues.missingAgents}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Missing Locations</span>
                <Badge variant={qualityMetrics.issues.missingLocations > 0 ? "destructive" : "secondary"}>
                  {qualityMetrics.issues.missingLocations}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Low Confidence</span>
                <Badge variant={qualityMetrics.issues.lowConfidence > 0 ? "secondary" : "default"}>
                  {qualityMetrics.issues.lowConfidence}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Missing Dates</span>
                <Badge variant={qualityMetrics.issues.missingDates > 0 ? "destructive" : "secondary"}>
                  {qualityMetrics.issues.missingDates}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-info" />
              Confidence Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">High Confidence (≥80%)</span>
                <Badge variant="default">
                  {qualityMetrics.confidenceDistribution.high}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Medium Confidence (50-79%)</span>
                <Badge variant="secondary">
                  {qualityMetrics.confidenceDistribution.medium}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Low Confidence (&lt;50%)</span>
                <Badge variant="destructive">
                  {qualityMetrics.confidenceDistribution.low}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Unknown Confidence</span>
                <Badge variant="outline">
                  {qualityMetrics.confidenceDistribution.unknown}
                </Badge>
              </div>
            </div>
            
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Quality Score: {(
                  (qualityMetrics.completeness.required * 0.5 + 
                   qualityMetrics.completeness.important * 0.3 + 
                   qualityMetrics.completeness.optional * 0.2)
                ).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}