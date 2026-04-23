import { Globe, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrand } from '@/branding/useTokens';
import { getBrandAssetSrc, type BrandAssetSlot } from '@/branding/brand-assets';

interface BrandLogoProps {
  slot: BrandAssetSlot;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}

export function BrandLogo({ slot, alt, className, fallbackClassName }: BrandLogoProps) {
  const { settings } = useBrand();
  const src = getBrandAssetSrc(settings, slot);

  if (src) {
    return <img src={src} alt={alt || settings.companyName} className={className} />;
  }

  const fallbackIcon = slot === 'favicon' ? Globe : Building2;
  const FallbackIcon = fallbackIcon;

  return (
    <div className={cn('flex items-center justify-center rounded-xl bg-primary/10 text-primary', fallbackClassName)}>
      <FallbackIcon className="h-5 w-5" />
    </div>
  );
}

interface BrandLockupProps {
  slot?: Extract<BrandAssetSlot, 'auth' | 'sidebar' | 'sidebar-icon'>;
  meta?: string;
  className?: string;
  logoClassName?: string;
  fallbackClassName?: string;
  companyClassName?: string;
  metaClassName?: string;
}

export function BrandLockup({
  slot = 'sidebar',
  meta,
  className,
  logoClassName,
  fallbackClassName,
  companyClassName,
  metaClassName,
}: BrandLockupProps) {
  const { settings } = useBrand();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandLogo
        slot={slot}
        alt={settings.companyName}
        className={logoClassName}
        fallbackClassName={fallbackClassName}
      />
      <div className="min-w-0">
        <p className={cn('truncate font-semibold text-foreground', companyClassName)}>{settings.companyName}</p>
        {meta ? <p className={cn('text-[10px] uppercase tracking-[0.18em] text-muted-foreground', metaClassName)}>{meta}</p> : null}
      </div>
    </div>
  );
}