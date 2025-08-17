import { useState, useEffect, useMemo } from 'react';
import { Search, Download, ExternalLink, Copy, MoreHorizontal, Bed, Bath, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { ListingFilters } from '@/components/listings/ListingFilters';
import { ListingDetailsModal } from '@/components/listings/ListingDetailsModal';
import { airtableService, PropertyListing } from '@/lib/airtable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

export default function Listings() {
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    propertyType: '',
    suburb: '',
    sourceHost: '',
    hasInspection: false,
    lowConfidence: false,
    priceMin: '',
    priceMax: '',
    bedsMin: '',
    bedsMax: '',
    bathsMin: '',
    bathsMax: '',
    carsMin: '',
    carsMax: '',
    agencyName: '',
  });
  const [selectedListing, setSelectedListing] = useState<PropertyListing | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      setIsLoading(true);
      const response = await airtableService.getRecords({
        pageSize: 100,
        sortField: 'ReceivedAt',
        sortDirection: 'desc'
      });
      
      setListings(response.records);
    } catch (error) {
      console.error('Failed to load listings:', error);
      toast({
        title: "Error",
        description: "Failed to load listings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedListings(new Set(listings.map(l => l.id)));
    } else {
      setSelectedListings(new Set());
    }
  };

  const handleSelectListing = (listingId: string, checked: boolean) => {
    const newSelected = new Set(selectedListings);
    if (checked) {
      newSelected.add(listingId);
    } else {
      newSelected.delete(listingId);
    }
    setSelectedListings(newSelected);
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

  const openSourceUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-AU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Get unique values for filter options
  const uniqueValues = useMemo(() => {
    const propertyTypes = [...new Set(listings.map(l => l.propertyType).filter(Boolean))].sort();
    const suburbs = [...new Set(listings.map(l => l.suburb).filter(Boolean))].sort();
    const sourceHosts = [...new Set(listings.map(l => l.sourceHost).filter(Boolean))].sort();
    const agencies = [...new Set(listings.map(l => l.agencyName).filter(Boolean))].sort();
    
    return { propertyTypes, suburbs, sourceHosts, agencies };
  }, [listings]);

  // Filter listings based on search and filters
  const filteredListings = listings.filter(listing => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchText = [
        listing.address,
        listing.suburb,
        listing.agencyName,
        listing.agentName
      ].join(' ').toLowerCase();
      
      if (!searchText.includes(query)) {
        return false;
      }
    }

    // Property type filter
    if (filters.propertyType && listing.propertyType !== filters.propertyType) {
      return false;
    }

    // Suburb filter
    if (filters.suburb && listing.suburb !== filters.suburb) {
      return false;
    }

    // Source host filter
    if (filters.sourceHost && listing.sourceHost !== filters.sourceHost) {
      return false;
    }

    // Has inspection filter
    if (filters.hasInspection && !listing.inspectionStart) {
      return false;
    }

    // Low confidence filter
    if (filters.lowConfidence && (listing.confidence === undefined || listing.confidence >= 0.7)) {
      return false;
    }

    // Agency filter
    if (filters.agencyName && listing.agencyName !== filters.agencyName) {
      return false;
    }

    // Price filters
    if (filters.priceMin && listing.price && listing.price < parseFloat(filters.priceMin)) {
      return false;
    }

    if (filters.priceMax && listing.price && listing.price > parseFloat(filters.priceMax)) {
      return false;
    }

    // Bedroom filters
    if (filters.bedsMin && listing.beds && listing.beds < parseInt(filters.bedsMin)) {
      return false;
    }

    if (filters.bedsMax && listing.beds && listing.beds > parseInt(filters.bedsMax)) {
      return false;
    }

    // Bathroom filters
    if (filters.bathsMin && listing.baths && listing.baths < parseInt(filters.bathsMin)) {
      return false;
    }

    if (filters.bathsMax && listing.baths && listing.baths > parseInt(filters.bathsMax)) {
      return false;
    }

    // Car space filters
    if (filters.carsMin && listing.carSpaces && listing.carSpaces < parseInt(filters.carsMin)) {
      return false;
    }

    if (filters.carsMax && listing.carSpaces && listing.carSpaces > parseInt(filters.carsMax)) {
      return false;
    }

    return true;
  });

  const openDetailsModal = (listing: PropertyListing) => {
    setSelectedListing(listing);
    setIsDetailsModalOpen(true);
  };

  const closeDetailsModal = () => {
    setSelectedListing(null);
    setIsDetailsModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Listings</h1>
            <p className="text-muted-foreground">Manage and review property listings</p>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-24" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Listings</h1>
          <p className="text-muted-foreground">
            Manage and review property listings ({filteredListings.length} of {listings.length})
          </p>
        </div>
        
        <div className="flex gap-2">
          {selectedListings.size > 0 && (
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV ({selectedListings.size})
            </Button>
          )}
          <Button onClick={loadListings} size="sm">
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search addresses, suburbs, agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ListingFilters 
                filters={filters} 
                setFilters={setFilters}
                uniqueValues={uniqueValues}
              />
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filters.hasInspection ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, hasInspection: !prev.hasInspection }))}
              >
                Has Inspection
              </Button>
              <Button
                variant={filters.lowConfidence ? "default" : "outline"}
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, lowConfidence: !prev.lowConfidence }))}
              >
                Low Confidence
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedListings.size === filteredListings.length && filteredListings.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Beds/Baths/Cars</TableHead>
                <TableHead>Inspection</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredListings.map((listing) => (
                <TableRow key={listing.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Checkbox
                      checked={selectedListings.has(listing.id)}
                      onCheckedChange={(checked) => handleSelectListing(listing.id, !!checked)}
                    />
                  </TableCell>
                  
                  <TableCell>
                    <div>
                      <div className="font-medium">{listing.address || 'Unknown Address'}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{listing.suburb || 'Unknown Suburb'}</span>
                        {listing.propertyType && (
                          <Badge variant="outline" className="text-xs">
                            {listing.propertyType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {listing.price ? formatCurrency(listing.price) : '-'}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm">
                      {listing.beds > 0 && (
                        <div className="flex items-center gap-1">
                          <Bed className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.beds}</span>
                        </div>
                      )}
                      {listing.baths > 0 && (
                        <div className="flex items-center gap-1">
                          <Bath className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.baths}</span>
                        </div>
                      )}
                      {listing.carSpaces > 0 && (
                        <div className="flex items-center gap-1">
                          <Car className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.carSpaces}</span>
                        </div>
                      )}
                      {!listing.beds && !listing.baths && !listing.carSpaces && (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {listing.inspectionStart ? (
                      <div className="text-sm">
                        {formatDate(listing.inspectionStart)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      {listing.sourceHost || 'Unknown'}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {listing.confidence !== undefined ? (
                      <ConfidenceBadge confidence={listing.confidence} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    {listing.receivedAt ? (
                      <div className="text-sm">
                        {formatDate(listing.receivedAt)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDetailsModal(listing)}>
                          Open Details
                        </DropdownMenuItem>
                        {listing.url && (
                          <DropdownMenuItem onClick={() => openSourceUrl(listing.url!)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Source
                          </DropdownMenuItem>
                        )}
                        {listing.address && (
                          <DropdownMenuItem onClick={() => copyToClipboard(listing.address!, "Address")}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Address
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredListings.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground">
                No listings found matching your criteria.
              </div>
              <Button variant="outline" onClick={loadListings} className="mt-4">
                Refresh Data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ListingDetailsModal 
        listing={selectedListing}
        isOpen={isDetailsModalOpen}
        onClose={closeDetailsModal}
      />
    </div>
  );
}