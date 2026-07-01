import type { ReactNode } from 'react';
import { DashboardThemeFrame } from './DashboardThemeFrame';
import { cn } from '@/lib/utils';
import { lightModeModuleVisuals, type LightModeModuleVisualKey } from '@/theme/lightModeVisuals';

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  imageVariant?: LightModeModuleVisualKey;
  actions?: ReactNode;
  className?: string;
}

export function PageHero({ eyebrow, title, subtitle, imageVariant = 'overview', actions, className }: PageHeroProps) {
  const visual = lightModeModuleVisuals[imageVariant] ?? lightModeModuleVisuals.overview;
  const overlayClass = visual.overlay === 'ivory' ? 'from-[#fffaf1]/95 via-[#fbf2e2]/82' : 'from-[#fff6e4]/95 via-[#f6e5bf]/80';

  return (
    <DashboardThemeFrame as="header" variant="hero" className={cn('page-hero', className)}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#fffcf7_0%,#fbf1de_54%,#ead5a7_100%)] dark:hidden" />
      <img
        src={visual.image}
        alt={visual.alt}
        className="absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover opacity-0 transition-opacity duration-300 dark:hidden md:block"
        onLoad={(event) => {
          event.currentTarget.classList.remove('opacity-0');
          event.currentTarget.classList.add('opacity-70');
        }}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <div className={cn('absolute inset-0 bg-gradient-to-r to-transparent dark:hidden', overlayClass)} />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow ? <p className="dashboard-eyebrow">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </DashboardThemeFrame>
  );
}
