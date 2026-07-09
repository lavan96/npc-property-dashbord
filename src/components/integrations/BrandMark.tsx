import { useState, type ReactNode } from 'react';
import { brandLogoUrl, getBrandProfile } from '@/lib/integrations/brandProfiles';

interface BrandMarkProps {
  integrationId: string;
  /** Fallback lucide (or arbitrary) node when no logo slug or the CDN 404s */
  fallback: ReactNode;
  /** Rendered SVG size in px */
  size?: number;
  className?: string;
}

/**
 * Renders the brand's Simple Icons SVG in its official color.
 * Falls back to the provided lucide icon if the profile has no slug
 * or the CDN request fails (offline, blocked, etc.).
 */
export function BrandMark({ integrationId, fallback, size = 24, className }: BrandMarkProps) {
  const profile = getBrandProfile(integrationId);
  const [errored, setErrored] = useState(false);

  if (!profile?.slug || errored) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={brandLogoUrl(profile.slug, profile.color)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
