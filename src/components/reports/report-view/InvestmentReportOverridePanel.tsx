import { ChevronDown, PenLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { OverriddenField } from './types';

interface Props {
  overriddenFields: OverriddenField[];
  showOverrides: boolean;
  onShowOverridesChange: (open: boolean) => void;
}

export function InvestmentReportOverridePanel({ overriddenFields, showOverrides, onShowOverridesChange }: Props) {
  return (
    <Collapsible open={showOverrides} onOpenChange={onShowOverridesChange}>
      <Card className="border-amber-200 bg-amber-50/70 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><PenLine className="h-4 w-4" /></div>
                <div>
                  <CardTitle className="text-base text-amber-950 dark:text-amber-100">Data Adjustments</CardTitle>
                  <p className="text-sm text-amber-800/80 dark:text-amber-200/80">{overriddenFields.length} field{overriddenFields.length !== 1 ? 's' : ''} manually edited and included in this workspace.</p>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-amber-700 transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0"><div className="flex flex-wrap gap-2">{overriddenFields.map((field) => (<Badge key={field.key} variant="secondary" className="border border-amber-300 bg-amber-100 text-xs font-normal text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"><PenLine className="h-3 w-3 mr-1" />{field.displayName}</Badge>))}</div></CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
