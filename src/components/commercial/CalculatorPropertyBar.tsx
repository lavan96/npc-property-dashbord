/**
 * Property selector bar shown above the Commercial / Industrial calculator
 * suites. Reads the available properties for the active domain and lets users
 * pick one to prefill every downstream calculator card.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Factory, Link2, Link2Off, Loader2 } from 'lucide-react';
import { useCalculatorPrefill } from '@/contexts/CalculatorPrefillContext';
import { commercialApi, type CommercialProperty } from '@/hooks/useCommercialProperties';
import { industrialApi, type IndustrialProperty } from '@/hooks/useIndustrialProperties';

const UNASSIGNED = '__unassigned__';

export function CalculatorPropertyBar() {
  const { domain, prefill, property, loading, selectProperty, clear } = useCalculatorPrefill();
  const [list, setList] = useState<Array<{ id: string; label: string }>>([]);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      if (domain === 'commercial') {
        const res = await commercialApi.listProperties();
        if (!cancelled && res.data) {
          setList((res.data as CommercialProperty[]).map(p => ({
            id: p.id,
            label: `${p.address}${p.suburb ? `, ${p.suburb} ${p.state}` : ''}`,
          })));
        }
      } else {
        const res = await industrialApi.listProperties();
        if (!cancelled && res.data) {
          setList((res.data as IndustrialProperty[]).map(p => ({
            id: p.id,
            label: `${p.property_name || p.street || 'Untitled site'}${p.suburb ? `, ${p.suburb} ${p.state}` : ''}`,
          })));
        }
      }
      if (!cancelled) setListLoading(false);
    })();
    return () => { cancelled = true; };
  }, [domain]);

  const Icon = domain === 'industrial' ? Factory : Building2;

  return (
    <Card className="border-primary/30 bg-card/60">
      <CardContent className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <Icon className="h-5 w-5 text-primary" />
          <div className="text-sm font-medium">Calculator data source</div>
        </div>
        <div className="flex-1 min-w-[260px]">
          <Select
            value={prefill?.propertyId ?? UNASSIGNED}
            onValueChange={(v) => selectProperty(v === UNASSIGNED ? null : v)}
            disabled={listLoading || loading}
          >
            <SelectTrigger>
              <SelectValue placeholder={listLoading ? 'Loading properties…' : 'Manual entry (no property linked)'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Manual entry (no property linked)</SelectItem>
              {list.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {prefill ? (
          <>
            <Badge variant="default" className="gap-1">
              <Link2 className="h-3 w-3" /> Linked
            </Badge>
            {prefill.assetSubtype && <Badge variant="secondary" className="capitalize">{String(prefill.assetSubtype).replace(/_/g, ' ')}</Badge>}
            <Button size="sm" variant="outline" onClick={clear}>
              <Link2Off className="h-4 w-4 mr-1" /> Unlink
            </Button>
          </>
        ) : (
          <Badge variant="outline">Manual</Badge>
        )}
        {property && (
          <div className="w-full text-xs text-muted-foreground pt-1">
            Prefill applied to all calculators. Edits stay local unless you click "Save back to property".
          </div>
        )}
      </CardContent>
    </Card>
  );
}
