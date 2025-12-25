import { PropertyListing } from '@/lib/airtable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { 
  Bed, 
  Bath, 
  Car, 
  MoreVertical, 
  ExternalLink, 
  Copy, 
  BarChart3,
  Calendar,
  MapPin
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface PropertyCardProps {
  listing: PropertyListing;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onOpenDetails: () => void;
  onOpenInvestmentReport: () => void;
  onCopyAddress: () => void;
  onOpenSource?: () => void;
  formatCurrency: (value: number) => string;
  formatDate: (date: Date | string | null | undefined) => string;
}

export function PropertyCard({
  listing,
  isSelected,
  onSelect,
  onOpenDetails,
  onOpenInvestmentReport,
  onCopyAddress,
  onOpenSource,
  formatCurrency,
  formatDate,
}: PropertyCardProps) {
  return (
    <Card 
      className={cn(
        "transition-all duration-200 active:scale-[0.98]",
        isSelected && "ring-2 ring-primary"
      )}
    >
      <CardContent className="p-4">
        {/* Header: Checkbox + Address + Actions */}
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            className="mt-1"
          />
          
          <div className="flex-1 min-w-0" onClick={onOpenDetails}>
            <h3 className="font-medium text-sm leading-tight truncate">
              {listing.address || 'Unknown Address'}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">
                {listing.suburb || 'Unknown Suburb'}
              </span>
              {listing.propertyType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                  {listing.propertyType}
                </Badge>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenDetails}>
                Open Details
              </DropdownMenuItem>
              {listing.url && onOpenSource && (
                <DropdownMenuItem onClick={onOpenSource}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Source
                </DropdownMenuItem>
              )}
              {listing.address && (
                <DropdownMenuItem onClick={onCopyAddress}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Address
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onOpenInvestmentReport}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Investment Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Price */}
        <div className="mt-3">
          <span className="text-lg font-bold text-primary">
            {listing.price && listing.price > 0 
              ? formatCurrency(listing.price) 
              : 'Price on request'
            }
          </span>
        </div>

        {/* Property Details Row */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5">
            <Bed className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{listing.beds || '-'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bath className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{listing.baths || '-'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Car className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{listing.carSpaces || '-'}</span>
          </div>
          
          {/* Confidence Badge */}
          <div className="ml-auto">
            {listing.confidence !== undefined ? (
              <ConfidenceBadge confidence={listing.confidence} />
            ) : null}
          </div>
        </div>

        {/* Footer: Agency + Inspection */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground truncate max-w-[50%]">
            {listing.agencyName || 'Unknown Agency'}
          </span>
          
          {listing.inspectionStart ? (
            <div className="flex items-center gap-1 text-xs text-primary">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(listing.inspectionStart)}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No inspection</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
