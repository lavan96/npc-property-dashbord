import { forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, type CardContentProps, type CardHeaderProps, type CardProps, type CardTitleProps } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const PortalPanel = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <Card ref={ref} className={cn('client-portal-soft-panel', className)} {...props} />
));
PortalPanel.displayName = 'PortalPanel';

export const PortalPanelHeader = forwardRef<HTMLDivElement, CardHeaderProps>(({ className, ...props }, ref) => (
  <CardHeader ref={ref} className={cn('border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent pb-4', className)} {...props} />
));
PortalPanelHeader.displayName = 'PortalPanelHeader';

export const PortalPanelContent = forwardRef<HTMLDivElement, CardContentProps>(({ className, ...props }, ref) => (
  <CardContent ref={ref} className={cn(className)} {...props} />
));
PortalPanelContent.displayName = 'PortalPanelContent';

export const PortalPanelTitle = forwardRef<HTMLParagraphElement, CardTitleProps>(({ className, ...props }, ref) => (
  <CardTitle ref={ref} className={cn('client-portal-section-title', className)} {...props} />
));
PortalPanelTitle.displayName = 'PortalPanelTitle';

export function portalPanelClassName(className?: string) {
  return cn('client-portal-soft-panel', className);
}

export function portalStatCardClassName(className?: string) {
  return cn('client-portal-stat-card', className);
}