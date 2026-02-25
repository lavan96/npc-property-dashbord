import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Landmark, Calculator } from 'lucide-react';
import { Deal } from './types';

interface DealFinancialControlsProps {
  deal: Deal;
  onUpdate: (data: Partial<Deal>) => void;
}

export function DealFinancialControls({ deal, onUpdate }: DealFinancialControlsProps) {
  const isHnL = deal.deal_type === 'house_and_land';

  const handleNumericBlur = (field: keyof Deal, value: string) => {
    const num = value ? parseFloat(value) : null;
    if (num !== (deal[field] as number | null)) {
      onUpdate({ [field]: num } as Partial<Deal>);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Contract & Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Total Contract Price</Label>
            <Input
              key={deal.id + '-tcp'}
              type="number"
              defaultValue={deal.total_contract_price ?? ''}
              onBlur={(e) => handleNumericBlur('total_contract_price', e.target.value)}
              placeholder="$0"
              className="h-8 text-sm"
            />
          </div>
          {isHnL && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Land Price</Label>
                <Input
                  key={deal.id + '-lp'}
                  type="number"
                  defaultValue={deal.land_price ?? ''}
                  onBlur={(e) => handleNumericBlur('land_price', e.target.value)}
                  placeholder="$0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Build Price</Label>
                <Input
                  key={deal.id + '-bp'}
                  type="number"
                  defaultValue={deal.build_price ?? ''}
                  onBlur={(e) => handleNumericBlur('build_price', e.target.value)}
                  placeholder="$0"
                  className="h-8 text-sm"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Loan Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Loan Amount</Label>
            <Input
              key={deal.id + '-la'}
              type="number"
              defaultValue={deal.loan_amount ?? ''}
              onBlur={(e) => handleNumericBlur('loan_amount', e.target.value)}
              placeholder="$0"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Shortfall Required</Label>
            <Input
              key={deal.id + '-sr'}
              type="number"
              defaultValue={deal.shortfall_required ?? ''}
              onBlur={(e) => handleNumericBlur('shortfall_required', e.target.value)}
              placeholder="$0"
              className="h-8 text-sm"
            />
          </div>
          {isHnL && (
            <div className="space-y-1">
              <Label className="text-xs">Construction Loan Type</Label>
              <Select
                value={deal.construction_loan_type || ''}
                onValueChange={(v) => onUpdate({ construction_loan_type: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress Draw</SelectItem>
                  <SelectItem value="turnkey">Turnkey</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Status Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={deal.valuation_completed}
                onCheckedChange={(v) => onUpdate({ valuation_completed: v })}
              />
              <span className="text-xs">Valuation Completed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={deal.client_contribution_confirmed}
                onCheckedChange={(v) => onUpdate({ client_contribution_confirmed: v })}
              />
              <span className="text-xs">Client Contribution Confirmed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={deal.lmi_applied}
                onCheckedChange={(v) => onUpdate({ lmi_applied: v })}
              />
              <span className="text-xs">LMI Applied</span>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
