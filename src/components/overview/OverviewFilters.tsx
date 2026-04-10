import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { getFullStateName } from '@/lib/states';

interface OverviewFilterState {
  state: string;
  postcode: string;
  suburb: string;
  propertyType: string;
}

interface OverviewFiltersProps {
  filters: OverviewFilterState;
  setFilters: (filters: OverviewFilterState) => void;
  uniqueValues: {
    states: string[];
    postcodes: string[];
    suburbs: string[];
    propertyTypes: string[];
  };
}

export function OverviewFilters({ filters, setFilters, uniqueValues }: OverviewFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = Object.entries(filters).some(([, value]) => {
    return value !== '' && value !== 'all';
  });

  const clearAllFilters = () => {
    setFilters({
      state: 'all',
      postcode: 'all',
      suburb: 'all',
      propertyType: 'all',
    });
  };

  const activeFilterCount = Object.entries(filters).filter(([, value]) => {
    return value !== '' && value !== 'all';
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
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Filter Overview Data</h4>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
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
                {(uniqueValues.states.length > 0 ? uniqueValues.states : ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']).filter(state => state && state.trim() !== '').map((state) => (
                  <SelectItem key={state} value={state}>
                    {state} — {getFullStateName(state)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Postcode — searchable */}
          <div className="space-y-2">
            <Label>Postcode</Label>
            <SearchableSelect
              value={filters.postcode}
              onValueChange={(value) => setFilters({ ...filters, postcode: value })}
              options={uniqueValues.postcodes.filter(pc => pc && pc.trim() !== '')}
              placeholder="All postcodes"
              allLabel="All postcodes"
            />
          </div>

          {/* Suburb — searchable type-to-filter */}
          <div className="space-y-2">
            <Label>Suburb</Label>
            <SearchableSelect
              value={filters.suburb}
              onValueChange={(value) => setFilters({ ...filters, suburb: value })}
              options={uniqueValues.suburbs.filter(suburb => suburb && suburb.trim() !== '')}
              placeholder="All suburbs"
              allLabel="All suburbs"
            />
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
