import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  Loader2, 
  TrendingUp, 
  AlertTriangle, 
  Lightbulb,
  Target,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface ClientAIInsightsProps {
  clientId: string;
  clientName: string;
  portfolioValue: number;
  debt: number;
  cashFlow: number;
  propertyCount: number;
}

interface AIInsight {
  summary: string;
  strengths: string[];
  opportunities: string[];
  risks: string[];
  recommendations: string[];
}

export function ClientAIInsights({ 
  clientId, 
  clientName,
  portfolioValue, 
  debt, 
  cashFlow, 
  propertyCount 
}: ClientAIInsightsProps) {
  const [insights, setInsights] = useState<AIInsight | null>(null);

  // Fetch properties for deeper analysis
  const { data: properties = [] } = useQuery({
    queryKey: ['client-properties-ai', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties')
        .select('*')
        .eq('client_id', clientId);
      if (error) throw error;
      return data;
    }
  });

  const generateInsightsMutation = useMutation({
    mutationFn: async () => {
      const ltv = portfolioValue > 0 ? (debt / portfolioValue) * 100 : 0;
      const avgPropertyValue = propertyCount > 0 ? portfolioValue / propertyCount : 0;
      const totalRentalIncome = properties.reduce((sum, p) => sum + (Number(p.monthly_rental_income) || 0), 0);
      const grossYield = portfolioValue > 0 ? (totalRentalIncome * 12 / portfolioValue) * 100 : 0;

      const prompt = `Analyze this property investment portfolio and provide insights:

Client: ${clientName}
Portfolio Value: $${portfolioValue.toLocaleString()}
Total Debt: $${debt.toLocaleString()}
LTV Ratio: ${ltv.toFixed(1)}%
Properties: ${propertyCount}
Monthly Cash Flow: $${cashFlow.toLocaleString()}
Gross Yield: ${grossYield.toFixed(2)}%
Average Property Value: $${avgPropertyValue.toLocaleString()}

Property breakdown:
${properties.map(p => `- ${p.address}: Value $${Number(p.value).toLocaleString()}, Loan $${Number(p.loan_remaining).toLocaleString()}, Monthly Rent $${Number(p.monthly_rental_income).toLocaleString()}, Net Cash Flow $${Number(p.net_monthly_cashflow).toLocaleString()}`).join('\n')}

Provide a JSON response with this structure:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "risks": ["risk 1", "risk 2"],
  "recommendations": ["specific recommendation 1", "specific recommendation 2", "specific recommendation 3"]
}`;

      const { data, error } = await supabase.functions.invoke('report-qa', {
        body: {
          messages: [{ role: 'user', content: prompt }],
          context: `You are a property investment advisor. Analyze portfolios and provide actionable insights.`
        }
      });

      if (error) throw error;

      // Parse JSON from response
      const responseText = data.response || data.choices?.[0]?.message?.content;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse AI response');
      }

      return JSON.parse(jsonMatch[0]) as AIInsight;
    },
    onSuccess: (data) => {
      setInsights(data);
      toast.success('AI analysis complete');
    },
    onError: (error) => {
      toast.error('Failed to generate insights: ' + error.message);
    }
  });

  if (!insights) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Portfolio Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Get AI-powered analysis of this client's investment portfolio including strengths, 
            opportunities, risks, and recommendations.
          </p>
          <Button 
            onClick={() => generateInsightsMutation.mutate()}
            disabled={generateInsightsMutation.isPending}
            className="w-full gap-2"
          >
            {generateInsightsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing Portfolio...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate AI Insights
              </>
            )}
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
            <Sparkles className="h-4 w-4" />
            AI Portfolio Insights
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => generateInsightsMutation.mutate()}
            disabled={generateInsightsMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${generateInsightsMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-3 bg-secondary rounded-lg">
              <p className="text-sm">{insights.summary}</p>
            </div>

            {/* Strengths */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                <TrendingUp className="h-4 w-4" />
                Strengths
              </div>
              <ul className="space-y-1">
                {insights.strengths.map((strength, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-green-500 mt-1">•</span>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>

            {/* Opportunities */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <Lightbulb className="h-4 w-4" />
                Opportunities
              </div>
              <ul className="space-y-1">
                {insights.opportunities.map((opp, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    {opp}
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                Risks
              </div>
              <ul className="space-y-1">
                {insights.risks.map((risk, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-orange-500 mt-1">•</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-purple-600">
                <Target className="h-4 w-4" />
                Recommendations
              </div>
              <ul className="space-y-2">
                {insights.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm p-2 bg-purple-500/5 rounded-lg border border-purple-500/20">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
