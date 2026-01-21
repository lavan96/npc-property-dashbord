import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { PropertyDataQuality } from './types';

interface DataCompletenessStepProps {
  overallScore: number;
  propertyData: PropertyDataQuality[];
  totalMissingFields: number;
  criticalIssues: number;
}

export function DataCompletenessStep({
  overallScore,
  propertyData,
  totalMissingFields,
  criticalIssues
}: DataCompletenessStepProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Data Quality Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-4xl font-bold ${getScoreColor(overallScore)}`}>
                {overallScore}%
              </div>
              <p className="text-sm text-muted-foreground">Overall Completeness</p>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 justify-end">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">{totalMissingFields} missing fields</span>
              </div>
              {criticalIssues > 0 && (
                <div className="flex items-center gap-2 justify-end">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">{criticalIssues} critical issues</span>
                </div>
              )}
            </div>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full ${getProgressColor(overallScore)} transition-all`}
              style={{ width: `${overallScore}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Property-level breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Property Data Quality</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {propertyData.map((prop) => (
            <div key={prop.propertyId} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{prop.address}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {prop.isRental && (
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
                        Rental (Living Expense)
                      </Badge>
                    )}
                    {prop.isOwnerOccupied && (
                      <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-xs">
                        Owner Occupied
                      </Badge>
                    )}
                    {!prop.isRental && !prop.isOwnerOccupied && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                        Investment
                      </Badge>
                    )}
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className={prop.completenessScore >= 80 ? 'text-green-600 border-green-300' : 
                    prop.completenessScore >= 60 ? 'text-yellow-600 border-yellow-300' :
                    'text-red-600 border-red-300'}
                >
                  {prop.completenessScore}%
                </Badge>
              </div>

              <Progress value={prop.completenessScore} className="h-2" />

              {/* Issues */}
              {prop.issues.length > 0 && (
                <div className="space-y-1">
                  {prop.issues.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}

              {/* Missing Fields */}
              {prop.missingFields.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Missing required fields:</p>
                  <div className="flex flex-wrap gap-1">
                    {prop.missingFields.map((field, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {prop.warnings.length > 0 && (
                <div className="space-y-1">
                  {prop.warnings.slice(0, 3).map((warning, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-yellow-600">
                      <Info className="h-3 w-3" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {/* All complete */}
              {prop.issues.length === 0 && prop.missingFields.length === 0 && prop.warnings.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  All data complete
                </div>
              )}
            </div>
          ))}

          {propertyData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No properties to analyze</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
