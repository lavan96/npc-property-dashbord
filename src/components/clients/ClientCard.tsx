import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  RefreshCw
} from 'lucide-react';

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
    client_properties?: { id: string }[];
  };
  onView: () => void;
  onDelete: () => void;
}

export function ClientCard({ client, onView, onDelete }: ClientCardProps) {
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

  const getGHLStatusBadge = () => {
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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
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
              {client.ghl_contact_id && (
                <DropdownMenuItem asChild>
                  <a 
                    href={`https://app.gohighlevel.com/contacts/${client.ghl_contact_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View in GHL
                  </a>
                </DropdownMenuItem>
              )}
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

        {/* GHL Status */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">GHL Status</span>
          {getGHLStatusBadge()}
        </div>
      </CardContent>
    </Card>
  );
}
