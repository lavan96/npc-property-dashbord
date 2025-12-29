import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, Info, Car, Ruler } from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';
import { useCallback } from 'react';
import { BuildTypeSelector } from '../shared/BuildTypeSelector';

interface PropertyTabProps {
  buildType: 'new_build' | 'existing_property';
  onBuildTypeChange: (value: 'new_build' | 'existing_property') => void;
  purchasePrice: string;
  setPurchasePrice: (value: string) => void;
  propertyValue: string;
  setPropertyValue: (value: string) => void;
  landPrice: string;
  setLandPrice: (value: string) => void;
  buildPrice: string;
  setBuildPrice: (value: string) => void;
  // New fields for feature parity
  propertyType?: string;
  setPropertyType?: (value: string) => void;
  carSpaces?: string;
  setCarSpaces?: (value: string) => void;
  landSizeSqm?: string;
  setLandSizeSqm?: (value: string) => void;
  buildSizeSqm?: string;
  setBuildSizeSqm?: (value: string) => void;
  disabled?: boolean;
}

export function PropertyTab({
  buildType,
  onBuildTypeChange,
  purchasePrice,
  setPurchasePrice,
  propertyValue,
  setPropertyValue,
  landPrice,
  setLandPrice,
  buildPrice,
  setBuildPrice,
  propertyType,
  setPropertyType,
  carSpaces,
  setCarSpaces,
  landSizeSqm,
  setLandSizeSqm,
  buildSizeSqm,
  setBuildSizeSqm,
  disabled = false
}: PropertyTabProps) {
  const isNewBuild = buildType === 'new_build';

  const handleCurrencyChange = useCallback((setter: (value: string) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = removeCommas(e.target.value);
      if (rawValue === '' || rawValue === '-' || /^-?\d*\.?\d*$/.test(rawValue)) {
        setter(rawValue);
      }
    };
  }, []);

  const handleNumberChange = useCallback((setter: (value: string) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '' || /^\d*$/.test(value)) {
        setter(value);
      }
    };
  }, []);

  const formatForDisplay = useCallback((value: string) => {
    return formatNumberWithCommas(value);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Build Type Selection - Using Shared Component */}
      <BuildTypeSelector
        value={buildType}
        onChange={onBuildTypeChange}
        disabled={disabled}
      />

      {/* Pricing Section */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5 text-primary" />
            Pricing
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="purchasePrice" className="text-sm font-medium">Purchase Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="purchasePrice"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(purchasePrice)}
                  onChange={handleCurrencyChange(setPurchasePrice)}
                  placeholder="750,000"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyValue" className="text-sm font-medium flex items-center gap-1">
                Property Value
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Current market value (may differ from purchase price)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="propertyValue"
                  type="text"
                  inputMode="numeric"
                  value={formatForDisplay(propertyValue)}
                  onChange={handleCurrencyChange(setPropertyValue)}
                  placeholder="800,000"
                  disabled={disabled}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          {/* Land Price and Build Price - Only shown for New Builds */}
          {isNewBuild && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="landPrice" className="text-sm font-medium">Land Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="landPrice"
                    type="text"
                    inputMode="numeric"
                    value={formatForDisplay(landPrice)}
                    onChange={handleCurrencyChange(setLandPrice)}
                    placeholder="350,000"
                    disabled={disabled}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buildPrice" className="text-sm font-medium">Build Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="buildPrice"
                    type="text"
                    inputMode="numeric"
                    value={formatForDisplay(buildPrice)}
                    onChange={handleCurrencyChange(setBuildPrice)}
                    placeholder="400,000"
                    disabled={disabled}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Property Specifications - New Section */}
      {(setPropertyType || setCarSpaces || setLandSizeSqm || setBuildSizeSqm) && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Ruler className="h-5 w-5 text-primary" />
              Property Specifications
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Property Type */}
              {setPropertyType && (
                <div className="space-y-2">
                  <Label htmlFor="propertyType" className="text-sm font-medium">Property Type</Label>
                  <Select 
                    value={propertyType || 'house'} 
                    onValueChange={setPropertyType}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="apartment">Apartment/Unit</SelectItem>
                      <SelectItem value="townhouse">Townhouse</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="land">Vacant Land</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Car Spaces */}
              {setCarSpaces && (
                <div className="space-y-2">
                  <Label htmlFor="carSpaces" className="text-sm font-medium flex items-center gap-1">
                    <Car className="h-3 w-3" />
                    Car Spaces
                  </Label>
                  <Input
                    id="carSpaces"
                    type="text"
                    inputMode="numeric"
                    value={carSpaces || ''}
                    onChange={handleNumberChange(setCarSpaces)}
                    placeholder="2"
                    disabled={disabled}
                  />
                </div>
              )}

              {/* Land Size */}
              {setLandSizeSqm && (
                <div className="space-y-2">
                  <Label htmlFor="landSizeSqm" className="text-sm font-medium">Land Size</Label>
                  <div className="relative">
                    <Input
                      id="landSizeSqm"
                      type="text"
                      inputMode="numeric"
                      value={landSizeSqm || ''}
                      onChange={handleNumberChange(setLandSizeSqm)}
                      placeholder="450"
                      disabled={disabled}
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">m²</span>
                  </div>
                </div>
              )}

              {/* Build Size */}
              {setBuildSizeSqm && (
                <div className="space-y-2">
                  <Label htmlFor="buildSizeSqm" className="text-sm font-medium">Build Size</Label>
                  <div className="relative">
                    <Input
                      id="buildSizeSqm"
                      type="text"
                      inputMode="numeric"
                      value={buildSizeSqm || ''}
                      onChange={handleNumberChange(setBuildSizeSqm)}
                      placeholder="180"
                      disabled={disabled}
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">m²</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
