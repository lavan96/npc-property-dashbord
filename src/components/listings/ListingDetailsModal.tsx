import { ExternalLink, Copy, Bed, Bath, Car, Calendar, MapPin, Building, User, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { PropertyListing } from '@/lib/airtable';
import { useToast } from '@/hooks/use-toast';

interface ListingDetailsModalProps {
  listing: PropertyListing | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ListingDetailsModal({ listing, isOpen, onClose }: ListingDetailsModalProps) {
  const { toast } = useToast();

  if (!listing) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Unknown';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }
    
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const openSourceUrl = () => {
    if (listing.url) {
      window.open(listing.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {listing.address || 'Unknown Address'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Main Property Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Property Details</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{listing.suburb || 'Unknown Suburb'}</span>
                  </div>
                  
                  {listing.propertyType && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline">{listing.propertyType}</Badge>
                    </div>
                  )}

                  {listing.price && (
                    <div className="text-2xl font-bold text-primary">
                      {formatCurrency(listing.price)}
                    </div>
                  )}
                </div>
              </div>

              {/* Property Features */}
              <div className="flex items-center gap-6">
                {listing.beds > 0 && (
                  <div className="flex items-center gap-2">
                    <Bed className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{listing.beds}</span>
                    <span className="text-sm text-muted-foreground">beds</span>
                  </div>
                )}
                {listing.baths > 0 && (
                  <div className="flex items-center gap-2">
                    <Bath className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{listing.baths}</span>
                    <span className="text-sm text-muted-foreground">baths</span>
                  </div>
                )}
                {listing.carSpaces > 0 && (
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{listing.carSpaces}</span>
                    <span className="text-sm text-muted-foreground">cars</span>
                  </div>
                )}
              </div>
            </div>

            {/* Agent & Agency Info */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Agent & Agency</h3>
                <div className="space-y-2">
                  {listing.agencyName && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{listing.agencyName}</span>
                    </div>
                  )}
                  
                  {listing.agentName && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{listing.agentName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Quality */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Data Quality</h3>
                <div className="space-y-2">
                  {listing.confidence !== undefined && (
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Confidence:</span>
                      <ConfidenceBadge confidence={listing.confidence} />
                    </div>
                  )}
                  
                  {listing.sourceHost && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Source:</span>
                      <Badge variant="secondary">{listing.sourceHost}</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Inspection Details */}
          {listing.inspectionStart && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Inspection</h3>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(listing.inspectionStart)}</span>
                {listing.inspectionEnd && (
                  <span className="text-muted-foreground">
                    - {new Intl.DateTimeFormat('en-AU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(listing.inspectionEnd)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground leading-relaxed">
                {listing.description}
              </p>
            </div>
          )}

          {/* Features */}
          {listing.features && listing.features.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Features</h3>
              <div className="flex flex-wrap gap-2">
                {listing.features.map((feature, index) => (
                  <Badge key={index} variant="secondary">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Images */}
          {listing.images && listing.images.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Images</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {listing.images.slice(0, 6).map((image, index) => (
                  <div key={index} className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img 
                      src={image} 
                      alt={`Property image ${index + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                      onClick={() => window.open(image, '_blank')}
                    />
                  </div>
                ))}
              </div>
              {listing.images.length > 6 && (
                <p className="text-sm text-muted-foreground mt-2">
                  +{listing.images.length - 6} more images available on source
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Metadata</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {listing.receivedAt && (
                <div>
                  <span className="text-muted-foreground">Received:</span>
                  <div>{formatDate(listing.receivedAt)}</div>
                </div>
              )}
              
              {listing.createdTime && (
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <div>{formatDate(listing.createdTime)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            {listing.url && (
              <Button onClick={openSourceUrl}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Source
              </Button>
            )}
            
            {listing.address && (
              <Button variant="outline" onClick={() => copyToClipboard(listing.address!, "Address")}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Address
              </Button>
            )}
            
            {listing.url && (
              <Button variant="outline" onClick={() => copyToClipboard(listing.url!, "URL")}>
                <Copy className="h-4 w-4 mr-2" />
                Copy URL
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}