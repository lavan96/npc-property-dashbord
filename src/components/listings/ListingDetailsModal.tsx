import { useState } from 'react';
import { ExternalLink, Copy, Bed, Bath, Car, Calendar, MapPin, Building, User, Eye, TrendingUp, Sparkles, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { InvestmentReportModal } from '@/components/listings/InvestmentReportModal';
import { getFullStateName } from '@/lib/states';
import { PropertyListing } from '@/lib/airtable';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface ListingDetailsModalProps {
  listing: PropertyListing | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ListingDetailsModal({ listing, isOpen, onClose }: ListingDetailsModalProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [investmentModalOpen, setInvestmentModalOpen] = useState(false);
  const [generatingWithPerplexity, setGeneratingWithPerplexity] = useState(false);

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

  const openWebLink = () => {
    if (listing.webLinks) {
      window.open(listing.webLinks, '_blank', 'noopener,noreferrer');
    }
  };

  const handleGenerateWithPerplexity = async () => {
    if (!listing) return;
    
    setGeneratingWithPerplexity(true);
    
    try {
      const propertyAddress = listing.location || listing.address || 'Unknown Address';
      
      toast({
        title: "Generating Report",
        description: "Creating investment report with Perplexity AI...",
      });

      // Create initial report record
      const { data: reportData, error: createError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: propertyAddress,
          property_listing_id: listing.id,
          report_content: 'Generating with Perplexity AI...',
          status: 'processing',
          report_tier: 'standard',
          property_specs: {
            bedrooms: listing.beds,
            bathrooms: listing.baths,
            carSpaces: listing.carSpaces,
            propertyType: listing.propertyType,
            price: listing.price,
            suburb: listing.suburb,
            state: listing.state,
            postcode: listing.zipCode
          }
        })
        .select()
        .single();

      if (createError) throw createError;

      // Call generate-investment-report which uses OpenAI, then enhance with Perplexity
      const { data: genData, error: genError } = await supabase.functions.invoke('generate-investment-report', {
        body: {
          propertyAddress,
          propertyDetails: {
            id: listing.id,
            price: listing.price,
            propertyType: listing.propertyType,
            beds: listing.beds,
            baths: listing.baths,
            carSpaces: listing.carSpaces,
            suburb: listing.suburb,
            state: listing.state,
            zipCode: listing.zipCode,
            landSize: listing.landSize,
            description: listing.description,
            features: listing.features
          },
          reportId: reportData.id,
          usePerplexity: true // Flag to use Perplexity for enhanced analysis
        }
      });

      if (genError) throw genError;

      toast({
        title: "Report Generated",
        description: "Your Perplexity-enhanced investment report is ready!",
      });

      // Navigate to the report
      onClose();
      navigate(`/reports/${reportData.id}`);
      
    } catch (error: any) {
      console.error('Error generating report with Perplexity:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate report with Perplexity",
        variant: "destructive",
      });
    } finally {
      setGeneratingWithPerplexity(false);
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
                    {listing.state && (
                      <Badge variant="outline">{getFullStateName(listing.state)}</Badge>
                    )}
                    {listing.zipCode && (
                      <Badge variant="outline">{listing.zipCode}</Badge>
                    )}
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

                  {listing.landSize && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-muted-foreground">Land Size:</span>
                      <Badge variant="outline">{listing.landSize}</Badge>
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
                  
                  {listing.agentPhone && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Phone:</span>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(listing.agentPhone!, "Phone number")}>
                        {listing.agentPhone}
                      </Button>
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
          {(listing.inspectionStart || listing.inspectionNotes) && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Inspection</h3>
              <div className="space-y-2">
                {listing.inspectionStart && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDate(listing.inspectionStart)}</span>
                    {listing.inspectionEnd && (
                      <span className="text-muted-foreground">
                        - {new Intl.DateTimeFormat('en-AU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(listing.inspectionEnd instanceof Date ? listing.inspectionEnd : new Date(listing.inspectionEnd))}
                      </span>
                    )}
                  </div>
                )}
                {listing.inspectionNotes && (
                  <div>
                    <span className="text-sm text-muted-foreground">Notes:</span>
                    <p className="text-sm mt-1">{listing.inspectionNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Property Description */}
          {listing.description && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Property Description</h3>
              <p className="text-muted-foreground leading-relaxed">
                {listing.description}
              </p>
            </div>
          )}

          {/* Property Summary */}
          {listing.summary && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Property Summary</h3>
              <p className="text-muted-foreground leading-relaxed">
                {listing.summary}
              </p>
            </div>
          )}

          {/* Key Entities */}
          {listing.keyEntities && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Key Entities</h3>
              <p className="text-sm text-muted-foreground">
                {listing.keyEntities}
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

          {/* Floorplans */}
          {listing.floorplans && listing.floorplans.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Floorplans</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {listing.floorplans.map((floorplan, index) => (
                  <div key={index} className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img 
                      src={floorplan} 
                      alt={`Floorplan ${index + 1}`}
                      className="w-full h-full object-contain hover:scale-105 transition-transform cursor-pointer"
                      onClick={() => window.open(floorplan, '_blank')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Email Source Details */}
          {(listing.emailSubject || listing.from || listing.messageId) && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Email Source</h3>
              <div className="space-y-2 text-sm">
                {listing.emailSubject && (
                  <div>
                    <span className="text-muted-foreground">Subject:</span>
                    <div className="font-medium">{listing.emailSubject}</div>
                  </div>
                )}
                {listing.from && (
                  <div>
                    <span className="text-muted-foreground">From:</span>
                    <div>{listing.from}</div>
                  </div>
                )}
                {listing.messageId && (
                  <div>
                    <span className="text-muted-foreground">Message ID:</span>
                    <div className="font-mono text-xs">{listing.messageId}</div>
                  </div>
                )}
              </div>
            </div>
          )}

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
              
              {listing.hash && (
                <div>
                  <span className="text-muted-foreground">Hash:</span>
                  <div className="font-mono text-xs">{listing.hash}</div>
                </div>
              )}
              
              {listing.category && (
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <div>{listing.category}</div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button 
              variant="default" 
              onClick={() => setInvestmentModalOpen(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Investment Report
            </Button>

            {/* Perplexity-branded button */}
            <Button 
              onClick={handleGenerateWithPerplexity}
              disabled={generatingWithPerplexity}
              className="bg-[#1A1A2E] hover:bg-[#1A1A2E]/90 text-white border-0"
              style={{ 
                background: 'linear-gradient(135deg, #1A1A2E 0%, #20B2AA 100%)',
              }}
            >
              {generatingWithPerplexity ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate with Perplexity
                </>
              )}
            </Button>

            {listing.webLinks && (
              <Button variant="outline" onClick={openWebLink}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Listing
              </Button>
            )}
            
            {listing.url && (
              <Button variant="outline" onClick={openSourceUrl}>
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
            
            {listing.webLinks && (
              <Button variant="outline" onClick={() => copyToClipboard(listing.webLinks!, "Listing URL")}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Listing URL
              </Button>
            )}
          </div>
          
          <InvestmentReportModal
            isOpen={investmentModalOpen}
            onClose={() => setInvestmentModalOpen(false)}
            propertyAddress={listing.location || listing.address || 'Unknown Address'}
            propertyDetails={{
              id: listing.id,
              price: listing.price,
              propertyType: listing.propertyType,
              beds: listing.beds,
              baths: listing.baths,
              carSpaces: listing.carSpaces,
              suburb: listing.suburb,
              state: listing.state,
              zipCode: listing.zipCode
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}