import { ReactNode } from 'react';
import { Calculator } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CashFlowCommandHeaderProps {
  propertyAddress: string;
  isNewBuild: boolean;
  actions: ReactNode;
}

export function CashFlowCommandHeader({ propertyAddress, isNewBuild, actions }: CashFlowCommandHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <DialogTitle className="text-lg md:text-xl flex items-center gap-2 flex-wrap">
            <Calculator className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">10-Year Cash Flow Analysis</span>
            <span className="sm:hidden">Cash Flow Analysis</span>
            <Badge
              variant={isNewBuild ? "default" : "secondary"}
              className="ml-2 text-xs"
            >
              {isNewBuild ? "New Build" : "Existing Property"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="mt-1">
            {propertyAddress}
          </DialogDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      </div>
    </DialogHeader>
  );
}
