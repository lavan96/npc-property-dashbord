import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@/contexts/SearchContext';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Search, Download, ExternalLink, Copy, MoreHorizontal, Bed, Bath, Car, BarChart3, X, FileText, RefreshCw, Loader2, Building2, CalendarCheck, AlertTriangle, EyeOff, List, Table2 } from 'lucide-react';
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
import { AirtableTableSelector, getSelectedAirtableTable } from '@/components/listings/AirtableTableSelector';

import { buildFullAddress, extractAUState, extractPostcode } from '@/lib/addressUtils';
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
import { ReportActionMenu } from '@/components/reports/ReportActionMenu';
import { useReportPreferences, type ReportScope, type ReportTier } from '@/hooks/useReportPreferences';
import { useNavigate } from 'react-router-dom';
import { ListingRowContextMenu } from '@/components/listings/ListingRowContextMenu';
import { ReportCommandPalette } from '@/components/reports/ReportCommandPalette';
import { Command as CommandIcon } from 'lucide-react';
import { cn } from '@/lib/utils';


const LISTINGS_SHELL = 'mx-auto w-full max-w-[1600px] overflow-x-hidden px-3 pb-28 pt-2 sm:px-5 md:pb-10 lg:px-8';
const LISTINGS_SECTION_SURFACE = 'min-w-0 rounded-[1.5rem] border border-border/60 bg-card/65 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-card/55 sm:rounded-[1.85rem] sm:p-5 md:p-6 dark:border-white/10 dark:bg-slate-950/35 dark:shadow-black/25';
const LISTINGS_CARD_SURFACE = 'rounded-2xl border border-border/70 bg-card/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/30';
const LISTINGS_SECONDARY_ACTION = 'min-h-10 rounded-full border-border/70 bg-card/85 px-4 font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_rgba(245,158,11,0.16)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const LISTINGS_CHIP_ACTION = 'h-9 rounded-full px-3.5 text-xs font-semibold shadow-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:opacity-60';
const LISTINGS_CHIP_INACTIVE = 'border-border/70 bg-background/80 text-muted-foreground hover:-translate-y-0.5 hover:border-amber-400/45 hover:bg-amber-50/70 hover:text-amber-700 dark:border-white/10 dark:bg-slate-950/45 dark:hover:bg-amber-400/10 dark:hover:text-amber-200';
const LISTINGS_CHIP_ACTIVE = 'border-amber-400/70 bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-[0_10px_24px_rgba(245,158,11,0.28)] hover:-translate-y-0.5 hover:from-amber-500 hover:to-amber-400 hover:text-white dark:border-amber-300/60';
const LISTINGS_HEADER_ICON_ACTION = 'min-h-10 rounded-full border-border/70 bg-card/85 px-3 font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_rgba(245,158,11,0.16)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const LISTINGS_VIEW_SWITCHER = 'inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/45 p-1 shadow-inner dark:border-white/10 dark:bg-white/[0.04]';
const LISTINGS_VIEW_CONTROL = 'h-9 rounded-full px-3 text-xs font-bold tracking-[0.01em] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 disabled:cursor-default';
const LISTINGS_VIEW_CONTROL_ACTIVE = 'border-primary/45 bg-background text-foreground shadow-[0_8px_22px_rgba(15,23,42,0.10)] ring-1 ring-primary/20 dark:bg-slate-900 dark:shadow-black/30';
const LISTINGS_VIEW_CONTROL_INACTIVE = 'border-transparent bg-transparent text-muted-foreground/75 hover:bg-background/70 hover:text-foreground dark:hover:bg-white/[0.06]';
const LISTINGS_REFRESH_ACTION = 'min-h-10 rounded-full border-border/70 bg-card/85 px-4 font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_rgba(245,158,11,0.16)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 data-[refreshing=true]:border-primary/35 data-[refreshing=true]:bg-primary/10 data-[refreshing=true]:text-primary';
const LISTING_MISSING_VALUE = 'inline-flex min-h-6 items-center rounded-full border border-dashed border-border/70 bg-muted/30 px-2.5 text-sm font-medium text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]';
const LISTING_TABLE_HEAD = 'h-10 whitespace-nowrap px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/85';

// Lazy load heavy modal components
const ListingDetailsModal = lazy(() => import('@/components/listings/ListingDetailsModal').then(m => ({ default: m.ListingDetailsModal })));
const InvestmentReportModal = lazy(() => import('@/components/listings/InvestmentReportModal').then(m => ({ default: m.InvestmentReportModal })));
const BulkGenerationModal = lazy(() => import('@/components/listings/BulkGenerationModal').then(m => ({ default: m.BulkGenerationModal })));

// Default empty filter state — keyword always starts blank
const DEFAULT_FILTERS = {
  propertyType: 'all',
  suburb: 'all',
  state: 'all',
  zipCode: 'all',
  sourceHost: 'all',
  hasInspection: false,
  lowConfidence: false,
  offMarket: false,
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

// buildFullAddress, extractAUState, extractPostcode now imported from @/lib/addressUtils

export default function Listings() {
  const { canEdit: canEditListings, canDelete: canDeleteListings } = useModulePermissions('listings');
  const { globalSearchQuery, setGlobalSearchQuery } = useSearch();
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();
  
  const [selectedTable, setSelectedTable] = useState<string | null>(() => getSelectedAirtableTable());

  // Use React Query for caching and efficient data fetching
  const { data: listings = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['listings', selectedTable ?? '__default__'],
    queryFn: async () => {
      const result = await propertyDataService.fetchAllListings({
        includeDebugInfo: true,
        tableName: selectedTable ?? undefined,
      });
      return result.listings;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  
  // Load filters from localStorage — always reset keywordSearch to blank on mount
  const [filters, setFilters] = useState(() => {
    const savedFilters = localStorage.getItem('listingFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        // Always reset keyword search to blank on page load to prevent stale pre-population
        return { ...DEFAULT_FILTERS, ...parsed, keywordSearch: '' };
      } catch (e) {
        console.error('Failed to parse saved filters:', e);
      }
    }
    return { ...DEFAULT_FILTERS };
  });

  const [selectedListing, setSelectedListing] = useState<PropertyListing | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [investmentReportListing, setInvestmentReportListing] = useState<PropertyListing | null>(null);
  const [isInvestmentReportModalOpen, setIsInvestmentReportModalOpen] = useState(false);
  const [isBulkGenerationModalOpen, setIsBulkGenerationModalOpen] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const { prefs, update: updatePrefs, recordLastUsed, effectiveScope, effectiveTier } = useReportPreferences();
  // Per-row pending scope/tier choice in the picker (controlled)
  const [rowPicker, setRowPicker] = useState<Record<string, { scope: ReportScope; tier: ReportTier }>>({});
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Sync global search with local search when component mounts or global search changes
  useEffect(() => {
    setSearchQuery(globalSearchQuery);
  }, [globalSearchQuery]);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('listingFilters', JSON.stringify(filters));
  }, [filters]);

  // Refresh function — bypass cache for explicit user refresh
  const loadListings = useCallback(() => {
    propertyDataService.clearCache();
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

  // Get unique values for filter options — extract state from address if field is empty
  const uniqueValues = useMemo(() => {
    const propertyTypes = [...new Set(listings.map(l => l.propertyType).filter(Boolean))].sort();
    const suburbs = [...new Set(listings.map(l => l.suburb).filter(Boolean))].sort();
    const sourceHosts = [...new Set(listings.map(l => l.sourceHost).filter(Boolean))].sort();
    const agencies = [...new Set(listings.map(l => l.agencyName).filter(Boolean))].sort();
    
    // Extract states from both field and address — AU states only
    const states = [...new Set(listings.map(l => {
      if (l.state) return l.state;
      return extractAUState(l.address || '');
    }).filter(Boolean))].sort() as string[];

    const zipCodes = [...new Set(listings.map(l => {
      if (l.zipCode) return l.zipCode;
      return extractPostcode(l.address || '');
    }).filter(Boolean))].sort() as string[];
    
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
        
        if (!searchText.includes(query)) return false;
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
        
        if (!keywords.every(kw => contentText.includes(kw))) return false;
      }

      // Property type filter
      if (filters.propertyType && filters.propertyType !== 'all' && listing.propertyType !== filters.propertyType) return false;

      // Suburb filter (with nearby suburbs support)
      if (filters.suburb && filters.suburb !== 'all') {
        if (filters.includeNearbySuburbs && nearbySuburbsList) {
          if (!listing.suburb || !nearbySuburbsList.includes(listing.suburb)) return false;
        } else {
          if (listing.suburb !== filters.suburb) return false;
        }
      }

      // State filter — check both field and extracted from address
      if (filters.state && filters.state !== 'all') {
        const listingState = listing.state || extractAUState(listing.address || '');
        if (listingState !== filters.state) return false;
      }

      // Postcode filter — check both field and extracted
      if (filters.zipCode && filters.zipCode !== 'all') {
        const listingPostcode = listing.zipCode || extractPostcode(listing.address || '');
        if (listingPostcode !== filters.zipCode) return false;
      }

      // Source host filter
      if (filters.sourceHost && filters.sourceHost !== 'all' && listing.sourceHost !== filters.sourceHost) return false;

      // Has inspection filter
      if (filters.hasInspection && !listing.inspectionStart) return false;

      // Low confidence filter
      if (filters.lowConfidence && (listing.confidence === undefined || listing.confidence >= 0.7)) return false;

      // Off-market filter
      if (filters.offMarket) {
        const status = (listing.status || '').toLowerCase();
        const category = (listing.category || '').toLowerCase();
        const isOffMarket = status.includes('off-market') || status.includes('off market') || 
                            category.includes('off-market') || category.includes('off market');
        if (!isOffMarket) return false;
      }

      // Agency filter
      if (filters.agencyName && filters.agencyName !== 'all' && listing.agencyName !== filters.agencyName) return false;

      // Price filters
      const hasPriceFilter = filters.priceMin || filters.priceMax;
      if (hasPriceFilter && (!listing.price || listing.price <= 0)) return false;
      if (filters.priceMin && listing.price && listing.price < parseFloat(filters.priceMin)) return false;
      if (filters.priceMax && listing.price && listing.price > parseFloat(filters.priceMax)) return false;

      // Bedroom filters
      if (filters.bedsMin && listing.beds && listing.beds < parseInt(filters.bedsMin)) return false;
      if (filters.bedsMax && listing.beds && listing.beds > parseInt(filters.bedsMax)) return false;

      // Bathroom filters
      if (filters.bathsMin && listing.baths && listing.baths < parseInt(filters.bathsMin)) return false;
      if (filters.bathsMax && listing.baths && listing.baths > parseInt(filters.bathsMax)) return false;

      // Car space filters
      if (filters.carsMin && listing.carSpaces && listing.carSpaces < parseInt(filters.carsMin)) return false;
      if (filters.carsMax && listing.carSpaces && listing.carSpaces > parseInt(filters.carsMax)) return false;

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

  /**
   * Phase B: launch report generation with explicit scope+tier.
   * - address+compass uses the existing per-listing modal (zero-regression path).
   * - everything else routes to /reports with prefilled URL params.
   */
  const launchScopedGeneration = useCallback(
    (listing: PropertyListing, scope: ReportScope, tier: ReportTier) => {
      void recordLastUsed(scope, tier);

      if (scope === 'address' && tier === 'compass') {
        openInvestmentReportModal(listing);
        return;
      }

      const queryByScope: Record<ReportScope, string> = {
        address: buildFullAddress(listing),
        suburb: listing.suburb || listing.location || '',
        zipcode: extractPostcode(buildFullAddress(listing)) || '',
        state: extractAUState(buildFullAddress(listing)) || '',
      };
      const q = queryByScope[scope];
      if (!q) {
        toast({
          title: 'Missing data',
          description: `Could not determine ${scope} from this listing.`,
          variant: 'destructive',
        });
        return;
      }
      const params = new URLSearchParams({ scope, q, tier });
      navigate(`/reports?${params.toString()}`);
    },
    [navigate, recordLastUsed, toast]
  );

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
    setFilters({ ...DEFAULT_FILTERS });
  };

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (['propertyType', 'suburb', 'state', 'zipCode', 'sourceHost', 'agencyName'].includes(key)) {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  });

  if (isLoading) {
    return (
      <div className={`${LISTINGS_SHELL} space-y-5 md:space-y-7`}>
        <div className={LISTINGS_SECTION_SURFACE}>
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/90">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_14px_rgba(245,158,11,0.55)]" />
              Property Intelligence
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.045em] text-foreground md:text-4xl">Listings</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground/90 md:text-base">Manage and review property listings</p>
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
          <Card className={LISTINGS_CARD_SURFACE}>
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
    <div className={`${LISTINGS_SHELL} space-y-5 md:space-y-7`}>
      {/* Header */}
      <section className={`${LISTINGS_SECTION_SURFACE} relative overflow-hidden bg-gradient-to-br from-card/95 via-card/80 to-primary/5 dark:from-slate-950/80 dark:via-slate-950/55 dark:to-primary/10`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/90 shadow-sm dark:border-primary/20 dark:bg-primary/10">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_14px_rgba(245,158,11,0.55)]" />
              Property Intelligence
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="text-4xl font-bold tracking-[-0.06em] text-foreground md:text-5xl">Listings</h1>
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/45">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="tabular-nums">{filteredListings.length} of {listings.length}</span>
                <span className="font-medium text-muted-foreground">properties</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-start gap-3 rounded-[1.35rem] border border-border/60 bg-background/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-950/40 dark:shadow-black/20 lg:justify-end">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/50 bg-card/70 p-1.5 shadow-sm dark:border-white/10 dark:bg-slate-950/35">
              <span className="hidden pl-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 sm:inline">Dataset</span>
              <AirtableTableSelector
                value={selectedTable}
                onChange={(next) => {
                  setSelectedTable(next);
                  propertyDataService.clearCache();
                }}
              />
            </div>

            <div className={LISTINGS_VIEW_SWITCHER} role="group" aria-label="Listing view mode">
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={isMobile}
                className={cn(LISTINGS_VIEW_CONTROL, 'gap-1.5', isMobile ? LISTINGS_VIEW_CONTROL_ACTIVE : LISTINGS_VIEW_CONTROL_INACTIVE)}
              >
                <List className="h-4 w-4" />
                List
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={!isMobile}
                className={cn(LISTINGS_VIEW_CONTROL, 'gap-1.5', !isMobile ? LISTINGS_VIEW_CONTROL_ACTIVE : LISTINGS_VIEW_CONTROL_INACTIVE)}
              >
                <Table2 className="h-4 w-4" />
                Table
              </Button>
            </div>

            {isFetching && (
              <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary shadow-sm md:inline-flex" role="status">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Refreshing data
              </div>
            )}

            {selectedListings.size > 0 && !isMobile && (
              <Button variant="outline" size="sm" className={`${LISTINGS_SECONDARY_ACTION} gap-2`}>
                <Download className="h-4 w-4" />
                Export ({selectedListings.size})
              </Button>
            )}
            <Button
              onClick={() => setIsCommandPaletteOpen(true)}
              size="sm"
              variant="outline"
              className={`${LISTINGS_HEADER_ICON_ACTION} gap-2`}
              aria-label="Open command palette"
            >
              <CommandIcon className="h-4 w-4" />
              <kbd className="hidden pointer-events-none h-5 select-none items-center rounded-full border border-border/70 bg-muted/80 px-1.5 font-mono text-[10px] font-semibold text-muted-foreground md:inline-flex">
                ⌘K
              </kbd>
            </Button>
            <Button onClick={loadListings} size="sm" variant="outline" disabled={isFetching} data-refreshing={isFetching} className={`${LISTINGS_REFRESH_ACTION} gap-2`}>
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden md:inline">{isFetching ? 'Refreshing...' : 'Refresh'}</span>
            </Button>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className={`${LISTINGS_SECTION_SURFACE} space-y-6 bg-gradient-to-br from-card/95 via-card/80 to-amber-50/40 ring-1 ring-amber-400/10 dark:from-slate-950/70 dark:via-slate-950/50 dark:to-amber-950/10`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="group relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center justify-center">
              <Search className="h-5 w-5 text-muted-foreground transition-colors duration-200 group-focus-within:text-amber-600 dark:group-focus-within:text-amber-300" />
            </div>
            <Input
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search properties"
              className="h-14 rounded-full border-border/70 bg-background/95 pl-14 pr-5 text-[15px] font-medium shadow-[0_14px_36px_rgba(15,23,42,0.10)] transition-all duration-200 placeholder:text-muted-foreground/65 hover:border-amber-300/70 hover:bg-background focus-visible:border-amber-400 focus-visible:ring-4 focus-visible:ring-amber-400/20 dark:border-white/10 dark:bg-slate-950/70 dark:hover:border-amber-300/35 sm:h-16 sm:text-base"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
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
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-10 rounded-full px-3 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive/25">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2.5 border-t border-border/50 pt-4 sm:gap-3 dark:border-white/10">
          <Button
            variant={filters.hasInspection ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, hasInspection: !prev.hasInspection }))}
            className={cn(LISTINGS_CHIP_ACTION, "gap-1.5", filters.hasInspection ? LISTINGS_CHIP_ACTIVE : LISTINGS_CHIP_INACTIVE, filters.hasInspection && "ring-1 ring-amber-300/70 ring-offset-1 ring-offset-background")}
          >
            <CalendarCheck className="h-4 w-4" />
            Has Inspection
          </Button>
          <Button
            variant={filters.lowConfidence ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, lowConfidence: !prev.lowConfidence }))}
            className={cn(LISTINGS_CHIP_ACTION, "gap-1.5", filters.lowConfidence ? LISTINGS_CHIP_ACTIVE : LISTINGS_CHIP_INACTIVE, filters.lowConfidence && "ring-1 ring-amber-300/70 ring-offset-1 ring-offset-background")}
          >
            <AlertTriangle className={cn("h-4 w-4", filters.lowConfidence ? "text-white" : "text-amber-600 dark:text-amber-300")} />
            Low Confidence
          </Button>
          <Button
            variant={filters.offMarket ? "default" : "outline"}
            size="sm"
            onClick={() => setFilters(prev => ({ ...prev, offMarket: !prev.offMarket }))}
            className={cn(LISTINGS_CHIP_ACTION, "gap-1.5", filters.offMarket ? LISTINGS_CHIP_ACTIVE : LISTINGS_CHIP_INACTIVE, filters.offMarket && "ring-1 ring-amber-300/70 ring-offset-1 ring-offset-background")}
          >
            <EyeOff className="h-4 w-4" />
            Off-Market
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
      </section>

      {/* Content: Cards on Mobile, Table on Desktop */}
      {isMobile ? (
        <div className="space-y-3">
          {filteredListings.length === 0 ? (
            <Card className={LISTINGS_CARD_SURFACE}>
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
                onCopyAddress={() => copyToClipboard(buildFullAddress(listing), 'Full address')}
                onOpenSource={listing.url ? () => openSourceUrl(listing.url!) : undefined}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))
          )}
        </div>
      ) : (
        <Card className={cn(LISTINGS_CARD_SURFACE, LISTINGS_TABLE_CARD)}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[1180px] border-separate border-spacing-0">
            <TableHeader className="bg-muted/45 dark:bg-white/[0.04]">
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableHead className={cn(LISTING_TABLE_HEAD, "w-14 pl-5")}>
                  <Checkbox
                    checked={selectedListings.size === filteredListings.length && filteredListings.length > 0}
                    onCheckedChange={handleSelectAll}
                    className={LISTING_SELECTION_CHECKBOX}
                    aria-label="Select all listings"
                  />
                </TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[320px]")}>Property</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[140px] text-right")}>Price</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[170px]")}>Beds/Baths/Cars</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[180px]")}>Inspection</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[170px]")}>Source</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[130px]")}>Confidence</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "min-w-[180px] text-right")}>Received</TableHead>
                <TableHead className={cn(LISTING_TABLE_HEAD, "w-16 pr-5 text-right")}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredListings.map((listing) => (
                <ListingRowContextMenu
                  key={listing.id}
                  label={listing.address || listing.location}
                  isSelected={selectedListings.has(listing.id)}
                  canGenerate={canEditListings}
                  effectiveScope={effectiveScope}
                  effectiveTier={effectiveTier}
                  onQuickGenerate={() => launchScopedGeneration(listing, effectiveScope, effectiveTier)}
                  onGenerateWithScope={({ scope, tier }) => launchScopedGeneration(listing, scope, tier)}
                  onToggleSelect={() => handleSelectListing(listing.id, !selectedListings.has(listing.id))}
                  onOpenDetails={() => openDetailsModal(listing)}
                  onCopyAddress={() => copyToClipboard(buildFullAddress(listing), 'Full address')}
                  onOpenSource={listing.url ? () => openSourceUrl(listing.url!) : undefined}
                >
                  <TableRow
                    className={cn(
                      "group relative border-b border-border/55 bg-card/80 transition-all duration-200 hover:bg-gradient-to-r hover:from-primary/[0.085] hover:via-primary/[0.04] hover:to-transparent hover:shadow-[inset_0_1px_0_hsl(var(--primary)/0.10),inset_0_-1px_0_hsl(var(--primary)/0.08)] focus-within:bg-primary/[0.055] dark:border-white/10 dark:bg-slate-950/55 dark:hover:from-primary/10 dark:hover:via-white/[0.035]",
                      selectedListings.has(listing.id) && "bg-gradient-to-r from-primary/[0.13] via-primary/[0.075] to-card shadow-[inset_5px_0_0_hsl(var(--primary)),inset_0_1px_0_hsl(var(--primary)/0.18),0_10px_28px_rgba(245,158,11,0.10)] hover:from-primary/[0.16] hover:via-primary/[0.09] dark:from-primary/15 dark:via-primary/10 dark:to-slate-950/55"
                    )}
                  >
                    {/* preserve original cells */}
                  <TableCell className="py-3 pl-5 align-middle">
                    <Checkbox
                      checked={selectedListings.has(listing.id)}
                      onCheckedChange={(checked) => handleSelectListing(listing.id, !!checked)}
                    />
                  </TableCell>
                  
                  <TableCell className="py-3 align-middle">
                    <div className="min-w-0 space-y-1.5">
                      <div className={cn(
                        "max-w-[360px] truncate text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground",
                        !listing.address && "text-muted-foreground"
                      )}>
                        {listing.address || 'Unknown Address'}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="min-w-0 truncate leading-5">
                          {listing.suburb || 'Unknown Suburb'}
                          {(listing.state || extractAUState(listing.address || '')) && `, ${listing.state || extractAUState(listing.address || '')}`}
                          {(listing.zipCode || extractPostcode(listing.address || '')) && ` ${listing.zipCode || extractPostcode(listing.address || '')}`}
                        </span>
                        {listing.propertyType && (
                          <Badge variant="outline" className={cn(LISTING_BADGE_BASE, LISTING_PROPERTY_TYPE_BADGE)}>
                            {listing.propertyType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="py-3 text-right align-middle">
                    {listing.price && listing.price > 0 ? (
                      <span className="font-semibold tabular-nums text-foreground">{formatCurrency(listing.price)}</span>
                    ) : (
                      <span className={LISTING_MISSING_VALUE}>-</span>
                    )}
                  </TableCell>
                  
                  <TableCell className="py-3 align-middle">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="inline-flex min-w-10 items-center justify-center gap-1.5 rounded-full bg-muted/45 px-2.5 py-1.5">
                        <Bed className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={cn("font-semibold tabular-nums", !(listing.beds && listing.beds > 0) && "text-muted-foreground")}>{listing.beds && listing.beds > 0 ? listing.beds : '-'}</span>
                      </div>
                      <div className="inline-flex min-w-10 items-center justify-center gap-1.5 rounded-full bg-muted/45 px-2.5 py-1.5">
                        <Bath className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={cn("font-semibold tabular-nums", !(listing.baths && listing.baths > 0) && "text-muted-foreground")}>{listing.baths && listing.baths > 0 ? listing.baths : '-'}</span>
                      </div>
                      <div className="inline-flex min-w-10 items-center justify-center gap-1.5 rounded-full bg-muted/45 px-2.5 py-1.5">
                        <Car className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={cn("font-semibold tabular-nums", !(listing.carSpaces && listing.carSpaces > 0) && "text-muted-foreground")}>{listing.carSpaces && listing.carSpaces > 0 ? listing.carSpaces : '-'}</span>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell className="py-3 align-middle">
                    {listing.inspectionStart ? (
                      <div className="inline-flex rounded-xl border border-border/60 bg-background/65 px-3 py-1.5 text-sm font-medium tabular-nums shadow-sm">{formatDate(listing.inspectionStart)}</div>
                    ) : (
                      <span className={LISTING_MISSING_VALUE}>-</span>
                    )}
                  </TableCell>
                  
                  <TableCell className="py-3 align-middle">
                    <div className={cn("max-w-[180px] truncate text-sm font-medium leading-5", !listing.agencyName && "text-muted-foreground")}>{listing.agencyName || 'Unknown Agency'}</div>
                  </TableCell>
                  
                  <TableCell className="py-3 align-middle">
                    {listing.confidence !== undefined && listing.confidence !== null ? (
                      <div className="inline-flex rounded-full bg-background/70 p-0.5 shadow-sm ring-1 ring-border/55">
                        <ConfidenceBadge confidence={listing.confidence} className={cn(LISTING_CONFIDENCE_BADGE, getListingConfidenceBadgeTone(listing.confidence))} />
                      </div>
                    ) : (
                      <span className={LISTING_MISSING_VALUE}>-</span>
                    )}
                  </TableCell>
                  
                  <TableCell className="py-3 text-right align-middle">
                    {listing.receivedAt ? (
                      <div className="text-sm font-medium tabular-nums text-muted-foreground">{formatDate(listing.receivedAt)}</div>
                    ) : (
                      <span className={LISTING_MISSING_VALUE}>-</span>
                    )}
                  </TableCell>
                  
                  <TableCell className="py-3 pr-5 text-right align-middle">
                    {(() => {
                      const current = rowPicker[listing.id] ?? { scope: effectiveScope, tier: effectiveTier };
                      return (
                        <ReportActionMenu
                          surface="listing-row"
                          label={listing.address || listing.location}
                          callbacks={{
                            onOpenDetails: () => openDetailsModal(listing),
                            onOpenSource: listing.url ? () => openSourceUrl(listing.url!) : undefined,
                            onCopyAddress: () => copyToClipboard(buildFullAddress(listing), 'Full address'),
                            onOpenGenerateModal: canEditListings ? () => openInvestmentReportModal(listing) : undefined,
                            onGenerateWithScope: canEditListings
                              ? ({ scope, tier }) => launchScopedGeneration(listing, scope, tier)
                              : undefined,
                          }}
                          permissions={{ canGenerate: canEditListings }}
                          triggerClassName="h-9 w-9 rounded-full border border-border/70 bg-background/85 text-muted-foreground opacity-80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/10 hover:text-primary hover:opacity-100 hover:shadow-[0_10px_24px_rgba(245,158,11,0.18)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 group-hover:opacity-100 data-[state=open]:border-primary/50 data-[state=open]:bg-primary/12 data-[state=open]:text-primary data-[state=open]:opacity-100"
                          generatePicker={
                            canEditListings
                              ? {
                                  scope: current.scope,
                                  tier: current.tier,
                                  defaultScope: prefs.default_scope,
                                  defaultTier: prefs.default_tier,
                                  onChange: (next) =>
                                    setRowPicker((m) => ({ ...m, [listing.id]: next })),
                                  onSaveDefault: ({ scope, tier }) =>
                                    updatePrefs({ default_scope: scope, default_tier: tier }),
                                }
                              : undefined
                          }
                        />
                      );
                    })()}
                  </TableCell>
                </TableRow>
                </ListingRowContextMenu>
              ))}
            </TableBody>
          </Table>
            </div>
          
          {filteredListings.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground">
                No listings found matching your criteria.
              </div>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearAllFilters} className="mt-4 mr-2">
                  Clear Filters
                </Button>
              )}
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
            propertyAddress={investmentReportListing ? buildFullAddress(investmentReportListing) : ''}
            propertyDetails={investmentReportListing}
          />
        </Suspense>
      )}

      {/* Phase C: ⌘K command palette */}
      <ReportCommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        listings={filteredListings}
        selectedIds={selectedListings}
        effectiveScope={effectiveScope}
        effectiveTier={effectiveTier}
        canGenerate={canEditListings}
        onGenerateForListing={(listing, scope, tier) => launchScopedGeneration(listing, scope, tier)}
        onOpenBulkGeneration={() => setIsBulkGenerationModalOpen(true)}
        onToggleSelect={(id) => handleSelectListing(id, !selectedListings.has(id))}
        onClearSelection={() => setSelectedListings(new Set())}
      />

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
          <Card className="rounded-2xl border border-primary/25 bg-card/95 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur dark:border-primary/30 dark:bg-slate-950/90 dark:shadow-black/45">
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
                
                {canEditListings && (
                  <Button
                    onClick={() => setIsBulkGenerationModalOpen(true)}
                    disabled={selectedListings.size < 2 || selectedListings.size > 10}
                    size="sm"
                    className="shrink-0 text-xs md:text-sm"
                  >
                    <FileText className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Generate Reports</span>
                  </Button>
                )}
                
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
