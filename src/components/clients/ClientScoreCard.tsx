import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Shield, 
  Activity,
  RefreshCw,
  Loader2,
  Heart,
  Target,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface ClientScoreCardProps {
  clientId: string;
}

export function ClientScoreCard({ clientId }: ClientScoreCardProps) {
  const queryClient = useQueryClient();

  // Fetch client data
  const { data: clientData } = useQuery({
    queryKey: ['client-score-data', clientId],
    queryFn: async () => {
      const [clientRes, propertiesRes] = await Promise.all([
        supabase.from('clients').select('total_portfolio_value, total_debt, net_monthly_cash_flow').eq('id', clientId).single(),
        supabase.from('client_properties').select('id').eq('client_id', clientId)
      ]);
      if (clientRes.error) throw clientRes.error;
      return {
        portfolioValue: Number(clientRes.data?.total_portfolio_value) || 0,
        debt: Number(clientRes.data?.total_debt) || 0,
        cashFlow: Number(clientRes.data?.net_monthly_cash_flow) || 0,
        propertyCount: propertiesRes.data?.length || 0
      };
    }
  });

  const { data: scores, isLoading } = useQuery({
    queryKey: ['client-scores', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_scores')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const portfolioValue = clientData?.portfolioValue || 0;
  const debt = clientData?.debt || 0;
  const cashFlow = clientData?.cashFlow || 0;
  const propertyCount = clientData?.propertyCount || 0;

  const calculateScoreMutation = useMutation({
    mutationFn: async () => {
      // Calculate scores based on client data
      const ltv = portfolioValue > 0 ? (debt / portfolioValue) * 100 : 0;
      const portfolioHealth = Math.min(100, Math.max(0, 100 - ltv));
      const cashFlowScore = cashFlow >= 0 
        ? Math.min(100, 50 + (cashFlow / 100)) 
        : Math.max(0, 50 + (cashFlow / 50));
      const growthPotential = Math.min(100, propertyCount * 20 + (portfolioHealth * 0.3));
      const overallScore = Math.round((portfolioHealth * 0.4 + cashFlowScore * 0.4 + growthPotential * 0.2));

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      const riskFactors: string[] = [];

      if (ltv > 80) {
        riskLevel = 'critical';
        riskFactors.push('LTV ratio exceeds 80%');
      } else if (ltv > 60) {
        riskLevel = 'high';
        riskFactors.push('LTV ratio is elevated');
      } else if (ltv > 40) {
        riskLevel = 'medium';
      }

      if (cashFlow < 0) {
        riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
        riskFactors.push('Negative cash flow');
      }

      if (propertyCount === 0) {
        riskFactors.push('No investment properties');
      }

      const scoreData = {
        client_id: clientId,
        overall_score: overallScore,
        portfolio_health: Math.round(portfolioHealth),
        cash_flow_score: Math.round(cashFlowScore),
        growth_potential: Math.round(growthPotential),
        risk_level: riskLevel,
        risk_factors: riskFactors,
        last_calculated_at: new Date().toISOString(),
        calculation_notes: `Auto-calculated from portfolio data. LTV: ${ltv.toFixed(1)}%`
      };

      const { data, error } = await supabase
        .from('client_scores')
        .upsert(scoreData, { onConflict: 'client_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-scores', clientId] });
      toast.success('Score calculated successfully');
    },
    onError: (error) => {
      toast.error('Failed to calculate score: ' + error.message);
    }
  });

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scores) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Client Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            No score calculated yet. Calculate to see portfolio health and risk assessment.
          </p>
          <Button 
            onClick={() => calculateScoreMutation.mutate()}
            disabled={calculateScoreMutation.isPending}
            size="sm"
            className="w-full"
          >
            {calculateScoreMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Calculate Score
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Client Score
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => calculateScoreMutation.mutate()}
                  disabled={calculateScoreMutation.isPending}
                >
                  <RefreshCw className={`h-4 w-4 ${calculateScoreMutation.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recalculate Score</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="text-center">
          <div className={`text-4xl font-bold ${getScoreColor(scores.overall_score)}`}>
            {scores.overall_score}
          </div>
          <p className="text-xs text-muted-foreground">Overall Score</p>
        </div>

        {/* Risk Badge */}
        <div className="flex justify-center">
          {getRiskBadge(scores.risk_level)}
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                Portfolio Health
              </span>
              <span className="font-medium">{scores.portfolio_health}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full ${getProgressColor(scores.portfolio_health)} transition-all`}
                style={{ width: `${scores.portfolio_health}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                {scores.cash_flow_score >= 50 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                Cash Flow Score
              </span>
              <span className="font-medium">{scores.cash_flow_score}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full ${getProgressColor(scores.cash_flow_score)} transition-all`}
                style={{ width: `${scores.cash_flow_score}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                Growth Potential
              </span>
              <span className="font-medium">{scores.growth_potential}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={`h-full ${getProgressColor(scores.growth_potential)} transition-all`}
                style={{ width: `${scores.growth_potential}%` }}
              />
            </div>
          </div>
        </div>

        {/* Risk Factors */}
        {scores.risk_factors && (scores.risk_factors as string[]).length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Risk Factors</p>
            <ul className="space-y-1">
              {(scores.risk_factors as string[]).map((factor, i) => (
                <li key={i} className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
