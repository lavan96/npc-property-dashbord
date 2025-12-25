import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getFullStateName } from '@/lib/states';
import { useState } from 'react';

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
}

interface MobileFilterSheetProps {
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

export function MobileFilterSheet({ filters, setFilters, uniqueValues }: MobileFilterSheetProps) {
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
    const clearedFilters: FilterState = {
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
    };
    setLocalFilters(clearedFilters);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle>Filters</SheetTitle>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Clear all
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(85vh-140px)] pr-4">
          <div className="space-y-6">
            {/* Property Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Property Type</Label>
              <Select
                value={localFilters.propertyType}
                onValueChange={(value) => setLocalFilters({ ...localFilters, propertyType: value })}
              >
                <SelectTrigger className="h-11">
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

            {/* Location Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Location</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">State</Label>
                  <Select
                    value={localFilters.state}
                    onValueChange={(value) => setLocalFilters({ ...localFilters, state: value })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All states</SelectItem>
                      {uniqueValues.states.filter(s => s?.trim()).map((state) => (
                        <SelectItem key={state} value={state}>{getFullStateName(state)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm">Postcode</Label>
                  <Select
                    value={localFilters.zipCode}
                    onValueChange={(value) => setLocalFilters({ ...localFilters, zipCode: value })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="All" />
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

              <div className="space-y-2">
                <Label className="text-sm">Suburb</Label>
                <Select
                  value={localFilters.suburb}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, suburb: value })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="All suburbs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All suburbs</SelectItem>
                    {uniqueValues.suburbs.filter(s => s?.trim()).map((suburb) => (
                      <SelectItem key={suburb} value={suburb}>{suburb}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Price Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Price Range</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="Min price"
                  type="number"
                  inputMode="numeric"
                  value={localFilters.priceMin}
                  onChange={(e) => setLocalFilters({ ...localFilters, priceMin: e.target.value })}
                  className="h-11"
                />
                <Input
                  placeholder="Max price"
                  type="number"
                  inputMode="numeric"
                  value={localFilters.priceMax}
                  onChange={(e) => setLocalFilters({ ...localFilters, priceMax: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>

            {/* Property Features */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Features</h4>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Beds (min)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={localFilters.bedsMin}
                    onChange={(e) => setLocalFilters({ ...localFilters, bedsMin: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Baths (min)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={localFilters.bathsMin}
                    onChange={(e) => setLocalFilters({ ...localFilters, bathsMin: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cars (min)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={localFilters.carsMin}
                    onChange={(e) => setLocalFilters({ ...localFilters, carsMin: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Agency & Source */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Agency</Label>
                <Select
                  value={localFilters.agencyName}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, agencyName: value })}
                >
                  <SelectTrigger className="h-11">
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
                <Label className="text-sm">Source</Label>
                <Select
                  value={localFilters.sourceHost}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, sourceHost: value })}
                >
                  <SelectTrigger className="h-11">
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
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Filters</h4>
              
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <Checkbox
                    checked={localFilters.hasInspection}
                    onCheckedChange={(checked) => 
                      setLocalFilters({ ...localFilters, hasInspection: !!checked })
                    }
                  />
                  <span className="text-sm font-medium">Has inspection scheduled</span>
                </label>
                
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <Checkbox
                    checked={localFilters.lowConfidence}
                    onCheckedChange={(checked) => 
                      setLocalFilters({ ...localFilters, lowConfidence: !!checked })
                    }
                  />
                  <span className="text-sm font-medium">Low confidence only</span>
                </label>
              </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="pt-4 border-t border-border">
          <Button onClick={handleApply} className="w-full h-12 text-base">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
