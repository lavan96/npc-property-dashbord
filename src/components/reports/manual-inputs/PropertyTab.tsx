import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, Home, Info, Ruler, Building } from 'lucide-react';
import { formatNumberWithCommas, removeCommas } from '@/hooks/useFormattedNumber';
import { useCallback } from 'react';

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
  landSizeSqm: string;
  setLandSizeSqm: (value: string) => void;
  buildSizeSqm: string;
  setBuildSizeSqm: (value: string) => void;
  propertyType: string;
  setPropertyType: (value: string) => void;
  isFirstHomeBuyer: boolean;
  setIsFirstHomeBuyer: (value: boolean) => void;
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
  landSizeSqm,
  setLandSizeSqm,
  buildSizeSqm,
  setBuildSizeSqm,
  propertyType,
  setPropertyType,
  isFirstHomeBuyer,
  setIsFirstHomeBuyer,
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

  const formatForDisplay = useCallback((value: string) => {
    return formatNumberWithCommas(value);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Build Type Selection */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <RadioGroup
            value={buildType}
            onValueChange={(value) => onBuildTypeChange(value as 'new_build' | 'existing_property')}
            className="grid grid-cols-2 gap-4"
            disabled={disabled}
          >
            <Label
              htmlFor="existing_property"
              className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${
                !isNewBuild 
                  ? 'border-primary bg-primary/5 shadow-md' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value="existing_property" id="existing_property" className="sr-only" />
              <Home className={`h-10 w-10 mb-3 ${!isNewBuild ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-semibold text-lg ${!isNewBuild ? 'text-primary' : 'text-foreground'}`}>
                Existing Property
              </span>
              <span className="text-sm text-muted-foreground mt-1">Established home or apartment</span>
            </Label>
            <Label
              htmlFor="new_build"
              className={`flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer transition-all ${
                isNewBuild 
                  ? 'border-primary bg-primary/5 shadow-md' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value="new_build" id="new_build" className="sr-only" />
              <Building2 className={`h-10 w-10 mb-3 ${isNewBuild ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-semibold text-lg ${isNewBuild ? 'text-primary' : 'text-foreground'}`}>
                New Build
              </span>
              <span className="text-sm text-muted-foreground mt-1">House & land package</span>
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Pricing Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Pricing
            </h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="firstHomeBuyer" className="text-sm text-muted-foreground cursor-pointer">
                First Home Buyer
              </Label>
              <Switch
                id="firstHomeBuyer"
                checked={isFirstHomeBuyer}
                onCheckedChange={setIsFirstHomeBuyer}
                disabled={disabled}
              />
            </div>
          </div>

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

      {/* Property Specs */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Ruler className="h-5 w-5 text-primary" />
            Property Specs
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="landSizeSqm" className="text-sm font-medium">Land Size</Label>
              <div className="relative">
                <Input
                  id="landSizeSqm"
                  type="number"
                  value={landSizeSqm}
                  onChange={(e) => setLandSizeSqm(e.target.value)}
                  placeholder="450"
                  disabled={disabled}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">m²</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildSizeSqm" className="text-sm font-medium">Build Size</Label>
              <div className="relative">
                <Input
                  id="buildSizeSqm"
                  type="number"
                  value={buildSizeSqm}
                  onChange={(e) => setBuildSizeSqm(e.target.value)}
                  placeholder="180"
                  disabled={disabled}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">m²</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType" className="text-sm font-medium flex items-center gap-1">
                <Building className="h-4 w-4" />
                Type
              </Label>
              <Select value={propertyType} onValueChange={setPropertyType} disabled={disabled}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="townhouse">Townhouse</SelectItem>
                  <SelectItem value="unit">Unit</SelectItem>
                  <SelectItem value="villa">Villa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
