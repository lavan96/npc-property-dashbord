import type { CSSProperties } from 'react';
import { LayoutPanelLeft, Globe, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { BrandConfig, BrandTokenMap } from '@/branding/brand-types';
import { resolveBrandTokens } from '@/branding/token-resolver';
import { getBrandAssetSrc } from '@/branding/brand-assets';
import { BrandFavicon, BrandLogo, BrandMark } from './BrandAssets';

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
    <Tabs defaultValue="dashboard" className="min-w-0 space-y-5">
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-2 rounded-[1.35rem] border border-border/70 bg-background/70 p-1.5 shadow-inner shadow-background/10 sm:grid-cols-4">
        {['dashboard', 'client', 'finance', 'browser'].map((surface) => (
          <TabsTrigger
            key={surface}
            className="min-w-0 rounded-2xl px-3 py-2.5 text-xs font-semibold capitalize text-muted-foreground transition-all hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=active]:border data-[state=active]:border-primary/30 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 sm:text-sm"
            value={surface}
          >
            <span className="block min-w-0 truncate">{surface}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="dashboard" className="space-y-4">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div style={tokenStyle(tokens.dark)} className="min-w-0 overflow-hidden rounded-[1.75rem] border border-sidebar-border/70 bg-sidebar/95 p-4 text-sidebar-foreground shadow-2xl shadow-background/15 ring-1 ring-primary/5">
            <div className="flex min-w-0 items-center gap-3 border-b border-sidebar-border/70 pb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border/60 bg-sidebar-accent/10 p-1 shadow-inner">
                <BrandLogo slot="sidebar" className="max-h-10 max-w-[120px] object-contain" fallbackClassName="h-10 w-10" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{settings.companyName}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/65">Internal dashboard</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {['Overview', 'Clients', 'Reports', 'Automation'].map((item, index) => (
                <div
                  key={item}
                  className={`flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${index === 0 ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/15' : 'bg-sidebar-accent/10 text-sidebar-foreground/80'}`}
                >
                  <LayoutPanelLeft className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={tokenStyle(tokens.dark)} className="min-w-0 overflow-hidden rounded-[1.75rem] border border-border/60 bg-background p-3 shadow-2xl shadow-background/15 sm:p-4">
            <div className="min-w-0 overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/95 shadow-xl ring-1 ring-primary/5">
              <div className="flex min-w-0 flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Executive workspace</p>
                  <p className="break-words text-xs text-muted-foreground">Surface, controls, and actions respond to your selected brand tokens.</p>
                </div>
                <Badge className="w-fit shrink-0 rounded-full border border-primary/30 bg-primary px-3 text-primary-foreground shadow-md shadow-primary/25">Primary</Badge>
              </div>
              <div className="grid gap-4 p-4 md:grid-cols-3">
                {['Pipeline health', 'Client momentum', 'Report velocity'].map((item, index) => (
                  <div key={item} className="min-w-0 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 shadow-md shadow-background/10">
                    <p className="truncate text-xs uppercase tracking-[0.18em] text-muted-foreground">{item}</p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">{['82%', '14', '36h'][index]}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Previewing semantic panel, border, and emphasis tokens.</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="client">
        <div style={tokenStyle(tokens.light)} className="min-w-0 overflow-hidden rounded-[1.75rem] border border-border/60 bg-background p-3 shadow-2xl shadow-background/15 sm:p-4">
          <div className="min-w-0 rounded-[28px] border border-border/70 bg-card/95 p-4 shadow-xl ring-1 ring-primary/5">
            <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo slot="auth" className="h-10 max-w-[180px] shrink-0 object-contain" fallbackClassName="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{settings.companyName}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Client portal</p>
                </div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-primary/20 bg-primary/10 p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Deal Progress</p>
                <p className="mt-1 text-sm text-muted-foreground">Portal hero, card, and active navigation emphasis preview.</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border/60 bg-background/55 p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">Secure Documents</p>
                <p className="mt-1 text-sm text-muted-foreground">See how client-facing surfaces inherit your chosen palette.</p>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="finance">
        <div style={tokenStyle(tokens.dark)} className="min-w-0 overflow-hidden rounded-[1.75rem] border border-border/60 bg-background p-3 shadow-2xl shadow-background/15 sm:p-4">
          <div className="min-w-0 rounded-[28px] border border-border/70 bg-card/95 p-5 shadow-xl ring-1 ring-primary/5">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandLogo slot="auth" className="h-10 max-w-[180px] shrink-0 object-contain" fallbackClassName="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">Finance Portal</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Partner access</p>
                  </div>
                </div>
                <p className="mt-4 max-w-md break-words text-sm text-muted-foreground">Previewing partner-facing auth and shell surfaces with your current brand tokens.</p>
              </div>
              <button className="w-fit max-w-full shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/30"><span className="block truncate">Primary action</span></button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="browser">
        <div className="min-w-0 rounded-[1.75rem] border border-border/60 bg-card p-3 shadow-xl shadow-background/10 ring-1 ring-primary/5 sm:p-4">
          <div className="min-w-0 rounded-2xl border border-border/60 bg-background p-4">
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 shadow-inner">
               {faviconSrc ? <BrandFavicon settings={settings} alt={`${settings.companyName} favicon`} /> : (
                 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                   <Globe className="h-4 w-4" />
                 </div>
               )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{settings.companyName} Dashboard</p>
                <p className="truncate text-xs text-muted-foreground">Browser tab + favicon auto-fill preview</p>
              </div>
            </div>
            <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
               <div className="mb-2"><BrandMark settings={settings} slot="sidebar-icon" className="h-4 w-4 object-contain" fallbackClassName="h-4 w-4 rounded" /></div>
              The favicon slot falls back to your sidebar icon or primary logo if a dedicated favicon has not been uploaded yet.
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
