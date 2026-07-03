import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DashboardThemeFrameVariant =
  | 'page'
  | 'hero'
  | 'section'
  | 'sectionAccent'
  | 'card'
  | 'premiumCard'
  | 'chartCard'
  | 'toolbar';

type DashboardThemeFrameElement = 'div' | 'section' | 'main' | 'article' | 'header';

interface DashboardThemeFrameProps extends HTMLAttributes<HTMLElement> {
  as?: DashboardThemeFrameElement;
  variant?: DashboardThemeFrameVariant;
  children: ReactNode;
}

const variantClasses: Record<DashboardThemeFrameVariant, string> = {
  page: 'dashboard-theme-frame mx-auto w-full max-w-[1600px] min-w-0 overflow-x-hidden',
  hero:
    'dashboard-theme-hero relative overflow-hidden rounded-card-lg border border-border/70 bg-gradient-to-br from-card via-card to-muted/35 p-4 shadow-sm shadow-black/5 backdrop-blur dark:border-white/10 dark:from-background dark:via-background/90 dark:to-background/70 sm:rounded-card-2xl sm:p-5 md:p-7',
  section:
    'dashboard-theme-section relative min-w-0 overflow-hidden rounded-card-lg border border-border/60 bg-card/65 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-card/55 sm:rounded-[1.85rem] sm:p-5 md:p-6 dark:border-white/10 dark:bg-background/35 dark:shadow-black/25',
  sectionAccent:
    'dashboard-theme-section dashboard-theme-section-accent relative min-w-0 overflow-hidden rounded-card-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-card/75 to-card p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur sm:rounded-[1.85rem] sm:p-5 md:p-6 dark:border-primary/25 dark:from-primary/10 dark:via-background/45 dark:to-background/75',
  card:
    'dashboard-theme-card rounded-2xl border border-border/70 bg-card/90 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 dark:border-white/10 dark:bg-background/80 dark:shadow-black/30',
  premiumCard:
    'dashboard-theme-premium-card group min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/45 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12),0_0_0_1px_hsl(var(--primary)/0.12)] dark:border-white/10 dark:bg-background/80 dark:ring-white/10 dark:shadow-black/30',
  chartCard:
    'dashboard-theme-chart-card group min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--muted)/0.22)_100%)] shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-white/45 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_44px_rgba(15,23,42,0.12),0_0_0_1px_hsl(var(--primary)/0.12)] dark:border-white/10 dark:bg-background/80 dark:ring-white/10',
  toolbar:
    'dashboard-theme-toolbar flex w-full flex-wrap items-stretch gap-2 rounded-2xl border border-border/50 bg-background/55 p-2 shadow-sm shadow-black/5 backdrop-blur sm:items-center dark:border-white/10 dark:bg-background/40',
};

export const DashboardThemeFrame = forwardRef<HTMLElement, DashboardThemeFrameProps>(
  ({ as: Component = 'div', variant = 'section', className, children, ...props }, ref) => (
    <Component ref={ref as any} className={cn(variantClasses[variant], className)} {...props}>
      {children}
    </Component>
  )
);

DashboardThemeFrame.displayName = 'DashboardThemeFrame';
