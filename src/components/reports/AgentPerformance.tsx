import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PropertyListing } from '@/lib/airtable';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface AgentPerformanceProps {
  listings: PropertyListing[];
}

export function AgentPerformance({ listings }: AgentPerformanceProps) {
  const agentData = useMemo(() => {
    const agentStats = listings.reduce((acc, listing) => {
      // Enhanced agent/agency name extraction with better fallbacks
      const agentName = listing.agentName || listing.agent || 'Unknown Agent';
      const agencyName = listing.agencyName || 'Unknown Agency';
      
      if (!acc[agentName]) {
        acc[agentName] = {
          count: 0,
          totalValue: 0,
          listings: [],
          agency: agencyName,
          priceRange: { min: Infinity, max: 0 },
        };
      }
      
      acc[agentName].count++;
      acc[agentName].listings.push(listing);
      
      if (listing.price && listing.price > 0) {
        acc[agentName].totalValue += listing.price;
        acc[agentName].priceRange.min = Math.min(acc[agentName].priceRange.min, listing.price);
        acc[agentName].priceRange.max = Math.max(acc[agentName].priceRange.max, listing.price);
      }
      
      return acc;
    }, {} as Record<string, { 
      count: number; 
      totalValue: number; 
      listings: PropertyListing[]; 
      agency: string;
      priceRange: { min: number; max: number };
    }>);

    const agentAnalysis = Object.entries(agentStats)
      .map(([agentName, stats]) => {
        const avgPrice = stats.count > 0 && stats.totalValue > 0 ? stats.totalValue / stats.count : 0;
        const efficiency = stats.count > 0 ? stats.totalValue / stats.count : 0;
        
        return {
          agentName,
          agency: stats.agency,
          count: stats.count,
          totalValue: stats.totalValue,
          avgPrice: Math.round(avgPrice),
          efficiency: Math.round(efficiency),
          priceRange: stats.priceRange.min !== Infinity 
            ? `$${Math.round(stats.priceRange.min / 1000)}k - $${Math.round(stats.priceRange.max / 1000)}k`
            : 'N/A',
          performance: stats.count > 10 ? 'High' : stats.count > 5 ? 'Medium' : 'Standard',
        };
      })
      .filter(agent => agent.agentName !== 'Unknown Agent' && agent.count > 1)
      .sort((a, b) => b.count - a.count);

    const agencyStats = listings.reduce((acc, listing) => {
      const agencyName = listing.agencyName || 'Unknown Agency';
      
      if (!acc[agencyName]) {
        acc[agencyName] = { count: 0, agents: new Set() };
      }
      
      acc[agencyName].count++;
      if (listing.agentName) {
        acc[agencyName].agents.add(listing.agentName);
      }
      
      return acc;
    }, {} as Record<string, { count: number; agents: Set<string> }>);

    const agencyAnalysis = Object.entries(agencyStats)
      .map(([agencyName, stats]) => ({
        agencyName,
        count: stats.count,
        agentCount: stats.agents.size,
        avgPerAgent: stats.agents.size > 0 ? Math.round(stats.count / stats.agents.size) : 0,
      }))
      .filter(agency => agency.agencyName !== 'Unknown Agency' && agency.count > 2)
      .sort((a, b) => b.count - a.count);

    return {
      topAgents: agentAnalysis.slice(0, 10),
      topAgencies: agencyAnalysis.slice(0, 8),
    };
  }, [listings]);

  const chartConfig = {
    count: { label: "Listings", color: "hsl(var(--chart-1))" },
    avgPrice: { label: "Avg Price", color: "hsl(var(--chart-3))" },
    agentCount: { label: "Agents", color: "hsl(var(--chart-5))" },
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Agents</CardTitle>
            <CardDescription>Agents by listing volume and performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agentData.topAgents.slice(0, 6).map((agent, index) => (
                <div key={agent.agentName} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{agent.agentName}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent.agency}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">{agent.count} listings</div>
                    <div className="text-xs text-muted-foreground">${agent.avgPrice.toLocaleString()} avg</div>
                  </div>
                  <Badge variant={
                    agent.performance === 'High' ? 'default' : 
                    agent.performance === 'Medium' ? 'secondary' : 'outline'
                  }>
                    {agent.performance}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agency Performance</CardTitle>
            <CardDescription>Agencies by total listings and agent count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agentData.topAgencies.slice(0, 6).map((agency) => (
                <div key={agency.agencyName} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{agency.agencyName}</div>
                    <div className="text-xs text-muted-foreground">
                      {agency.agentCount} agents • {agency.avgPerAgent} avg listings/agent
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">{agency.count}</div>
                    <div className="text-xs text-muted-foreground">listings</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent Listing Volume</CardTitle>
            <CardDescription>Top agents by number of listings</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentData.topAgents.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="agentName" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                    interval={0}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--chart-1))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agency Size Distribution</CardTitle>
            <CardDescription>Agencies by number of active agents</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentData.topAgencies.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="agencyName" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={10}
                    interval={0}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="agentCount" fill="hsl(var(--chart-5))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}