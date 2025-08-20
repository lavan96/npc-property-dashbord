import { useEffect, useState } from 'react';
import { Mail, Building2, User, Phone, ArrowUpRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { airtableService, PropertyListing } from '@/lib/airtable';

interface EmailSource {
  host: string;
  from: string;
  count: number;
  latestReceived: Date;
  subjects: string[];
}

interface AgencySource {
  name: string;
  count: number;
  agents: string[];
  latestListing: Date;
}

interface AgentSource {
  name: string;
  phone?: string;
  agency?: string;
  count: number;
  latestListing: Date;
}

export default function Sources() {
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailSources, setEmailSources] = useState<EmailSource[]>([]);
  const [agencySources, setAgencySources] = useState<AgencySource[]>([]);
  const [agentSources, setAgentSources] = useState<AgentSource[]>([]);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      setLoading(true);
      const response = await airtableService.getRecords({ pageSize: 500 });
      setListings(response.records);
      
      // Process email sources
      const emailMap = new Map<string, EmailSource>();
      
      // Process agency sources
      const agencyMap = new Map<string, AgencySource>();
      
      // Process agent sources
      const agentMap = new Map<string, AgentSource>();

      response.records.forEach(listing => {
        // Helper function to ensure we have a proper Date object
        const ensureDate = (dateValue: any): Date => {
          if (dateValue instanceof Date) return dateValue;
          if (typeof dateValue === 'string') return new Date(dateValue);
          return new Date();
        };

        // Email sources
        if (listing.sourceHost && listing.from) {
          const key = `${listing.sourceHost}-${listing.from}`;
          const existing = emailMap.get(key);
          const receivedDate = ensureDate(listing.receivedAt);
          
          if (existing) {
            existing.count++;
            if (receivedDate > existing.latestReceived) {
              existing.latestReceived = receivedDate;
            }
            if (listing.emailSubject && !existing.subjects.includes(listing.emailSubject)) {
              existing.subjects.push(listing.emailSubject);
            }
          } else {
            emailMap.set(key, {
              host: listing.sourceHost,
              from: listing.from,
              count: 1,
              latestReceived: receivedDate,
              subjects: listing.emailSubject ? [listing.emailSubject] : []
            });
          }
        }

        // Agency sources
        if (listing.agencyName) {
          const existing = agencyMap.get(listing.agencyName);
          const createdDate = ensureDate(listing.createdTime);
          
          if (existing) {
            existing.count++;
            if (listing.agentName && !existing.agents.includes(listing.agentName)) {
              existing.agents.push(listing.agentName);
            }
            if (createdDate > existing.latestListing) {
              existing.latestListing = createdDate;
            }
          } else {
            agencyMap.set(listing.agencyName, {
              name: listing.agencyName,
              count: 1,
              agents: listing.agentName ? [listing.agentName] : [],
              latestListing: createdDate
            });
          }
        }

        // Agent sources
        if (listing.agentName) {
          const existing = agentMap.get(listing.agentName);
          const createdDate = ensureDate(listing.createdTime);
          
          if (existing) {
            existing.count++;
            if (createdDate > existing.latestListing) {
              existing.latestListing = createdDate;
            }
          } else {
            agentMap.set(listing.agentName, {
              name: listing.agentName,
              phone: listing.agentPhone,
              agency: listing.agencyName,
              count: 1,
              latestListing: createdDate
            });
          }
        }
      });

      setEmailSources(Array.from(emailMap.values()).sort((a, b) => b.count - a.count));
      setAgencySources(Array.from(agencyMap.values()).sort((a, b) => b.count - a.count));
      setAgentSources(Array.from(agentMap.values()).sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('Failed to load sources:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sources</h1>
        <p className="text-muted-foreground">
          Track email sources, agencies, and agents sending property listings
        </p>
      </div>

      <Tabs defaultValue="email" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Sources ({emailSources.length})
          </TabsTrigger>
          <TabsTrigger value="agencies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Agencies ({agencySources.length})
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Agents ({agentSources.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-4">
          {emailSources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No email sources found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {emailSources.map((source, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        {source.host}
                      </CardTitle>
                      <Badge variant="secondary">{source.count} listings</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">From: {source.from}</p>
                      <p className="text-xs text-muted-foreground">
                        Latest: {source.latestReceived.toLocaleDateString()}
                      </p>
                    </div>
                    {source.subjects.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Recent subjects:</p>
                        <div className="flex flex-wrap gap-1">
                          {source.subjects.slice(0, 3).map((subject, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {subject.length > 30 ? `${subject.substring(0, 30)}...` : subject}
                            </Badge>
                          ))}
                          {source.subjects.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{source.subjects.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agencies" className="space-y-4">
          {agencySources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No agencies found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {agencySources.map((agency, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {agency.name}
                      </CardTitle>
                      <Badge variant="secondary">{agency.count} listings</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Latest listing: {agency.latestListing.toLocaleDateString()}
                    </p>
                    {agency.agents.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Agents ({agency.agents.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {agency.agents.slice(0, 4).map((agent, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {agent}
                            </Badge>
                          ))}
                          {agency.agents.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{agency.agents.length - 4} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          {agentSources.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No agents found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {agentSources.map((agent, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {agent.name}
                      </CardTitle>
                      <Badge variant="secondary">{agent.count} listings</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agent.agency && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{agent.agency}</span>
                      </div>
                    )}
                    {agent.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono">{agent.phone}</span>
                        <a 
                          href={`tel:${agent.phone}`}
                          className="text-primary hover:text-primary/80"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Latest listing: {agent.latestListing.toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}