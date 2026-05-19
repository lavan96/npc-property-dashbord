/**
 * Pricing & Catalog card — read-only view of Mission Control's pricing
 * catalogue (seat roles, add-on modules, setup packages, per-report credit
 * costs). All edits happen in Mission Control's /billing/catalog.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Sparkles, Layers, Coins, UserCog, AlertTriangle, ExternalLink } from 'lucide-react';
import { useMissionControlCatalog } from '@/hooks/useMissionControlCatalog';
import { formatPriceRange, type MissionControlCatalog } from '@/lib/missionControlCatalog';
import { MISSION_CONTROL_CATALOG_URL, openMissionControl } from '@/lib/missionControl';

function Section({
  icon: Icon, title, count, children,
}: { icon: any; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto">{count}</Badge>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground italic">No items configured in Mission Control.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

export function PricingCatalogCard() {
  const { catalog, loading, error, refresh } = useMissionControlCatalog();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Pricing & Catalog
            </CardTitle>
            <CardDescription>
              Seat roles, add-on modules, setup packages and per-report credit costs synced from Mission Control.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !catalog && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {catalog && <CatalogBody catalog={catalog} />}

        <Separator />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Read-only — edits happen in Mission Control.</span>
          <Button variant="outline" size="sm" onClick={() => openMissionControl(MISSION_CONTROL_CATALOG_URL)}>
            Open catalog
            <ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogBody({ catalog }: { catalog: MissionControlCatalog }) {
  return (
    <>
      <Section icon={UserCog} title="Seat roles" count={catalog.roles.length}>
        {catalog.roles.map((r) => (
          <div key={r.slug} className="flex items-start justify-between gap-3 rounded-md border bg-card/50 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{r.name}</span>
                <code className="text-[10px] text-muted-foreground">{r.slug}</code>
              </div>
              {r.permissions?.length ? (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {r.permissions.slice(0, 6).join(' · ')}
                  {r.permissions.length > 6 ? ` +${r.permissions.length - 6}` : ''}
                </p>
              ) : null}
            </div>
            <Badge variant="secondary" className="shrink-0">
              {formatPriceRange(r.price_min_cents, r.price_max_cents, r.currency || 'AUD')}
            </Badge>
          </div>
        ))}
      </Section>

      <Section icon={Sparkles} title="Add-on modules" count={catalog.addons.length}>
        {catalog.addons.map((a) => (
          <div key={a.slug} className="flex items-start justify-between gap-3 rounded-md border bg-card/50 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{a.name}</span>
                <code className="text-[10px] text-muted-foreground">{a.slug}</code>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Billed {a.billing_period}
                {a.included_in_plans?.length
                  ? ` · Included in: ${a.included_in_plans.join(', ')}`
                  : ''}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {formatPriceRange(a.price_min_cents, a.price_max_cents, a.currency || 'AUD')}
            </Badge>
          </div>
        ))}
      </Section>

      <Section icon={Layers} title="Setup packages" count={catalog.setups.length}>
        {catalog.setups.map((s) => (
          <div key={s.slug} className="rounded-md border bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{s.name}</span>
              <code className="text-[10px] text-muted-foreground">{s.slug}</code>
              {s.applies_to_plans?.length ? (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {s.applies_to_plans.join(', ')}
                </Badge>
              ) : null}
            </div>
            {s.deliverables?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                {s.deliverables.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            ) : null}
          </div>
        ))}
      </Section>

      <Section icon={Coins} title="Report credit costs" count={catalog.reports.length}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {catalog.reports.map((r) => (
            <div key={r.slug} className="flex items-center justify-between gap-3 rounded-md border bg-card/50 p-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <code className="text-[10px] text-muted-foreground">{r.slug}</code>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {r.credit_cost} {r.credit_cost === 1 ? 'credit' : 'credits'}
              </Badge>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
