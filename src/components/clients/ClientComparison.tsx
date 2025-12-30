import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Scale, 
  Building2, 
  DollarSign, 
  TrendingUp,
  Percent,
  Users
} from 'lucide-react';

interface Client {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  total_portfolio_value: number;
  total_debt: number;
  net_monthly_cash_flow: number;
  client_properties?: { id: string }[];
}

interface ClientComparisonProps {
  clients: Client[];
}

export function ClientComparison({ clients }: ClientComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedClients = clients.filter(c => selectedIds.includes(c.id));

  // Fetch scores for selected clients
  const { data: scores = [] } = useQuery({
    queryKey: ['client-scores-comparison', selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];
      const { data, error } = await supabase
        .from('client_scores')
        .select('*')
        .in('client_id', selectedIds);
      if (error) throw error;
      return data;
    },
    enabled: selectedIds.length > 0
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getScoreForClient = (clientId: string) => {
    return scores.find(s => s.client_id === clientId);
  };

  const getHighestValue = (key: keyof Client) => {
    const values = selectedClients.map(c => Number(c[key]) || 0);
    return Math.max(...values);
  };

  const toggleClient = (clientId: string) => {
    setSelectedIds(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : prev.length < 4 ? [...prev, clientId] : prev
    );
  };

  const metrics = [
    { 
      key: 'total_portfolio_value' as const, 
      label: 'Portfolio Value', 
      icon: DollarSign, 
      format: formatCurrency,
      higherIsBetter: true 
    },
    { 
      key: 'total_debt' as const, 
      label: 'Total Debt', 
      icon: DollarSign, 
      format: formatCurrency,
      higherIsBetter: false 
    },
    { 
      key: 'net_monthly_cash_flow' as const, 
      label: 'Monthly Cash Flow', 
      icon: TrendingUp, 
      format: formatCurrency,
      higherIsBetter: true 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Client Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Select Clients to Compare (max 4)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.includes(client.id) 
                      ? 'bg-primary/5 border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleClient(client.id)}
                >
                  <Checkbox 
                    checked={selectedIds.includes(client.id)}
                    onCheckedChange={() => toggleClient(client.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {client.primary_first_name} {client.primary_surname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {client.client_properties?.length || 0} properties • {formatCurrency(Number(client.total_portfolio_value) || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedClients.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Select at least 2 clients to compare</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Client Headers */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedClients.length}, 1fr)` }}>
            {selectedClients.map((client) => (
              <Card key={client.id} className="text-center">
                <CardContent className="pt-4">
                  <h3 className="font-semibold">
                    {client.primary_first_name} {client.primary_surname}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                    <Building2 className="h-3 w-3" />
                    {client.client_properties?.length || 0} Properties
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Key Metrics Comparison */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Key Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {metrics.map((metric) => {
                const highest = getHighestValue(metric.key);
                
                return (
                  <div key={metric.key} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <metric.icon className="h-4 w-4" />
                      {metric.label}
                    </div>
                    <div 
                      className="grid gap-4" 
                      style={{ gridTemplateColumns: `repeat(${selectedClients.length}, 1fr)` }}
                    >
                      {selectedClients.map((client) => {
                        const value = Number(client[metric.key]) || 0;
                        const isHighest = value === highest && highest !== 0;
                        const allValues = selectedClients.map(c => Number(c[metric.key]) || 0);
                        const isBest = metric.higherIsBetter 
                          ? isHighest 
                          : (value === Math.min(...allValues));
                        
                        return (
                          <div 
                            key={client.id} 
                            className={`p-3 rounded-lg text-center ${isBest ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary'}`}
                          >
                            <p className={`font-semibold ${metric.key === 'net_monthly_cash_flow' ? (value >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                              {metric.format(value)}
                            </p>
                            {isBest && (
                              <Badge variant="secondary" className="mt-1 text-xs bg-green-500/10 text-green-600">
                                Best
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* LTV Comparison */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Percent className="h-4 w-4" />
                  LTV Ratio
                </div>
                <div 
                  className="grid gap-4" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, 1fr)` }}
                >
                  {selectedClients.map((client) => {
                    const ltv = Number(client.total_portfolio_value) > 0 
                      ? (Number(client.total_debt) / Number(client.total_portfolio_value)) * 100 
                      : 0;
                    const allLTVs = selectedClients.map(c => 
                      Number(c.total_portfolio_value) > 0 
                        ? (Number(c.total_debt) / Number(c.total_portfolio_value)) * 100 
                        : 0
                    );
                    const lowestLTV = Math.min(...allLTVs);
                    const isBest = ltv === lowestLTV;
                    
                    return (
                      <div 
                        key={client.id} 
                        className={`p-3 rounded-lg text-center ${isBest ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary'}`}
                      >
                        <p className={`font-semibold ${ltv > 80 ? 'text-red-600' : ltv > 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {ltv.toFixed(1)}%
                        </p>
                        {isBest && (
                          <Badge variant="secondary" className="mt-1 text-xs bg-green-500/10 text-green-600">
                            Best
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scores Comparison */}
          {scores.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Client Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="grid gap-4" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, 1fr)` }}
                >
                  {selectedClients.map((client) => {
                    const score = getScoreForClient(client.id);
                    
                    if (!score) {
                      return (
                        <div key={client.id} className="p-4 bg-secondary rounded-lg text-center">
                          <p className="text-sm text-muted-foreground">No score calculated</p>
                        </div>
                      );
                    }

                    const allOverallScores = scores.map(s => s.overall_score);
                    const highestScore = Math.max(...allOverallScores);
                    const isBest = score.overall_score === highestScore;
                    
                    return (
                      <div 
                        key={client.id} 
                        className={`p-4 rounded-lg ${isBest ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary'}`}
                      >
                        <div className="text-center mb-3">
                          <p className="text-3xl font-bold">{score.overall_score}</p>
                          <p className="text-xs text-muted-foreground">Overall Score</p>
                          {isBest && (
                            <Badge variant="secondary" className="mt-1 text-xs bg-green-500/10 text-green-600">
                              Highest
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Portfolio Health</span>
                            <span className="font-medium">{score.portfolio_health}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash Flow</span>
                            <span className="font-medium">{score.cash_flow_score}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Growth Potential</span>
                            <span className="font-medium">{score.growth_potential}%</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t">
                            <span className="text-muted-foreground">Risk Level</span>
                            <Badge 
                              variant="outline"
                              className={
                                score.risk_level === 'low' ? 'text-green-600' :
                                score.risk_level === 'medium' ? 'text-yellow-600' :
                                score.risk_level === 'high' ? 'text-orange-600' :
                                'text-red-600'
                              }
                            >
                              {score.risk_level}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}