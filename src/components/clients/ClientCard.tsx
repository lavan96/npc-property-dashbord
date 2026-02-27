import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Building2, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  MoreVertical,
  Eye,
  Trash2,
  ExternalLink,
  RefreshCw,
  Loader2,
  Star,
  Target
} from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { FollowUpFlag } from './FollowUpFlag';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

// Pipeline stage colors
const getPipelineStageColor = (status: string | null | undefined) => {
  if (!status) return 'bg-gray-500';
  if (status.includes('No Show') || status.includes('No Response')) return 'bg-red-400';
  if (status.includes('Discovery')) return 'bg-indigo-500';
  if (status.includes('Strategy')) return 'bg-purple-500';
  if (status.includes('IFC') || status.includes('Initial Financial')) return 'bg-cyan-500';
  if (status.includes('Finance Link')) return 'bg-emerald-500';
  if (status.includes('FA -')) return 'bg-green-500';
  if (status.includes('POP')) return 'bg-violet-500';
  return 'bg-blue-500';
};

interface ClientCardProps {
  client: {
    id: string;
    primary_first_name: string;
    primary_surname: string;
    primary_email: string | null;
    primary_mobile: string | null;
    secondary_first_name: string | null;
    secondary_surname: string | null;
    ghl_contact_id: string | null;
    ghl_sync_status: string | null;
    total_portfolio_value: number;
    total_debt: number;
    net_monthly_cash_flow: number;
    created_at: string;
    is_favorite?: boolean;
    client_properties?: { id: string }[];
    pipeline_status?: string | null;
    follow_up_date?: string | null;
    deal_status?: string;
  };
  ghlLocationId?: string | null;
  onView: () => void;
  onDelete: () => void;
  onSyncComplete?: () => void;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
}

export function ClientCard({ client, ghlLocationId, onView, onDelete, onSyncComplete, isSelected, onSelect }: ClientCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  const propertyCount = client.client_properties?.length || 0;
  const isPositiveCashFlow = Number(client.net_monthly_cash_flow) >= 0;
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      // Use secure Edge Function with HttpOnly cookie auth
      try {
        const { data, error } = await invokeSecureFunction('manage-client-data', {
          operation: 'update',
          table: 'clients',
          clientId: client.id,
          data: { is_favorite: !client.is_favorite },
        });
        
        if (!error && data?.success) {
          return;
        }
      } catch (err) {
        console.warn('Edge function failed, falling back to direct query:', err);
      }
      
      // Fallback to direct query
      const { error } = await supabase
        .from('clients')
        .update({ is_favorite: !client.is_favorite })
        .eq('id', client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(client.is_favorite ? 'Removed from favorites' : 'Added to favorites');
    },
    onError: (error: any) => {
      toast.error('Failed to update favorite: ' + error.message);
    }
  });

  const handleSyncToGHL = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await invokeSecureFunction('sync-client-to-ghl', {
        clientId: client.id
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.isNewContact 
          ? 'Client created in GoHighLevel' 
          : 'Client synced to GoHighLevel'
        );
        onSyncComplete?.();
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error: any) {
      console.error('GHL sync error:', error);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const getGHLStatusBadge = () => {
    if (isSyncing) {
      return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Syncing...</Badge>;
    }
    switch (client.ghl_sync_status) {
      case 'synced':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Synced</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Sync</Badge>;
      case 'error':
        return <Badge variant="destructive">Sync Error</Badge>;
      default:
        return <Badge variant="outline">Not Synced</Badge>;
    }
  };

  const fullName = `${client.primary_first_name} ${client.primary_surname}`;
  const hasSecondary = client.secondary_first_name && client.secondary_surname;
  const secondaryName = hasSecondary 
    ? `${client.secondary_first_name} ${client.secondary_surname}` 
    : null;

  return (
    <Card className={`hover:shadow-md transition-shadow ${client.is_favorite ? 'ring-2 ring-yellow-400/50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => toggleFavoriteMutation.mutate()}
              disabled={toggleFavoriteMutation.isPending}
            >
              <Star 
                className={`h-4 w-4 transition-colors ${
                  client.is_favorite 
                    ? 'fill-yellow-400 text-yellow-400' 
                    : 'text-muted-foreground hover:text-yellow-400'
                }`} 
              />
            </Button>
            <FollowUpFlag
              clientId={client.id}
              followUpDate={client.follow_up_date}
              size="sm"
            />
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground leading-tight">{fullName}</h3>
              {secondaryName && (
                <p className="text-sm text-muted-foreground">& {secondaryName}</p>
              )}
              {client.primary_email && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {client.primary_email}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                className="mr-1"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSyncToGHL} disabled={isSyncing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync to GHL'}
              </DropdownMenuItem>
              {client.ghl_contact_id && ghlLocationId && (
                <DropdownMenuItem asChild>
                  <a 
                    href={`https://app.gohighlevel.com/v2/location/${ghlLocationId}/contacts/detail/${client.ghl_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View in GHL
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
           </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span className="text-xs">Properties</span>
            </div>
            <p className="text-lg font-semibold">{propertyCount}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-xs">Portfolio</span>
            </div>
            <p className="text-lg font-semibold">{formatCurrency(Number(client.total_portfolio_value))}</p>
          </div>
        </div>

        {/* Cash Flow */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {isPositiveCashFlow ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm text-muted-foreground">Monthly Cash Flow</span>
          </div>
          <span className={`font-medium ${isPositiveCashFlow ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(Number(client.net_monthly_cash_flow))}
          </span>
        </div>

        {/* Pipeline Status */}
        {client.pipeline_status && client.pipeline_status !== 'New Lead' && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Pipeline</span>
            </div>
            <Badge className={cn(getPipelineStageColor(client.pipeline_status), 'text-white text-xs')}>
              {client.pipeline_status.length > 20 
                ? client.pipeline_status.substring(0, 18) + '...' 
                : client.pipeline_status
              }
            </Badge>
          </div>
        )}

        {/* Deal Status */}
        {client.deal_status === 'closed' && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">Deal Status</span>
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              🏆 Deal Closed
            </Badge>
          </div>
        )}

        {/* GHL Status */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">GHL Status</span>
          {getGHLStatusBadge()}
        </div>
      </CardContent>
    </Card>
  );
}
