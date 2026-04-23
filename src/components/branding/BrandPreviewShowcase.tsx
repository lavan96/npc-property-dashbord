import type { CSSProperties } from 'react';
import { Monitor, LayoutPanelLeft, Globe, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { BrandConfig, BrandTokenMap } from '@/branding/brand-types';
import { resolveBrandTokens } from '@/branding/token-resolver';
import { getBrandAssetSrc } from '@/branding/brand-assets';
import { BrandLogo } from './BrandAssets';

interface BrandPreviewShowcaseProps {
  settings: BrandConfig;
}

function tokenStyle(tokenMap: BrandTokenMap): CSSProperties {
  return tokenMap as CSSProperties;
}

export function BrandPreviewShowcase({ settings }: BrandPreviewShowcaseProps) {
  const tokens = resolveBrandTokens(settings);
  const faviconSrc = getBrandAssetSrc(settings, 'favicon');

  return (
    <Tabs defaultValue="dashboard" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="client">Client</TabsTrigger>
        <TabsTrigger value="finance">Finance</TabsTrigger>
        <TabsTrigger value="browser">Browser</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div style={tokenStyle(tokens.dark)} className="rounded-2xl border border-border/60 bg-sidebar/95 p-4 text-sidebar-foreground shadow-xl">
            <div className="flex items-center gap-3 border-b border-sidebar-border/70 pb-4">
              <BrandLogo slot="sidebar" className="h-10 max-w-[120px] object-contain" fallbackClassName="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{settings.companyName}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/65">Internal dashboard</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {['Overview', 'Clients', 'Reports', 'Automation'].map((item, index) => (
                <div
                  key={item}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${index === 0 ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-sidebar-accent/10 text-sidebar-foreground/80'}`}
                >
                  <LayoutPanelLeft className="h-4 w-4" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div style={tokenStyle(tokens.dark)} className="rounded-2xl border border-border/60 bg-background p-4 shadow-xl">
            <div className="rounded-2xl border border-border/70 bg-card/90 shadow-lg">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Executive workspace</p>
                  <p className="text-xs text-muted-foreground">Surface, controls, and actions respond to your selected brand tokens.</p>
                </div>
                <Badge className="bg-primary text-primary-foreground">Primary</Badge>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-3">
                {['Pipeline health', 'Client momentum', 'Report velocity'].map((item, index) => (
                  <div key={item} className="rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-md">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item}</p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">{['82%', '14', '36h'][index]}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Previewing semantic panel, border, and emphasis tokens.</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="client">
        <div style={tokenStyle(tokens.light)} className="rounded-2xl border border-border/60 bg-background p-4 shadow-xl">
          <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div className="flex items-center gap-3">
                <BrandLogo slot="auth" className="h-10 max-w-[180px] object-contain" fallbackClassName="h-10 w-10" />
                <div>
                  <p className="font-semibold text-foreground">{settings.companyName}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Client portal</p>
                </div>
              </div>
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-primary/8 p-4">
                <p className="text-sm font-semibold text-foreground">Deal Progress</p>
                <p className="mt-1 text-sm text-muted-foreground">Portal hero, card, and active navigation emphasis preview.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Secure Documents</p>
                <p className="mt-1 text-sm text-muted-foreground">See how client-facing surfaces inherit your chosen palette.</p>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="finance">
        <div style={tokenStyle(tokens.dark)} className="rounded-2xl border border-border/60 bg-background p-4 shadow-xl">
          <div className="rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <BrandLogo slot="auth" className="h-10 max-w-[180px] object-contain" fallbackClassName="h-10 w-10" />
                  <div>
                    <p className="font-semibold text-foreground">Finance Portal</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Partner access</p>
                  </div>
                </div>
                <p className="mt-4 max-w-md text-sm text-muted-foreground">Previewing partner-facing auth and shell surfaces with your current brand tokens.</p>
              </div>
              <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Primary action</button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="browser">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-lg">
          <div className="rounded-2xl border border-border/60 bg-background p-4">
            <div className="flex items-center gap-3">
              {faviconSrc ? (
                <img src={faviconSrc} alt={`${settings.companyName} favicon`} className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Globe className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{settings.companyName} Dashboard</p>
                <p className="text-xs text-muted-foreground">Browser tab + favicon auto-fill preview</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              <Monitor className="mb-2 h-4 w-4 text-primary" />
              The favicon slot falls back to your sidebar icon or primary logo if a dedicated favicon has not been uploaded yet.
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}