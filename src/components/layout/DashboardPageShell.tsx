import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const DashboardPageShell = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('dashboard-page-shell', className)} {...props} />
  )
);

DashboardPageShell.displayName = 'DashboardPageShell';