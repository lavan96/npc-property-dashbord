import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { smartCapitalize } from '@/lib/nameUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Scale, 
  Building2, 
  DollarSign, 
  TrendingUp,
  Percent,
  Users,
  Search,
  Star,
  X
} from 'lucide-react';

interface Client {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  total_portfolio_value: number;
  total_debt: number;
  net_monthly_cash_flow: number;
  client_properties?: { id: string }[];
  is_favorite?: boolean;
}

interface ClientComparisonProps {
  clients: Client[];
}

export function ClientComparison({ clients }: ClientComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  // Filter client list by search + active toggle
  const filteredClients = useMemo(() => {
    let list = clients;
    if (showActiveOnly) {
      list = list.filter(c => c.is_favorite);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => {
        const name = `${c.primary_first_name} ${c.primary_surname}`.toLowerCase();
        const email = c.primary_email?.toLowerCase() || '';
        return name.includes(q) || email.includes(q);
      });
    }
    return list;
  }, [clients, searchQuery, showActiveOnly]);

  const selectedClients = clients.filter(c => selectedIds.includes(c.id));

  const activeClientCount = clients.filter(c => c.is_favorite).length;

  // Fetch scores for selected clients via secure edge function
  const { data: scores = [] } = useQuery({
    queryKey: ['client-scores-comparison', selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'client_scores',
          select: '*',
          filters: { client_id: selectedIds },
        }
      });
      if (error) {
        console.warn('[ClientComparison] Failed to fetch scores:', error.message);
        return [];
      }
      return (data?.records || []) as any[];
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
    return scores.find((s: any) => s.client_id === clientId);
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

  const clearSelection = () => setSelectedIds([]);

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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Select Clients to Compare (max 4)
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs gap-1">
                  <X className="h-3 w-3" />
                  Clear ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search and Active filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button
              variant={showActiveOnly ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setShowActiveOnly(!showActiveOnly)}
            >
              <Star className={`h-3.5 w-3.5 ${showActiveOnly ? 'fill-current' : ''}`} />
              Active Clients
              {activeClientCount > 0 && (
                <Badge variant={showActiveOnly ? 'secondary' : 'outline'} className="h-4 px-1 text-[10px]">
                  {activeClientCount}
                </Badge>
              )}
            </Button>
          </div>

          <ScrollArea className="h-[200px]">
            {filteredClients.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {showActiveOnly
                  ? 'No active clients found. Star clients to mark them as active.'
                  : 'No clients match your search.'
                }
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {filteredClients.map((client) => (
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
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-sm truncate">
                          {smartCapitalize(client.primary_first_name)} {smartCapitalize(client.primary_surname)}
                        </p>
                        {client.is_favorite && (
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {client.client_properties?.length || 0} properties • {formatCurrency(Number(client.total_portfolio_value) || 0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedClients.length < 2 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Select at least 2 clients to compare</p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedClients.length === 1 ? '1 selected — pick one more' : 'Choose from the list above'}
            </p>
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
                    {smartCapitalize(client.primary_first_name)} {smartCapitalize(client.primary_surname)}
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

              {/* Equity Comparison */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  Net Equity
                </div>
                <div 
                  className="grid gap-4" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, 1fr)` }}
                >
                  {selectedClients.map((client) => {
                    const equity = (Number(client.total_portfolio_value) || 0) - (Number(client.total_debt) || 0);
                    const allEquity = selectedClients.map(c => (Number(c.total_portfolio_value) || 0) - (Number(c.total_debt) || 0));
                    const isBest = equity === Math.max(...allEquity) && equity !== 0;
                    
                    return (
                      <div 
                        key={client.id} 
                        className={`p-3 rounded-lg text-center ${isBest ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary'}`}
                      >
                        <p className={`font-semibold ${equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(equity)}
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

                    const allOverallScores = scores.map((s: any) => s.overall_score);
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