import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Users, MessageSquare, Tag, Workflow, RefreshCw,
  Bot, MousePointerClick, Search, User, Clock, Globe,
  Shield, Database, ChevronDown, ChevronUp, ExternalLink, Hash,
  Zap, Settings2, Info
} from 'lucide-react';
import { toast } from 'sonner';

interface ManyChatOverview {
  pageInfo: any;
  tags: any[];
  flows: any[];
  widgets: any[];
  customFields: any[];
  botFields: any[];
}

function toArray<T = any>(value: unknown, nestedKeys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    for (const key of nestedKeys) {
      const nestedValue = (value as Record<string, unknown>)[key];
      if (Array.isArray(nestedValue)) return nestedValue as T[];
    }
  }
  return [];
}

function toObject<T extends Record<string, any> = Record<string, any>>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as T;
}

export function ManyChatPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] = useState<any | null>(null);
  const [loadingSubscriber, setLoadingSubscriber] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    widgets: true,
    tags: false,
    fields: false,
    botFields: false,
    flows: false,
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['manychat-overview'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manychat-proxy', {
        action: 'get_overview',
      });
      if (error) throw new Error(error.message);
      return data as ManyChatOverview;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const pageInfo = toObject(data?.pageInfo);
  const tags = toArray(data?.tags, ['tags']);
  const flows = toArray(data?.flows, ['flows']);
  const widgets = toArray(data?.widgets, ['widgets', 'growth_tools']);
  const customFields = toArray(data?.customFields, ['customFields', 'custom_fields']);
  const botFields = toArray(data?.botFields, ['botFields', 'bot_fields']);

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing ManyChat data...');
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      toast.error('Enter at least 2 characters to search');
      return;
    }
    setIsSearching(true);
    setSelectedSubscriber(null);
    try {
      const { data, error } = await invokeSecureFunction('manychat-proxy', {
        action: 'find_subscriber',
        name: searchQuery.trim(),
      });
      if (error) throw new Error(error.message);
      const normalizedSubscribers = toArray(data?.subscribers, ['subscribers']);
      setSearchResults(normalizedSubscribers);
      if (!normalizedSubscribers.length) {
        toast.info('No subscribers found');
      }
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleViewSubscriber = useCallback(async (subscriberId: string) => {
    setLoadingSubscriber(true);
    try {
      const { data, error } = await invokeSecureFunction('manychat-proxy', {
        action: 'get_subscriber',
        subscriberId,
      });
      if (error) throw new Error(error.message);
      setSelectedSubscriber(toObject(data?.subscriber));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load subscriber');
    } finally {
      setLoadingSubscriber(false);
    }
  }, []);

  if (error) {
    const errMsg = (error as Error).message;
    const isNotConfigured = errMsg.includes('MANYCHAT_API_KEY');

    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {isNotConfigured ? 'ManyChat Not Connected' : 'Connection Error'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {isNotConfigured
              ? 'Add your ManyChat API key in the Integrations page to enable this dashboard.'
              : errMsg}
          </p>
          {!isNotConfigured && (
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">ManyChat</h2>
            <p className="text-muted-foreground text-sm">Chat automation & subscriber management</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 to-primary/[0.02] p-5">
          {isLoading ? (
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-48 bg-muted animate-pulse rounded" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ) : pageInfo ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {pageInfo.avatar_link ? (
                  <img src={pageInfo.avatar_link} alt={pageInfo.name} className="h-14 w-14 rounded-full" />
                ) : (
                  <Bot className="h-7 w-7 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground text-lg truncate">{pageInfo.name || 'ManyChat Account'}</h3>
                  <Badge variant={pageInfo.is_pro ? 'default' : 'secondary'} className="shrink-0">
                    {pageInfo.is_pro ? '⭐ Pro' : 'Free'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                  {pageInfo.timezone && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" />
                      {pageInfo.timezone}
                    </span>
                  )}
                  {pageInfo.category && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" />
                      {pageInfo.category}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-t">
          <QuickStat
            icon={<MousePointerClick className="h-4 w-4" />}
            label="Growth Tools"
            value={isLoading ? '—' : String(widgets.length)}
            loading={isLoading}
          />
          <QuickStat
            icon={<Tag className="h-4 w-4" />}
            label="Tags"
            value={isLoading ? '—' : String(tags.length)}
            loading={isLoading}
          />
          <QuickStat
            icon={<Database className="h-4 w-4" />}
            label="Custom Fields"
            value={isLoading ? '—' : String(customFields.length)}
            loading={isLoading}
          />
          <QuickStat
            icon={<Workflow className="h-4 w-4" />}
            label="Flows"
            value={isLoading ? '—' : String(flows.length)}
            loading={isLoading}
          />
        </div>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Subscriber Search
          </CardTitle>
          <CardDescription>Search ManyChat subscribers by name</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching} size="sm">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Search</span>
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
              </p>
              {searchResults.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No subscribers match "{searchQuery}"
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                  {searchResults.map((sub: any) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                      onClick={() => handleViewSubscriber(sub.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {sub.profile_pic ? (
                            <img src={sub.profile_pic} alt={sub.name} className="h-9 w-9 rounded-full" />
                          ) : (
                            <User className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {sub.first_name} {sub.last_name}
                          </p>
                          {sub.gender && (
                            <p className="text-xs text-muted-foreground">{sub.gender}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">View</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {loadingSubscriber && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading subscriber details...</span>
            </div>
          )}
          {selectedSubscriber && !loadingSubscriber && (
            <SubscriberDetail subscriber={selectedSubscriber} onClose={() => setSelectedSubscriber(null)} />
          )}
        </CardContent>
      </Card>

      <CollapsibleSection
        title="Growth Tools"
        description="Subscriber acquisition triggers & widgets"
        icon={<MousePointerClick className="h-4 w-4" />}
        count={widgets.length}
        expanded={expandedSections.widgets}
        onToggle={() => toggleSection('widgets')}
        loading={isLoading}
      >
        {widgets.length === 0 ? (
          <EmptyState message="No growth tools configured yet" />
        ) : (
          <div className="space-y-2">
            {widgets.map((widget: any, i: number) => (
              <div key={widget.id || i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{widget.name || `Widget ${i + 1}`}</p>
                    <p className="text-xs text-muted-foreground capitalize">{(widget.type || 'unknown').replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <Badge variant="outline" className="text-xs">
                    ID: {widget.id}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Tags"
        description="Subscriber segmentation labels"
        icon={<Tag className="h-4 w-4" />}
        count={tags.length}
        expanded={expandedSections.tags}
        onToggle={() => toggleSection('tags')}
        loading={isLoading}
      >
        {tags.length === 0 ? (
          <EmptyState message="No tags created yet. Tags will appear here once you create them in ManyChat." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: any, i: number) => (
              <Badge key={tag.id || i} variant="secondary" className="text-xs px-3 py-1.5">
                <Hash className="h-3 w-3 mr-1" />
                {tag.name || `Tag ${i + 1}`}
              </Badge>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Custom Fields"
        description="Subscriber data fields for personalization"
        icon={<Database className="h-4 w-4" />}
        count={customFields.length}
        expanded={expandedSections.fields}
        onToggle={() => toggleSection('fields')}
        loading={isLoading}
      >
        {customFields.length === 0 ? (
          <EmptyState message="No custom fields defined yet. Custom fields will appear here once you create them in ManyChat." />
        ) : (
          <div className="space-y-1.5">
            {customFields.map((field: any, i: number) => (
              <div key={field.id || i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate">{field.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {field.type && (
                    <Badge variant="outline" className="text-xs capitalize">{field.type}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Bot Fields"
        description="Global bot-level variables"
        icon={<Bot className="h-4 w-4" />}
        count={botFields.length}
        expanded={expandedSections.botFields}
        onToggle={() => toggleSection('botFields')}
        loading={isLoading}
      >
        {botFields.length === 0 ? (
          <EmptyState message="No bot fields defined yet." />
        ) : (
          <div className="space-y-1.5">
            {botFields.map((field: any, i: number) => (
              <div key={field.id || i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate">{field.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {field.type && (
                    <Badge variant="outline" className="text-xs capitalize">{field.type}</Badge>
                  )}
                  {field.value !== undefined && field.value !== null && (
                    <span className="text-xs text-muted-foreground font-mono">{String(field.value)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Flows"
        description="Automation sequences and conversation flows"
        icon={<Workflow className="h-4 w-4" />}
        count={flows.length}
        expanded={expandedSections.flows}
        onToggle={() => toggleSection('flows')}
        loading={isLoading}
      >
        {flows.length === 0 ? (
          <EmptyState message="No flows available via API. Instagram accounts may have limited flow visibility through the API." />
        ) : (
          <div className="space-y-2">
            {flows.map((flow: any, i: number) => (
              <div key={flow.ns_id || i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{flow.name || `Flow ${i + 1}`}</p>
                  {flow.folder_name && (
                    <p className="text-xs text-muted-foreground">{flow.folder_name}</p>
                  )}
                </div>
                <Badge variant={flow.status === 'active' ? 'default' : 'secondary'} className="text-xs ml-2 shrink-0">
                  {flow.status || 'unknown'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <Card className="border-dashed">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Data is fetched live from the ManyChat API. Some features (e.g., flow analytics, subscriber counts) may have limited availability depending on your account type and connected channel (Instagram vs. Messenger). 
              Manage your automations directly in{' '}
              <a href="https://manychat.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                ManyChat <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickStat({ icon, label, value, loading }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <div className="h-6 w-8 bg-muted animate-pulse rounded mx-auto" />
      ) : (
        <p className="text-lg font-bold text-foreground">{value}</p>
      )}
    </div>
  );
}

function CollapsibleSection({ title, description, icon, count, expanded, onToggle, loading, children }: {
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{loading ? '...' : count}</Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <CardContent className="pt-0 pb-4">
          <Separator className="mb-4" />
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            children
          )}
        </CardContent>
      )}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function SubscriberDetail({ subscriber, onClose }: { subscriber: any; onClose: () => void }) {
  const subscriberTags = toArray(subscriber?.tags, ['tags']);
  const subscriberCustomFields = toArray(subscriber?.custom_fields, ['custom_fields', 'customFields']);
  const visibleCustomFields = subscriberCustomFields.filter((field: any) => field.value !== null && field.value !== '');

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              {subscriber.profile_pic ? (
                <img src={subscriber.profile_pic} alt="Profile" className="h-10 w-10 rounded-full" />
              ) : (
                <User className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">
                {subscriber.first_name} {subscriber.last_name}
              </CardTitle>
              {subscriber.name && (
                <CardDescription>{subscriber.name}</CardDescription>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {subscriber.gender && (
            <InfoRow label="Gender" value={subscriber.gender} />
          )}
          {subscriber.language && (
            <InfoRow label="Language" value={subscriber.language} />
          )}
          {subscriber.timezone && (
            <InfoRow label="Timezone" value={subscriber.timezone} />
          )}
          {subscriber.subscribed && (
            <InfoRow label="Subscribed" value={new Date(subscriber.subscribed).toLocaleDateString('en-AU')} />
          )}
          {subscriber.last_interaction && (
            <InfoRow label="Last Interaction" value={new Date(subscriber.last_interaction).toLocaleDateString('en-AU')} />
          )}
          {subscriber.live_chat_url && (
            <div className="col-span-full">
              <a
                href={subscriber.live_chat_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm hover:underline inline-flex items-center gap-1"
              >
                Open in ManyChat <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>

        {subscriberTags.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {subscriberTags.map((tag: any) => (
                <Badge key={tag.id} variant="secondary" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {visibleCustomFields.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Custom Fields</p>
            <div className="space-y-1.5">
              {visibleCustomFields.map((field: any) => (
                <div key={field.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{field.name}</span>
                  <span className="text-foreground font-medium">{String(field.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
