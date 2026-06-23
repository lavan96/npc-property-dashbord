import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/shared/SearchableSelect';


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
        <Button variant="outline" size="sm" className="relative min-h-10 rounded-full border-border/70 bg-card/85 px-4 font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_rgba(245,158,11,0.16)] focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 active:translate-y-0">
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary p-0 text-xs text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.35)]">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 rounded-2xl border-border/70 bg-card/95 p-4 shadow-xl shadow-black/10 backdrop-blur" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold tracking-tight">Filter Overview Data</h4>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="min-h-9 rounded-full px-3 text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 active:translate-y-0">
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* State — searchable */}
          <div className="space-y-2">
            <Label>State</Label>
            <SearchableSelect
              value={filters.state}
              onValueChange={(value) => setFilters({ ...filters, state: value })}
              options={(uniqueValues.states.length > 0 ? uniqueValues.states : ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']).filter(state => state && state.trim() !== '').map(s => s)}
              placeholder="All states"
              allLabel="All states"
            />
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

          {/* Property Type — searchable */}
          <div className="space-y-2">
            <Label>Property Type</Label>
            <SearchableSelect
              value={filters.propertyType}
              onValueChange={(value) => setFilters({ ...filters, propertyType: value })}
              options={uniqueValues.propertyTypes.filter(type => type && type.trim() !== '')}
              placeholder="All types"
              allLabel="All types"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
