import type { BrandConfig } from './brand-types';

export type BrandAssetSlot = 'auth' | 'sidebar' | 'sidebar-icon' | 'favicon';

export function getBrandAssetSrc(
  settings: Pick<BrandConfig, 'authLogo' | 'sidebarLogo' | 'sidebarIcon' | 'favicon'>,
  slot: BrandAssetSlot
) {
  switch (slot) {
    case 'auth':
      return settings.authLogo || settings.sidebarLogo || settings.sidebarIcon || null;
    case 'sidebar':
      return settings.sidebarLogo || settings.authLogo || settings.sidebarIcon || null;
    case 'sidebar-icon':
      return settings.sidebarIcon || settings.sidebarLogo || settings.authLogo || null;
    case 'favicon':
      return settings.favicon || settings.sidebarIcon || settings.sidebarLogo || settings.authLogo || null;
    default:
      return null;
  }
}