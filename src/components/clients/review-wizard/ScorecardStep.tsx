import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Star, 
  ThumbsUp, 
  Minus, 
  ThumbsDown,
  Shield,
  Activity,
  AlertTriangle,
  Heart,
  Target,
  TrendingUp
} from 'lucide-react';
import type { PropertyScore } from './types';

// Extended interface to include isRental from the hook
interface ExtendedPropertyScore extends PropertyScore {
  isRental?: boolean;
}

interface ScorecardStepProps {
  overallScore: number;
  portfolioHealth: number;
  cashFlowScore: number;
  growthPotential: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  propertyScores: ExtendedPropertyScore[];
}

export function ScorecardStep({
  overallScore,
  portfolioHealth,
  cashFlowScore,
  growthPotential,
  riskLevel,
  riskFactors,
  propertyScores
}: ScorecardStepProps) {
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

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'low':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><Shield className="h-3 w-3 mr-1" />Low Risk</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Activity className="h-3 w-3 mr-1" />Medium Risk</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20"><AlertTriangle className="h-3 w-3 mr-1" />High Risk</Badge>;
      case 'critical':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Critical Risk</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getClassificationIcon = (classification: string) => {
    switch (classification) {
      case 'Star':
        return <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />;
      case 'Good':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'Average':
        return <Minus className="h-4 w-4 text-gray-500" />;
      case 'Underperformer':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getClassificationBadge = (classification: string, isRental?: boolean) => {
    // Rental properties get a special badge
    if (isRental) {
      return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Living Expense</Badge>;
    }
    switch (classification) {
      case 'Star':
        return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">Star Performer</Badge>;
      case 'Good':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Good</Badge>;
      case 'Average':
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Average</Badge>;
      case 'Underperformer':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Underperformer</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Portfolio Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className={`text-5xl font-bold ${getScoreColor(overallScore)}`}>
                {overallScore}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Overall Score</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {getRiskBadge(riskLevel)}
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Heart className="h-4 w-4 text-muted-foreground" />
                <span>Portfolio Health</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(portfolioHealth)} transition-all`}
                    style={{ width: `${portfolioHealth}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${getScoreColor(portfolioHealth)}`}>
                  {portfolioHealth}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span>Cash Flow</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(cashFlowScore)} transition-all`}
                    style={{ width: `${cashFlowScore}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${getScoreColor(cashFlowScore)}`}>
                  {Math.round(cashFlowScore)}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span>Growth Potential</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(growthPotential)} transition-all`}
                    style={{ width: `${growthPotential}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${getScoreColor(growthPotential)}`}>
                  {Math.round(growthPotential)}%
                </span>
              </div>
            </div>
          </div>

          {/* Risk Factors */}
          {riskFactors.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">Risk Factors</p>
              <div className="space-y-1">
                {riskFactors.map((factor, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-orange-600">
                    <AlertTriangle className="h-4 w-4" />
                    {factor}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Property Scores */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Property Rankings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {propertyScores
            .sort((a, b) => b.overallScore - a.overallScore)
            .map((prop, index) => (
            <div key={prop.propertyId} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                    #{index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{prop.address}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {!prop.isRental && getClassificationIcon(prop.classification)}
                      {getClassificationBadge(prop.classification, prop.isRental)}
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${getScoreColor(prop.overallScore)}`}>
                  {prop.overallScore}
                </div>
              </div>

              {/* Mini score bars */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Health: </span>
                  <span className="font-medium">{prop.healthScore}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cash Flow: </span>
                  <span className="font-medium">{Math.round(prop.cashFlowScore)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Growth: </span>
                  <span className="font-medium">{Math.round(prop.growthPotential)}%</span>
                </div>
              </div>

              {/* Strengths & Concerns */}
              <div className="flex gap-4 text-xs">
                {prop.strengths.length > 0 && (
                  <div className="flex-1">
                    <p className="text-muted-foreground mb-1">Strengths</p>
                    <div className="flex flex-wrap gap-1">
                      {prop.strengths.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-green-600 border-green-300 text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {prop.concerns.length > 0 && (
                  <div className="flex-1">
                    <p className="text-muted-foreground mb-1">Concerns</p>
                    <div className="flex flex-wrap gap-1">
                      {prop.concerns.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-red-600 border-red-300 text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {propertyScores.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No properties to score</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
