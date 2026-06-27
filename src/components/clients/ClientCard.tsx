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
  Target,
  Phone
} from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { FollowUpFlag } from './FollowUpFlag';
import { SyncToGHLDialog } from './SyncToGHLDialog';
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
  onDelete?: () => void;
  onSyncComplete?: () => void;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
}

export function ClientCard({ client, ghlLocationId, onView, onDelete, onSyncComplete, isSelected, onSelect }: ClientCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
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

  const handleSyncToGHL = () => {
    setShowSyncDialog(true);
  };

  const getGHLStatusBadge = () => {
    if (isSyncing) {
      return <Badge variant="secondary" className="gap-1 rounded-full border-amber-300/25 bg-amber-500/15 text-amber-100"><Loader2 className="h-3 w-3 animate-spin" />Syncing...</Badge>;
    }
    switch (client.ghl_sync_status) {
      case 'synced':
        return <Badge variant="default" className="rounded-full border-emerald-300/25 bg-emerald-400/15 px-2.5 font-semibold text-emerald-300 shadow-sm shadow-emerald-950/20">Synced</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="rounded-full border border-amber-300/25 bg-amber-500/15 px-2.5 text-amber-100">Pending Sync</Badge>;
      case 'error':
        return <Badge variant="destructive" className="rounded-full px-2.5">Sync Error</Badge>;
      default:
        return <Badge variant="outline" className="rounded-full border-border/70 bg-background/60 px-2.5 text-muted-foreground">Not Synced</Badge>;
    }
  };

  const fullName = `${client.primary_first_name} ${client.primary_surname}`.trim() || 'Unknown client';
  const hasSecondary = client.secondary_first_name && client.secondary_surname;
  const secondaryName = hasSecondary 
    ? `${client.secondary_first_name} ${client.secondary_surname}` 
    : null;

  return (
    <Card className={`group relative flex h-full min-h-[22rem] overflow-hidden rounded-2xl border-border/70 bg-[linear-gradient(145deg,rgba(24,24,27,0.9),rgba(3,7,18,0.84))] shadow-xl shadow-black/20 transition-all duration-300 hover:-translate-y-1.5 hover:border-amber-400/45 hover:shadow-2xl hover:shadow-amber-950/35 focus-within:border-amber-300/70 focus-within:ring-2 focus-within:ring-amber-300/25 focus-within:shadow-amber-950/30 ${client.is_favorite ? 'ring-2 ring-yellow-400/50' : ''} ${isSelected ? 'border-amber-400/70 shadow-amber-950/40 ring-1 ring-amber-300/35 hover:ring-amber-300/55' : ''}`}>
      {isSelected && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600 shadow-[0_0_18px_rgba(245,158,11,0.55)]" />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-400/75 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardHeader className="relative pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 rounded-full border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0 ${
                client.is_favorite
                  ? 'border-yellow-300/45 bg-yellow-400/15 text-yellow-300 shadow-sm shadow-yellow-950/30 hover:scale-105 hover:bg-yellow-400/20 hover:shadow-yellow-400/20'
                  : 'border-border/50 bg-background/35 text-muted-foreground hover:scale-105 hover:border-yellow-300/45 hover:bg-yellow-400/10 hover:text-yellow-300 hover:shadow-sm hover:shadow-yellow-400/15'
              }`}
              onClick={() => toggleFavoriteMutation.mutate()}
              disabled={toggleFavoriteMutation.isPending}
              aria-label={client.is_favorite ? `Remove ${fullName} from active clients` : `Mark ${fullName} as active client`}
            >
              <Star 
                className={`h-4 w-4 transition-all duration-200 group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.45)] ${
                  client.is_favorite 
                    ? 'fill-yellow-400 text-yellow-400' 
                    : 'text-muted-foreground hover:text-yellow-400'
                }`} 
              />
            </Button>
            <div className="rounded-full border border-border/50 bg-background/35 shadow-sm transition-all duration-200 hover:border-amber-300/45 hover:bg-amber-400/10 focus-within:ring-2 focus-within:ring-amber-300/60">
              <FollowUpFlag
                clientId={client.id}
                followUpDate={client.follow_up_date}
                size="sm"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <h3 className="truncate text-base font-bold leading-tight tracking-tight text-foreground">{fullName}</h3>
                {secondaryName && (
                  <p className="truncate text-sm text-muted-foreground">& {secondaryName}</p>
                )}
              </div>
              <div className="space-y-1 rounded-xl border border-border/50 bg-background/35 px-3 py-2">
                <p className="truncate text-xs text-muted-foreground">
                  {client.primary_email || 'Email not provided'}
                </p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0 text-amber-200/70" />
                  {client.primary_mobile || 'Phone not provided'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/45 bg-background/30 p-1 shadow-sm">
            {onSelect && (
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${
                isSelected
                  ? 'border-amber-300/55 bg-amber-400/15 shadow-sm shadow-amber-950/30'
                  : 'border-border/50 bg-background/40 hover:border-amber-300/45 hover:bg-amber-400/10'
              }`}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={onSelect}
                  aria-label={`Select ${fullName}`}
                  className="rounded-md border-amber-500/45 bg-background/70 shadow-sm focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=checked]:border-amber-300 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
                />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-border/50 bg-background/45 text-muted-foreground shadow-sm transition-all duration-200 hover:border-amber-400/50 hover:bg-amber-500/10 hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-0 data-[state=open]:border-amber-400/60 data-[state=open]:bg-amber-500/15 data-[state=open]:text-amber-200" aria-label={`Open actions for ${fullName}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-48 rounded-xl border-amber-400/20 bg-zinc-950/95 p-1.5 text-sm shadow-2xl shadow-black/40 backdrop-blur">
              <DropdownMenuItem onClick={onView} className="rounded-lg focus:bg-amber-500/10 focus:text-amber-100">
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSyncToGHL} disabled={isSyncing} className="rounded-lg focus:bg-amber-500/10 focus:text-amber-100">
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync to GHL'}
              </DropdownMenuItem>
              {client.ghl_contact_id && ghlLocationId && (
                <DropdownMenuItem asChild className="rounded-lg focus:bg-amber-500/10 focus:text-amber-100">
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
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={onDelete}
                    className="rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
           </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative flex flex-1 flex-col space-y-4 pt-0">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-h-[5.25rem] space-y-2 rounded-xl border border-border/60 bg-background/45 p-3 transition-colors group-hover:border-amber-500/25">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-amber-200/75" />
              <span className="text-xs font-medium">Properties</span>
            </div>
            <p className="text-xl font-bold leading-none text-foreground">{propertyCount}</p>
          </div>
          <div className="min-h-[5.25rem] space-y-2 rounded-xl border border-border/60 bg-background/45 p-3 transition-colors group-hover:border-amber-500/25">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5 text-amber-200/75" />
              <span className="text-xs font-medium">Portfolio</span>
            </div>
            <p className="text-lg font-bold leading-tight text-foreground">{formatCurrency(Number(client.total_portfolio_value))}</p>
          </div>
        </div>

        {/* Cash Flow */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/35 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {isPositiveCashFlow ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium text-muted-foreground">Monthly Cash Flow</span>
          </div>
          <span className={`font-bold ${isPositiveCashFlow ? 'text-emerald-300' : 'text-red-400'}`}>
            {formatCurrency(Number(client.net_monthly_cash_flow))}
          </span>
        </div>

        {/* Pipeline Status */}
        {client.pipeline_status && client.pipeline_status !== 'New Lead' && (
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
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
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <span className="text-xs text-muted-foreground">Deal Status</span>
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
              🏆 Deal Closed
            </Badge>
          </div>
        )}

        {/* GHL Status */}
        <div className="mt-auto flex items-center justify-between rounded-xl border border-border/60 bg-background/35 px-3 py-2.5">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">GHL Status</span>
          {getGHLStatusBadge()}
        </div>
      </CardContent>

      <SyncToGHLDialog
        open={showSyncDialog}
        onOpenChange={setShowSyncDialog}
        clientId={client.id}
        clientName={fullName}
        onSyncComplete={onSyncComplete}
      />
    </Card>
  );
}
