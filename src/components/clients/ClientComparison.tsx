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
  Sparkles,
  UserCheck,
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
      <Card className="relative overflow-hidden rounded-3xl border-amber-400/15 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.13),transparent_32%),linear-gradient(145deg,rgba(24,24,27,0.95),rgba(3,7,18,0.9))] shadow-2xl shadow-black/25">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
        <CardHeader className="border-b border-white/10 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-100">
                <Sparkles className="h-3.5 w-3.5" />
                Benchmark workspace
              </div>
              <CardTitle className="flex items-center gap-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/15 text-amber-100 shadow-lg shadow-amber-950/20">
                  <Users className="h-5 w-5" />
                </span>
                Select Clients to Compare
              </CardTitle>
              <p className="max-w-2xl text-sm leading-6 text-slate-400">
                Search and filter your client list, then choose a focused cohort for side-by-side portfolio benchmarking.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300">
                <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.65)]" />
                Max 4 clients · {selectedIds.length}/4 selected
              </div>
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-9 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.07] hover:text-white">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Clear ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-5">
          {/* Search and Active filter */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-100/55" />
              <Input
                placeholder="Search clients by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 rounded-2xl border-amber-300/15 bg-black/20 pl-11 pr-4 text-sm text-white shadow-inner shadow-black/20 placeholder:text-slate-500 transition-colors focus-visible:border-amber-300/45 focus-visible:ring-amber-300/25"
              />
            </div>
            <Button
              variant={showActiveOnly ? 'default' : 'outline'}
              size="sm"
              className={`h-12 shrink-0 gap-2 rounded-2xl px-4 text-sm font-semibold transition-all ${
                showActiveOnly
                  ? 'border-amber-300/30 bg-gradient-to-r from-amber-300 to-yellow-500 text-black shadow-lg shadow-amber-500/20 hover:from-amber-200 hover:to-yellow-400'
                  : 'border-white/10 bg-white/[0.035] text-slate-300 hover:border-amber-300/30 hover:bg-amber-300/10 hover:text-amber-100'
              }`}
              onClick={() => setShowActiveOnly(!showActiveOnly)}
            >
              <Star className={`h-4 w-4 ${showActiveOnly ? 'fill-current' : ''}`} />
              Active Clients
              {activeClientCount > 0 && (
                <Badge variant={showActiveOnly ? 'secondary' : 'outline'} className={`h-5 rounded-full px-2 text-[10px] font-bold ${showActiveOnly ? 'border-black/10 bg-black/10 text-black' : 'border-amber-300/25 bg-amber-300/10 text-amber-100'}`}>
                  {activeClientCount}
                </Badge>
              )}
            </Button>
          </div>

          <ScrollArea className="h-[280px] rounded-2xl border border-white/10 bg-black/15 p-3 shadow-inner shadow-black/25">
            {filteredClients.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300/20 bg-amber-300/[0.03] px-6 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-100">
                  <Search className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {showActiveOnly
                    ? 'No active clients found'
                    : 'No clients match your search'
                  }
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  {showActiveOnly
                    ? 'Star clients to mark them as active, or turn off the Active Clients filter.'
                    : 'Try a different name or email to build your comparison cohort.'
                  }
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredClients.map((client) => {
                  const isSelected = selectedIds.includes(client.id);

                  return (
                    <div
                      key={client.id}
                      className={`group flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition-all duration-300 ${
                        isSelected
                          ? 'border-amber-300/70 bg-amber-300/12 shadow-lg shadow-amber-500/20 ring-1 ring-amber-200/30'
                          : 'border-white/10 bg-white/[0.035] opacity-90 hover:-translate-y-0.5 hover:border-amber-300/30 hover:bg-white/[0.06] hover:opacity-100'
                      }`}
                      onClick={() => toggleClient(client.id)}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors ${isSelected ? 'border-amber-200/60 bg-amber-300/20 text-amber-100' : 'border-white/10 bg-black/20 text-slate-500 group-hover:text-amber-100'}`}>
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleClient(client.id)}
                          className="border-current data-[state=checked]:border-amber-300 data-[state=checked]:bg-amber-400 data-[state=checked]:text-black"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={`truncate text-sm font-semibold ${isSelected ? 'text-amber-50' : 'text-slate-200'}`}>
                            {smartCapitalize(client.primary_first_name)} {smartCapitalize(client.primary_surname)}
                          </p>
                          {client.is_favorite && (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {client.primary_email || 'No email on file'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{client.client_properties?.length || 0} properties</span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">{formatCurrency(Number(client.total_portfolio_value) || 0)}</span>
                        </div>
                      </div>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${isSelected ? 'border-amber-200/50 bg-amber-300 text-black shadow-[0_0_18px_rgba(251,191,36,0.45)]' : 'border-white/10 bg-black/20 text-slate-600 group-hover:text-slate-300'}`}>
                        {isSelected ? selectedIds.indexOf(client.id) + 1 : '+'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedClients.length < 2 ? (
        <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.1),transparent_42%),linear-gradient(145deg,rgba(24,24,27,0.9),rgba(3,7,18,0.86))] shadow-xl shadow-black/20">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-300/20 bg-amber-300/10 text-amber-100 shadow-2xl shadow-amber-950/25">
              <Scale className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold tracking-tight text-white">Comparison workspace ready</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Select at least 2 clients to compare. Your benchmarking results will appear here as soon as the minimum selection is met.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300">
              <UserCheck className="h-3.5 w-3.5 text-amber-200" />
              {selectedClients.length === 1 ? '1 selected — pick one more' : 'Choose from the list above'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.55),rgba(3,7,18,0.45))] p-3 shadow-xl shadow-black/15 sm:p-4">
          {/* Client Headers */}
          <div className="grid gap-4 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${selectedClients.length}, minmax(180px, 1fr))` }}>
            {selectedClients.map((client) => (
              <Card key={client.id} className="min-w-[180px] rounded-2xl border-amber-300/25 bg-amber-300/10 text-center shadow-lg shadow-amber-950/15">
                <CardContent className="pt-4">
                  <h3 className="font-semibold text-amber-50">
                    {smartCapitalize(client.primary_first_name)} {smartCapitalize(client.primary_surname)}
                  </h3>
                  <p className="mt-1 flex items-center justify-center gap-1 text-sm text-amber-100/70">
                    <Building2 className="h-3 w-3" />
                    {client.client_properties?.length || 0} Properties
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Key Metrics Comparison */}
          <Card className="rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.86))] shadow-xl shadow-black/20">
            <CardHeader className="border-b border-white/10 pb-3">
              <CardTitle className="text-sm font-semibold text-white">Key Metrics</CardTitle>
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
                      className="grid gap-4 overflow-x-auto pb-1" 
                      style={{ gridTemplateColumns: `repeat(${selectedClients.length}, minmax(160px, 1fr))` }}
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
                            className={`min-w-[160px] rounded-2xl p-3 text-center ${isBest ? 'border border-emerald-300/25 bg-emerald-400/10 shadow-lg shadow-emerald-950/10' : 'border border-white/10 bg-white/[0.04]'}`}
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
                  className="grid gap-4 overflow-x-auto pb-1" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, minmax(180px, 1fr))` }}
                >
                  {selectedClients.map((client) => {
                    const equity = (Number(client.total_portfolio_value) || 0) - (Number(client.total_debt) || 0);
                    const allEquity = selectedClients.map(c => (Number(c.total_portfolio_value) || 0) - (Number(c.total_debt) || 0));
                    const isBest = equity === Math.max(...allEquity) && equity !== 0;
                    
                    return (
                      <div 
                        key={client.id} 
                        className={`min-w-[160px] rounded-2xl p-3 text-center ${isBest ? 'border border-emerald-300/25 bg-emerald-400/10 shadow-lg shadow-emerald-950/10' : 'border border-white/10 bg-white/[0.04]'}`}
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
                  className="grid gap-4 overflow-x-auto pb-1" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, minmax(180px, 1fr))` }}
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
                        className={`min-w-[160px] rounded-2xl p-3 text-center ${isBest ? 'border border-emerald-300/25 bg-emerald-400/10 shadow-lg shadow-emerald-950/10' : 'border border-white/10 bg-white/[0.04]'}`}
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
            <Card className="rounded-3xl border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.92),rgba(3,7,18,0.86))] shadow-xl shadow-black/20">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="text-sm font-semibold text-white">Client Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="grid gap-4 overflow-x-auto pb-1" 
                  style={{ gridTemplateColumns: `repeat(${selectedClients.length}, minmax(180px, 1fr))` }}
                >
                  {selectedClients.map((client) => {
                    const score = getScoreForClient(client.id);
                    
                    if (!score) {
                      return (
                        <div key={client.id} className="min-w-[180px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
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
                        className={`min-w-[180px] rounded-2xl p-4 ${isBest ? 'border border-emerald-300/25 bg-emerald-400/10 shadow-lg shadow-emerald-950/10' : 'border border-white/10 bg-white/[0.04]'}`}
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