import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, MessageSquare, Tag, Workflow, RefreshCw, ExternalLink, Bot, MousePointerClick } from 'lucide-react';
import { toast } from 'sonner';

interface ManyChatOverview {
  pageInfo: any;
  tags: any[];
  flows: any[];
  widgets: any[];
}

export function ManyChatPanel() {
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

  const pageInfo = data?.pageInfo;
  const tags = data?.tags || [];
  const flows = data?.flows || [];
  const widgets = data?.widgets || [];

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing ManyChat data...');
  };

  if (error) {
    const errMsg = (error as Error).message;
    const isNotConfigured = errMsg.includes('MANYCHAT_API_KEY');

    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Bot className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {isNotConfigured ? 'ManyChat Not Connected' : 'Connection Error'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {isNotConfigured
              ? 'Add your ManyChat API key in Integrations to enable this dashboard.'
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">ManyChat</h2>
            <p className="text-muted-foreground text-sm">Chat automation performance & metrics</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Page Info / KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={<Users className="h-4 w-4" />}
          label="Subscribers"
          value={isLoading ? '...' : formatNum(pageInfo?.subscribers || 0)}
          loading={isLoading}
        />
        <KPICard
          icon={<Workflow className="h-4 w-4" />}
          label="Flows"
          value={isLoading ? '...' : String(flows.length)}
          loading={isLoading}
        />
        <KPICard
          icon={<Tag className="h-4 w-4" />}
          label="Tags"
          value={isLoading ? '...' : String(tags.length)}
          loading={isLoading}
        />
        <KPICard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Growth Tools"
          value={isLoading ? '...' : String(widgets.length)}
          loading={isLoading}
        />
      </div>

      {/* Page Details */}
      {pageInfo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connected Page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {pageInfo.avatar && (
                <img src={pageInfo.avatar} alt={pageInfo.name} className="h-12 w-12 rounded-full" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{pageInfo.name || 'Facebook Page'}</p>
                <p className="text-sm text-muted-foreground">
                  {formatNum(pageInfo.subscribers || 0)} subscribers
                </p>
              </div>
              <Badge variant={pageInfo.is_pro ? 'default' : 'secondary'}>
                {pageInfo.is_pro ? 'Pro' : 'Free'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flows & Tags side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Flows */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Flows
                </CardTitle>
                <CardDescription>Active automation flows</CardDescription>
              </div>
              <Badge variant="outline">{flows.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : flows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No flows found</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {flows.map((flow: any, i: number) => (
                  <div key={flow.ns_id || i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 hover:bg-muted transition-colors">
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
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </CardTitle>
                <CardDescription>Subscriber segmentation tags</CardDescription>
              </div>
              <Badge variant="outline">{tags.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No tags found</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto">
                {tags.map((tag: any, i: number) => (
                  <Badge key={tag.id || i} variant="outline" className="text-xs">
                    {tag.name || `Tag ${i + 1}`}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Growth Tools / Widgets */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MousePointerClick className="h-4 w-4" />
                Growth Tools
              </CardTitle>
              <CardDescription>Opt-in widgets and subscriber acquisition tools</CardDescription>
            </div>
            <Badge variant="outline">{widgets.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : widgets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No growth tools configured</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {widgets.map((widget: any, i: number) => (
                <div key={widget.id || i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{widget.name || `Widget ${i + 1}`}</p>
                    {widget.type && (
                      <p className="text-xs text-muted-foreground capitalize">{widget.type.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  <Badge variant={widget.status === 'active' ? 'default' : 'secondary'} className="text-xs ml-2 shrink-0">
                    {widget.status || 'unknown'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ icon, label, value, loading }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
          {icon}
          <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        </div>
        {loading ? (
          <div className="h-7 w-20 bg-muted animate-pulse rounded mt-0.5" />
        ) : (
          <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatNum(n: number): string {
  return n.toLocaleString('en-AU');
}
