import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@/contexts/SearchContext';
import { Search, Download, ExternalLink, Copy, MoreHorizontal, Bed, Bath, Car, BarChart3, X, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfidenceBadge } from '@/components/dashboard/ConfidenceBadge';
import { ListingFilters } from '@/components/listings/ListingFilters';
import { MobileFilterSheet } from '@/components/listings/MobileFilterSheet';
import { PropertyCard } from '@/components/listings/PropertyCard';
import { propertyDataService } from '@/services/propertyDataService';
import { PropertyListing } from '@/lib/airtable';
import { getNearbySuburbs } from '@/lib/postcodeProximity';
import { useIsMobile } from '@/hooks/use-mobile';
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

// Lazy load heavy modal components
const ListingDetailsModal = lazy(() => import('@/components/listings/ListingDetailsModal').then(m => ({ default: m.ListingDetailsModal })));
const InvestmentReportModal = lazy(() => import('@/components/listings/InvestmentReportModal').then(m => ({ default: m.InvestmentReportModal })));
const BulkGenerationModal = lazy(() => import('@/components/listings/BulkGenerationModal').then(m => ({ default: m.BulkGenerationModal })));

export default function Listings() {
  const { globalSearchQuery, setGlobalSearchQuery } = useSearch();
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();
  
  // Use React Query for caching and efficient data fetching
  const { data: listings = [], isLoading, refetch } = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      const result = await propertyDataService.fetchAllListings({
        includeDebugInfo: true
      });
      console.log(`Fetched listings (already deduplicated server-side): ${result.listings.length}`);
      return result.listings;
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
  
  // Load filters from localStorage on mount
  const [filters, setFilters] = useState(() => {
    const savedFilters = localStorage.getItem('listingFilters');
    if (savedFilters) {
      try {
        return JSON.parse(savedFilters);
      } catch (e) {
        console.error('Failed to parse saved filters:', e);
      }
    }
    return {
      propertyType: 'all',
      suburb: 'all',
      state: 'all',
      zipCode: 'all',
      sourceHost: 'all',
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
      agencyName: 'all',
      keywordSearch: '',
      includeNearbySuburbs: false,
    };
  });
  const [selectedListing, setSelectedListing] = useState<PropertyListing | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [investmentReportListing, setInvestmentReportListing] = useState<PropertyListing | null>(null);
  const [isInvestmentReportModalOpen, setIsInvestmentReportModalOpen] = useState(false);
  const [isBulkGenerationModalOpen, setIsBulkGenerationModalOpen] = useState(false);
  
  const { toast } = useToast();


  // Sync global search with local search when component mounts or global search changes
  useEffect(() => {
    setSearchQuery(globalSearchQuery);
  }, [globalSearchQuery]);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('listingFilters', JSON.stringify(filters));
  }, [filters]);

  // Refresh function using React Query's refetch
  const loadListings = useCallback(() => {
    refetch();
  }, [refetch]);

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

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'Unknown';
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid Date';
    
    return new Intl.DateTimeFormat('en-AU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  };

  // Get unique values for filter options
  const uniqueValues = useMemo(() => {
    const propertyTypes = [...new Set(listings.map(l => l.propertyType).filter(Boolean))].sort();
    const suburbs = [...new Set(listings.map(l => l.suburb).filter(Boolean))].sort();
    const sourceHosts = [...new Set(listings.map(l => l.sourceHost).filter(Boolean))].sort();
    const agencies = [...new Set(listings.map(l => l.agencyName).filter(Boolean))].sort();
    
    // Get states and zip codes from actual fields
    const states = [...new Set(listings.map(l => l.state).filter(Boolean))].sort();
    const zipCodes = [...new Set(listings.map(l => l.zipCode).filter(Boolean))].sort();
    
    return { propertyTypes, suburbs, states, zipCodes, sourceHosts, agencies };
  }, [listings]);

  // Compute nearby suburbs when the filter is active
  const nearbySuburbsList = useMemo(() => {
    if (filters.includeNearbySuburbs && filters.suburb && filters.suburb !== 'all') {
      return getNearbySuburbs(filters.suburb, listings);
    }
    return null;
  }, [filters.includeNearbySuburbs, filters.suburb, listings]);

  // Memoize filtered listings for performance
  const filteredListings = useMemo(() => {
    return listings.filter(listing => {
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

      // Keyword search across summary, rawExtract, keyEntities, description
      if (filters.keywordSearch) {
        const keywords = filters.keywordSearch.toLowerCase().split(/[,\s]+/).filter(Boolean);
        const contentText = [
          listing.summary,
          listing.rawExtract,
          listing.keyEntities,
          listing.description,
          listing.address,
        ].filter(Boolean).join(' ').toLowerCase();
        
        // All keywords must match (AND logic)
        if (!keywords.every(kw => contentText.includes(kw))) {
          return false;
        }
      }

      // Property type filter
      if (filters.propertyType && filters.propertyType !== 'all' && listing.propertyType !== filters.propertyType) {
        return false;
      }

      // Suburb filter (with nearby suburbs support)
      if (filters.suburb && filters.suburb !== 'all') {
        if (filters.includeNearbySuburbs && nearbySuburbsList) {
          if (!listing.suburb || !nearbySuburbsList.includes(listing.suburb)) {
            return false;
          }
        } else {
          if (listing.suburb !== filters.suburb) {
            return false;
          }
        }
      }

      // State filter
      if (filters.state && filters.state !== 'all' && listing.state !== filters.state) {
        return false;
      }

      // Zip code filter
      if (filters.zipCode && filters.zipCode !== 'all' && listing.zipCode !== filters.zipCode) {
        return false;
      }

      // Source host filter
      if (filters.sourceHost && filters.sourceHost !== 'all' && listing.sourceHost !== filters.sourceHost) {
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
      if (filters.agencyName && filters.agencyName !== 'all' && listing.agencyName !== filters.agencyName) {
        return false;
      }

      // Price filters - exclude properties without pricing when price filter is active
      const hasPriceFilter = filters.priceMin || filters.priceMax;
      if (hasPriceFilter && (!listing.price || listing.price <= 0)) {
        return false;
      }

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
  }, [listings, searchQuery, filters, nearbySuburbsList]);

  const openDetailsModal = (listing: PropertyListing) => {
    setSelectedListing(listing);
    setIsDetailsModalOpen(true);
  };

  const openInvestmentReportModal = (listing: PropertyListing) => {
    setInvestmentReportListing(listing);
    setIsInvestmentReportModalOpen(true);
  };

  const closeDetailsModal = () => {
    setSelectedListing(null);
    setIsDetailsModalOpen(false);
  };

  const toggleSelectAll = () => {
    if (selectedListings.size === filteredListings.length) {
      setSelectedListings(new Set());
    } else {
      setSelectedListings(new Set(filteredListings.map(l => l.id)));
    }
  };

  const clearAllFilters = () => {
    setFilters({
      propertyType: 'all',
      suburb: 'all',
      state: 'all',
      zipCode: 'all',
      sourceHost: 'all',
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
      agencyName: 'all',
      keywordSearch: '',
      includeNearbySuburbs: false,
    });
  };

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (key === 'propertyType' || key === 'suburb' || key === 'state' || key === 'zipCode' || key === 'sourceHost' || key === 'agencyName') {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  });

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Listings</h1>
            <p className="text-sm md:text-base text-muted-foreground">Manage and review property listings</p>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
          </div>
        </div>

        {isMobile ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
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
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Listings</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {filteredListings.length} of {listings.length} properties
          </p>
        </div>
        
        <div className="flex gap-2">
          {selectedListings.size > 0 && !isMobile && (
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export ({selectedListings.size})
            </Button>
          )}
          <Button onClick={loadListings} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          
          {/* Mobile uses sheet, desktop uses popover */}
          {isMobile ? (
            <MobileFilterSheet 
              filters={filters} 
              setFilters={setFilters}
              uniqueValues={uniqueValues}
            />
          ) : (
            <ListingFilters 
              filters={filters} 
              setFilters={setFilters}
              uniqueValues={uniqueValues}
            />
          )}
          
          {hasActiveFilters && !isMobile && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filters.hasInspection ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, hasInspection: !prev.hasInspection }))}
            className="h-8 text-xs"
          >
            Has Inspection
          </Button>
          <Button
            variant={filters.lowConfidence ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, lowConfidence: !prev.lowConfidence }))}
            className="h-8 text-xs"
          >
            Low Confidence
          </Button>
          {hasActiveFilters && isMobile && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAllFilters}
              className="h-8 text-xs text-destructive"
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Content: Cards on Mobile, Table on Desktop */}
      {isMobile ? (
        <div className="space-y-3">
          {filteredListings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No listings found.</p>
                <Button variant="outline" onClick={loadListings} className="mt-4">
                  Refresh
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredListings.map((listing) => (
              <PropertyCard
                key={listing.id}
                listing={listing}
                isSelected={selectedListings.has(listing.id)}
                onSelect={(checked) => handleSelectListing(listing.id, checked)}
                onOpenDetails={() => openDetailsModal(listing)}
                onOpenInvestmentReport={() => openInvestmentReportModal(listing)}
                onCopyAddress={() => copyToClipboard(listing.address || '', 'Address')}
                onOpenSource={listing.url ? () => openSourceUrl(listing.url!) : undefined}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))
          )}
        </div>
      ) : (
        <Card>
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
                        <span>
                          {listing.suburb || 'Unknown Suburb'}
                          {listing.state && `, ${listing.state}`}
                          {listing.zipCode && ` ${listing.zipCode}`}
                        </span>
                        {listing.propertyType && (
                          <Badge variant="outline" className="text-xs">
                            {listing.propertyType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {listing.price && listing.price > 0 ? formatCurrency(listing.price) : '-'}
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm">
                      {listing.beds && listing.beds > 0 ? (
                        <div className="flex items-center gap-1">
                          <Bed className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.beds}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Bed className="h-3 w-3 text-muted-foreground" />
                          <span>-</span>
                        </div>
                      )}
                      {listing.baths && listing.baths > 0 ? (
                        <div className="flex items-center gap-1">
                          <Bath className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.baths}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Bath className="h-3 w-3 text-muted-foreground" />
                          <span>-</span>
                        </div>
                      )}
                      {listing.carSpaces && listing.carSpaces > 0 ? (
                        <div className="flex items-center gap-1">
                          <Car className="h-3 w-3 text-muted-foreground" />
                          <span>{listing.carSpaces}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Car className="h-3 w-3 text-muted-foreground" />
                          <span>-</span>
                        </div>
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
                      {listing.agencyName || 'Unknown Agency'}
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
                        <DropdownMenuItem onClick={() => openInvestmentReportModal(listing)}>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Investment Report
                        </DropdownMenuItem>
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
      )}
      {/* Lazy loaded modals - only load when needed */}
      {isDetailsModalOpen && (
        <Suspense fallback={null}>
          <ListingDetailsModal 
            listing={selectedListing}
            isOpen={isDetailsModalOpen}
            onClose={closeDetailsModal}
          />
        </Suspense>
      )}

      {isInvestmentReportModalOpen && (
        <Suspense fallback={null}>
          <InvestmentReportModal
            isOpen={isInvestmentReportModalOpen}
            onClose={() => setIsInvestmentReportModalOpen(false)}
            propertyAddress={investmentReportListing ? `${investmentReportListing.address || ''} ${investmentReportListing.suburb || ''} ${investmentReportListing.state || ''} ${investmentReportListing.zipCode || ''}`.trim() : ''}
            propertyDetails={investmentReportListing}
          />
        </Suspense>
      )}

      {isBulkGenerationModalOpen && (
        <Suspense fallback={null}>
          <BulkGenerationModal
            open={isBulkGenerationModalOpen}
            onOpenChange={setIsBulkGenerationModalOpen}
            selectedProperties={listings.filter(l => selectedListings.has(l.id))}
            onComplete={() => {
              setSelectedListings(new Set());
              loadListings();
            }}
          />
        </Suspense>
      )}

      {/* Floating Action Bar */}
      {selectedListings.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md md:max-w-lg md:w-auto">
          <Card className="shadow-lg border-2">
            <CardContent className="py-2 px-3 md:py-3 md:px-6">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Checkbox 
                    checked={selectedListings.size === filteredListings.length}
                    onCheckedChange={toggleSelectAll}
                    className="shrink-0"
                  />
                  <span className="font-medium text-sm truncate">
                    {selectedListings.size} selected
                  </span>
                </div>
                
                <div className="h-6 w-px bg-border shrink-0 hidden md:block" />
                
                <Button
                  onClick={() => setIsBulkGenerationModalOpen(true)}
                  disabled={selectedListings.size < 2 || selectedListings.size > 10}
                  size="sm"
                  className="shrink-0 text-xs md:text-sm"
                >
                  <FileText className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Generate Reports</span>
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedListings(new Set())}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {(selectedListings.size < 2 || selectedListings.size > 10) && !isMobile && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedListings.size < 2 
                    ? 'Select at least 2 properties to generate bulk reports' 
                    : 'Maximum 10 properties allowed per bulk generation'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}