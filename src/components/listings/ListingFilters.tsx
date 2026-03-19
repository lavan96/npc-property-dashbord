import { useState } from 'react';
import { Filter, X, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (key === 'propertyType' || key === 'suburb' || key === 'state' || key === 'zipCode' || key === 'sourceHost' || key === 'agencyName') {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  });

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

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (key === 'propertyType' || key === 'suburb' || key === 'state' || key === 'zipCode' || key === 'sourceHost' || key === 'agencyName') {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  }).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filters</h4>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* Keyword Search */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Keyword Search
            </Label>
            <Input
              placeholder="e.g. study, pool, granny flat..."
              value={filters.keywordSearch}
              onChange={(e) => setFilters({ ...filters, keywordSearch: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Searches listing descriptions, summaries &amp; extracted features
            </p>
          </div>

          {/* Property Type */}
          <div className="space-y-2">
            <Label>Property Type</Label>
            <Select
              value={filters.propertyType}
              onValueChange={(value) => setFilters({ ...filters, propertyType: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {uniqueValues.propertyTypes.filter(type => type && type.trim() !== '').map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Suburb with Nearby toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Suburb</Label>
              {filters.suburb && filters.suburb !== 'all' && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <Label htmlFor="nearby-toggle" className="text-xs text-muted-foreground cursor-pointer">
                    Include nearby
                  </Label>
                  <Switch
                    id="nearby-toggle"
                    checked={filters.includeNearbySuburbs}
                    onCheckedChange={(checked) => setFilters({ ...filters, includeNearbySuburbs: checked })}
                    className="scale-75"
                  />
                </div>
              )}
            </div>
            <Select
              value={filters.suburb}
              onValueChange={(value) => setFilters({ ...filters, suburb: value, includeNearbySuburbs: false })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All suburbs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suburbs</SelectItem>
                {uniqueValues.suburbs.filter(suburb => suburb && suburb.trim() !== '').map((suburb) => (
                  <SelectItem key={suburb} value={suburb}>
                    {suburb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filters.includeNearbySuburbs && filters.suburb && filters.suburb !== 'all' && (
              <p className="text-xs text-muted-foreground">
                Showing listings from {filters.suburb} and surrounding suburbs (±15 postcodes)
              </p>
            )}
          </div>

          {/* State */}
          <div className="space-y-2">
            <Label>State</Label>
            <Select
              value={filters.state}
              onValueChange={(value) => setFilters({ ...filters, state: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {uniqueValues.states.filter(state => state && state.trim() !== '').map((state) => (
                  <SelectItem key={state} value={state}>
                    {getFullStateName(state)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zip Code */}
          <div className="space-y-2">
            <Label>Zip Code</Label>
            <Select
              value={filters.zipCode}
              onValueChange={(value) => setFilters({ ...filters, zipCode: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All zip codes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zip codes</SelectItem>
                {uniqueValues.zipCodes.filter(zip => zip && zip.trim() !== '').map((zip) => (
                  <SelectItem key={zip} value={zip}>
                    {zip}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label>Price Range</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min price"
                type="number"
                value={filters.priceMin}
                onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
              />
              <Input
                placeholder="Max price"
                type="number"
                value={filters.priceMax}
                onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
              />
            </div>
          </div>

          {/* Bedrooms */}
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min beds"
                type="number"
                value={filters.bedsMin}
                onChange={(e) => setFilters({ ...filters, bedsMin: e.target.value })}
              />
              <Input
                placeholder="Max beds"
                type="number"
                value={filters.bedsMax}
                onChange={(e) => setFilters({ ...filters, bedsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Bathrooms */}
          <div className="space-y-2">
            <Label>Bathrooms</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min baths"
                type="number"
                value={filters.bathsMin}
                onChange={(e) => setFilters({ ...filters, bathsMin: e.target.value })}
              />
              <Input
                placeholder="Max baths"
                type="number"
                value={filters.bathsMax}
                onChange={(e) => setFilters({ ...filters, bathsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Car Spaces */}
          <div className="space-y-2">
            <Label>Car Spaces</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min cars"
                type="number"
                value={filters.carsMin}
                onChange={(e) => setFilters({ ...filters, carsMin: e.target.value })}
              />
              <Input
                placeholder="Max cars"
                type="number"
                value={filters.carsMax}
                onChange={(e) => setFilters({ ...filters, carsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Agency */}
          <div className="space-y-2">
            <Label>Agency</Label>
            <Select
              value={filters.agencyName}
              onValueChange={(value) => setFilters({ ...filters, agencyName: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All agencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agencies</SelectItem>
                {uniqueValues.agencies.filter(agency => agency && agency.trim() !== '').map((agency) => (
                  <SelectItem key={agency} value={agency}>
                    {agency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={filters.sourceHost}
              onValueChange={(value) => setFilters({ ...filters, sourceHost: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {uniqueValues.sourceHosts.filter(source => source && source.trim() !== '').map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Boolean filters */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasInspection"
                checked={filters.hasInspection}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, hasInspection: !!checked })
                }
              />
              <Label htmlFor="hasInspection">Has inspection scheduled</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="lowConfidence"
                checked={filters.lowConfidence}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, lowConfidence: !!checked })
                }
              />
              <Label htmlFor="lowConfidence">Low confidence only</Label>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ListingFilters({ filters, setFilters, uniqueValues }: ListingFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (key === 'propertyType' || key === 'suburb' || key === 'state' || key === 'zipCode' || key === 'sourceHost' || key === 'agencyName') {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  });

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
    });
  };

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (typeof value === 'boolean') return value;
    if (key === 'propertyType' || key === 'suburb' || key === 'state' || key === 'zipCode' || key === 'sourceHost' || key === 'agencyName') {
      return value !== '' && value !== 'all';
    }
    return value !== '';
  }).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filters</h4>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* Property Type */}
          <div className="space-y-2">
            <Label>Property Type</Label>
            <Select
              value={filters.propertyType}
              onValueChange={(value) => setFilters({ ...filters, propertyType: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {uniqueValues.propertyTypes.filter(type => type && type.trim() !== '').map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Suburb */}
          <div className="space-y-2">
            <Label>Suburb</Label>
            <Select
              value={filters.suburb}
              onValueChange={(value) => setFilters({ ...filters, suburb: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All suburbs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suburbs</SelectItem>
                {uniqueValues.suburbs.filter(suburb => suburb && suburb.trim() !== '').map((suburb) => (
                  <SelectItem key={suburb} value={suburb}>
                    {suburb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* State */}
          <div className="space-y-2">
            <Label>State</Label>
            <Select
              value={filters.state}
              onValueChange={(value) => setFilters({ ...filters, state: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {uniqueValues.states.filter(state => state && state.trim() !== '').map((state) => (
                  <SelectItem key={state} value={state}>
                    {getFullStateName(state)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zip Code */}
          <div className="space-y-2">
            <Label>Zip Code</Label>
            <Select
              value={filters.zipCode}
              onValueChange={(value) => setFilters({ ...filters, zipCode: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All zip codes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zip codes</SelectItem>
                {uniqueValues.zipCodes.filter(zip => zip && zip.trim() !== '').map((zip) => (
                  <SelectItem key={zip} value={zip}>
                    {zip}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label>Price Range</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min price"
                type="number"
                value={filters.priceMin}
                onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
              />
              <Input
                placeholder="Max price"
                type="number"
                value={filters.priceMax}
                onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
              />
            </div>
          </div>

          {/* Bedrooms */}
          <div className="space-y-2">
            <Label>Bedrooms</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min beds"
                type="number"
                value={filters.bedsMin}
                onChange={(e) => setFilters({ ...filters, bedsMin: e.target.value })}
              />
              <Input
                placeholder="Max beds"
                type="number"
                value={filters.bedsMax}
                onChange={(e) => setFilters({ ...filters, bedsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Bathrooms */}
          <div className="space-y-2">
            <Label>Bathrooms</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min baths"
                type="number"
                value={filters.bathsMin}
                onChange={(e) => setFilters({ ...filters, bathsMin: e.target.value })}
              />
              <Input
                placeholder="Max baths"
                type="number"
                value={filters.bathsMax}
                onChange={(e) => setFilters({ ...filters, bathsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Car Spaces */}
          <div className="space-y-2">
            <Label>Car Spaces</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Min cars"
                type="number"
                value={filters.carsMin}
                onChange={(e) => setFilters({ ...filters, carsMin: e.target.value })}
              />
              <Input
                placeholder="Max cars"
                type="number"
                value={filters.carsMax}
                onChange={(e) => setFilters({ ...filters, carsMax: e.target.value })}
              />
            </div>
          </div>

          {/* Agency */}
          <div className="space-y-2">
            <Label>Agency</Label>
            <Select
              value={filters.agencyName}
              onValueChange={(value) => setFilters({ ...filters, agencyName: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All agencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agencies</SelectItem>
                {uniqueValues.agencies.filter(agency => agency && agency.trim() !== '').map((agency) => (
                  <SelectItem key={agency} value={agency}>
                    {agency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={filters.sourceHost}
              onValueChange={(value) => setFilters({ ...filters, sourceHost: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {uniqueValues.sourceHosts.filter(source => source && source.trim() !== '').map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Boolean filters */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hasInspection"
                checked={filters.hasInspection}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, hasInspection: !!checked })
                }
              />
              <Label htmlFor="hasInspection">Has inspection scheduled</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="lowConfidence"
                checked={filters.lowConfidence}
                onCheckedChange={(checked) => 
                  setFilters({ ...filters, lowConfidence: !!checked })
                }
              />
              <Label htmlFor="lowConfidence">Low confidence only</Label>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}