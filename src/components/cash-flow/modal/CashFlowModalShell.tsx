import { ReactNode } from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

interface CashFlowModalShellProps {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function CashFlowModalShell({ header, children, footer }: CashFlowModalShellProps) {
  return (
    <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col gap-0 p-0 overflow-hidden">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4">
        {header}
      </div>
      <Separator />
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {children}
      </div>
      {footer && (
        <>
          <Separator />
          {footer}
        </>
      )}
    </DialogContent>
  );
}
