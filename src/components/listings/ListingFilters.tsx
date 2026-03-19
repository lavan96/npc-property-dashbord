import { useState } from 'react';
import { Filter, X, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { getFullStateName } from '@/lib/states';

interface FilterState {
  propertyType: string;
  suburb: string;
  state: string;
  zipCode: string;
  sourceHost: string;
  hasInspection: boolean;
  lowConfidence: boolean;
  priceMin: string;
  priceMax: string;
  bedsMin: string;
  bedsMax: string;
  bathsMin: string;
  bathsMax: string;
  carsMin: string;
  carsMax: string;
  agencyName: string;
  keywordSearch: string;
  includeNearbySuburbs: boolean;
}

interface ListingFiltersProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  uniqueValues: {
    propertyTypes: string[];
    suburbs: string[];
    states: string[];
    zipCodes: string[];
    sourceHosts: string[];
    agencies: string[];
  };
}

export function ListingFilters({ filters, setFilters, uniqueValues }: ListingFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (['propertyType', 'suburb', 'state', 'zipCode', 'sourceHost', 'agencyName'].includes(key)) {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  }).length;

  const handleOpen = (open: boolean) => {
    if (open) {
      setLocalFilters(filters);
    }
    setIsOpen(open);
  };

  const handleApply = () => {
    setFilters(localFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({
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

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle>Filter Listings</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClear} className="mr-8">
              <X className="h-4 w-4 mr-1" />
              Clear all
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-6 pb-6">
            {/* Keyword Search - full width */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-medium">
                <Search className="h-3.5 w-3.5" />
                Keyword Search
              </Label>
              <Input
                placeholder="e.g. study, pool, granny flat..."
                value={localFilters.keywordSearch}
                onChange={(e) => setLocalFilters({ ...localFilters, keywordSearch: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Searches listing descriptions, summaries &amp; extracted features. Separate multiple keywords with spaces.
              </p>
            </div>

            <Separator />

            {/* Two-column grid for dropdowns */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Property Type */}
              <div className="space-y-2">
                <Label className="font-medium">Property Type</Label>
                <Select
                  value={localFilters.propertyType}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, propertyType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {uniqueValues.propertyTypes.filter(t => t?.trim()).map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* State */}
              <div className="space-y-2">
                <Label className="font-medium">State</Label>
                <Select
                  value={localFilters.state}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, state: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {uniqueValues.states.filter(s => s?.trim()).map((state) => (
                      <SelectItem key={state} value={state}>{getFullStateName(state)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Suburb */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Suburb</Label>
                  {localFilters.suburb && localFilters.suburb !== 'all' && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <Label htmlFor="nearby-toggle-modal" className="text-xs text-muted-foreground cursor-pointer">
                        Include nearby
                      </Label>
                      <Switch
                        id="nearby-toggle-modal"
                        checked={localFilters.includeNearbySuburbs}
                        onCheckedChange={(checked) => setLocalFilters({ ...localFilters, includeNearbySuburbs: checked })}
                        className="scale-75"
                      />
                    </div>
                  )}
                </div>
                <Select
                  value={localFilters.suburb}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, suburb: value, includeNearbySuburbs: false })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All suburbs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suburbs</SelectItem>
                    {uniqueValues.suburbs.filter(s => s?.trim()).map((suburb) => (
                      <SelectItem key={suburb} value={suburb}>{suburb}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {localFilters.includeNearbySuburbs && localFilters.suburb && localFilters.suburb !== 'all' && (
                  <p className="text-xs text-muted-foreground">
                    Will also show listings from surrounding suburbs (±15 postcodes)
                  </p>
                )}
              </div>

              {/* Postcode */}
              <div className="space-y-2">
                <Label className="font-medium">Postcode</Label>
                <Select
                  value={localFilters.zipCode}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, zipCode: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All postcodes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All postcodes</SelectItem>
                    {uniqueValues.zipCodes.filter(z => z?.trim()).map((zip) => (
                      <SelectItem key={zip} value={zip}>{zip}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Price & Features */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Price &amp; Features</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {/* Price Range */}
                <div className="space-y-2">
                  <Label>Price Range</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      type="number"
                      value={localFilters.priceMin}
                      onChange={(e) => setLocalFilters({ ...localFilters, priceMin: e.target.value })}
                    />
                    <Input
                      placeholder="Max"
                      type="number"
                      value={localFilters.priceMax}
                      onChange={(e) => setLocalFilters({ ...localFilters, priceMax: e.target.value })}
                    />
                  </div>
                </div>

                {/* Bedrooms */}
                <div className="space-y-2">
                  <Label>Bedrooms</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      type="number"
                      value={localFilters.bedsMin}
                      onChange={(e) => setLocalFilters({ ...localFilters, bedsMin: e.target.value })}
                    />
                    <Input
                      placeholder="Max"
                      type="number"
                      value={localFilters.bedsMax}
                      onChange={(e) => setLocalFilters({ ...localFilters, bedsMax: e.target.value })}
                    />
                  </div>
                </div>

                {/* Bathrooms */}
                <div className="space-y-2">
                  <Label>Bathrooms</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      type="number"
                      value={localFilters.bathsMin}
                      onChange={(e) => setLocalFilters({ ...localFilters, bathsMin: e.target.value })}
                    />
                    <Input
                      placeholder="Max"
                      type="number"
                      value={localFilters.bathsMax}
                      onChange={(e) => setLocalFilters({ ...localFilters, bathsMax: e.target.value })}
                    />
                  </div>
                </div>

                {/* Car Spaces */}
                <div className="space-y-2">
                  <Label>Car Spaces</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      type="number"
                      value={localFilters.carsMin}
                      onChange={(e) => setLocalFilters({ ...localFilters, carsMin: e.target.value })}
                    />
                    <Input
                      placeholder="Max"
                      type="number"
                      value={localFilters.carsMax}
                      onChange={(e) => setLocalFilters({ ...localFilters, carsMax: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Agency & Source */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-2">
                <Label className="font-medium">Agency</Label>
                <Select
                  value={localFilters.agencyName}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, agencyName: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All agencies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agencies</SelectItem>
                    {uniqueValues.agencies.filter(a => a?.trim()).map((agency) => (
                      <SelectItem key={agency} value={agency}>{agency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-medium">Source</Label>
                <Select
                  value={localFilters.sourceHost}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, sourceHost: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {uniqueValues.sourceHosts.filter(s => s?.trim()).map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Quick Filters */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Filters</h4>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 flex-1 cursor-pointer">
                  <Checkbox
                    checked={localFilters.hasInspection}
                    onCheckedChange={(checked) => setLocalFilters({ ...localFilters, hasInspection: !!checked })}
                  />
                  <span className="text-sm font-medium">Has inspection scheduled</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 flex-1 cursor-pointer">
                  <Checkbox
                    checked={localFilters.lowConfidence}
                    onCheckedChange={(checked) => setLocalFilters({ ...localFilters, lowConfidence: !!checked })}
                  />
                  <span className="text-sm font-medium">Low confidence only</span>
                </label>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleApply}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
