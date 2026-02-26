import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, RefreshCw, ExternalLink, Loader2, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBankLendingRates, LendingRate } from '@/hooks/useBankLendingRates';

interface BankRateSelectorProps {
  value?: number;
  onChange: (rate: number, lenderName?: string) => void;
  loanPurpose?: 'OWNER_OCCUPIED' | 'INVESTMENT';
  repaymentType?: 'PRINCIPAL_AND_INTEREST' | 'INTEREST_ONLY';
  lvr?: number;
  onOpenComparison?: () => void;
  className?: string;
}

export function BankRateSelector({
  value,
  onChange,
  loanPurpose = 'INVESTMENT',
  repaymentType = 'PRINCIPAL_AND_INTEREST',
  lvr,
  onOpenComparison,
  className,
}: BankRateSelectorProps) {
  const {
    lenders,
    isLoadingLenders,
    selectedLender,
    selectLender,
    selectedLenderRates,
    isLoadingSelectedRates,
    ratesSummary,
    getLowestRateForLender,
  } = useBankLendingRates({ loanPurpose, repaymentType, lvr });

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // When lender changes, auto-select the best rate
  useEffect(() => {
    if (selectedLenderRates && selectedLenderRates.length > 0) {
      // Find the best matching rate
      const bestRate = selectedLenderRates[0]; // Already sorted by rate
      setSelectedProductId(bestRate.productId);
      onChange(Math.round(bestRate.rate * 100) / 100, bestRate.lenderName);
    }
  }, [selectedLenderRates, onChange]);

  // Handle manual product selection
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    const rate = selectedLenderRates?.find(r => r.productId === productId);
    if (rate) {
      onChange(Math.round(rate.rate * 100) / 100, rate.lenderName);
    }
  };

  // Find lowest rate across all lenders
  const lowestOverallRate = ratesSummary?.reduce((min, s) => {
    if (s.lowestRate !== null && (min === null || s.lowestRate < min)) {
      return s.lowestRate;
    }
    return min;
  }, null as number | null);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Lender Selection */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Select Lender
        </label>
        
        {isLoadingLenders ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select
            value={selectedLender || ''}
            onValueChange={(value) => selectLender(value || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a lender for live rates" />
            </SelectTrigger>
            <SelectContent>
              {lenders?.map((lender) => {
                const lowestRate = getLowestRateForLender(lender.id);
                return (
                  <SelectItem key={lender.id} value={lender.id}>
                    <span>{lender.name}</span>
                    {lowestRate !== null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        from {lowestRate.toFixed(2)}%
                      </span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Product Selection (when lender is selected) */}
      {selectedLender && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            Select Product
          </label>
          
          {isLoadingSelectedRates ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching rates from CDR API...
            </div>
          ) : selectedLenderRates && selectedLenderRates.length > 0 ? (
            <Select
              value={selectedProductId || ''}
              onValueChange={handleProductChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {selectedLenderRates.map((rate) => (
                  <SelectItem key={rate.productId} value={rate.productId}>
                    <span className="font-medium">{rate.rate.toFixed(2)}%</span>
                    <span className="ml-2 text-xs text-muted-foreground truncate">
                      {rate.productName}
                    </span>
                    {rate.comparisonRate && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (comp: {rate.comparisonRate.toFixed(2)}%)
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rates available for this lender with current filters
            </p>
          )}
        </div>
      )}

      {/* Current Rate Display */}
      {value !== undefined && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
          <div>
            <p className="text-sm text-muted-foreground">Current Interest Rate</p>
            <p className="text-xl font-bold text-primary">{value.toFixed(2)}%</p>
          </div>
          {lowestOverallRate !== null && value > lowestOverallRate && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Lowest available</p>
              <p className="text-sm font-medium text-success flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                {lowestOverallRate.toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* Compare Rates Button */}
      {onOpenComparison && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenComparison}
          className="w-full"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Compare All Lender Rates
        </Button>
      )}
    </div>
  );
}
