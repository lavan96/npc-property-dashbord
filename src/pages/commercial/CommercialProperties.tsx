import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Building2, Factory, Calculator } from 'lucide-react';
import { useCommercialProperties, commercialApi, type CommercialProperty } from '@/hooks/useCommercialProperties';
import { useIndustrialProperties, industrialApi, type IndustrialProperty } from '@/hooks/useIndustrialProperties';
import { CommercialPropertyFormModal } from '@/components/commercial/CommercialPropertyFormModal';
import { IndustrialPropertyFormModal } from '@/components/industrial/IndustrialPropertyFormModal';
import { toast } from '@/hooks/use-toast';

type AssetKind = 'commercial' | 'industrial';
type CombinedRow =
  | { kind: 'commercial'; property: CommercialProperty }
  | { kind: 'industrial'; property: IndustrialProperty };

function fmtMoney(n: number | null | undefined) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

const ASSET_LABEL: Record<string, string> = {
  office: 'Office', retail: 'Retail', industrial: 'Industrial', mixed_use: 'Mixed Use',
  medical: 'Medical', childcare: 'Childcare', hospitality: 'Hospitality', other: 'Other',
};

const SUBTYPE_LABEL: Record<string, string> = {
  warehouse: 'Warehouse', logistics: 'Logistics', manufacturing: 'Manufacturing',
  cold_storage: 'Cold Storage', flex: 'Flex / Estate', data_centre: 'Data Centre',
  transport_yard: 'Transport Yard', other: 'Other',
};

function commercialAddress(p: CommercialProperty) {
  return [p.address, [p.suburb, p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function industrialAddress(p: IndustrialProperty) {
  return [p.street, [p.suburb, p.state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export default function CommercialProperties() {
  const commercial = useCommercialProperties();
  const industrial = useIndustrialProperties();
  const [activeKind, setActiveKind] = useState<'all' | AssetKind>('all');
  const [commercialOpen, setCommercialOpen] = useState(false);
  const [industrialOpen, setIndustrialOpen] = useState(false);
  const [editingCommercial, setEditingCommercial] = useState<CommercialProperty | null>(null);
  const [editingIndustrial, setEditingIndustrial] = useState<IndustrialProperty | null>(null);
  const navigate = useNavigate();

  const rows = useMemo<CombinedRow[]>(() => {
    const combined: CombinedRow[] = [
      ...commercial.properties.map(property => ({ kind: 'commercial' as const, property })),
      ...industrial.properties.map(property => ({ kind: 'industrial' as const, property })),
    ];
    return activeKind === 'all' ? combined : combined.filter(row => row.kind === activeKind);
  }, [activeKind, commercial.properties, industrial.properties]);

  const loading = commercial.loading || industrial.loading;

  const openNew = (kind: AssetKind) => {
    if (kind === 'commercial') {
      setEditingCommercial(null);
      setCommercialOpen(true);
    } else {
      setEditingIndustrial(null);
      setIndustrialOpen(true);
    }
  };

  const handleDelete = async (row: CombinedRow) => {
    const label = row.kind === 'commercial' ? commercialAddress(row.property) : industrialAddress(row.property);
    if (!confirm(`Delete "${label || 'property'}" and all related tenancies, capex and scenarios?`)) return;

    const res = row.kind === 'commercial'
      ? await commercialApi.deleteProperty(row.property.id)
      : await industrialApi.deleteProperty(row.property.id);

    if (res.error) toast({ title: 'Delete failed', description: res.error.message, variant: 'destructive' });
    else {
      toast({ title: 'Property deleted' });
      commercial.refresh();
      industrial.refresh();
    }
  };

  const navigateToDetail = (row: CombinedRow) => navigate(`/${row.kind}/${row.property.id}`);

  const editRow = (row: CombinedRow) => {
    if (row.kind === 'commercial') {
      setEditingCommercial(row.property);
      setCommercialOpen(true);
    } else {
      setEditingIndustrial(row.property);
      setIndustrialOpen(true);
    }
  };

  const refreshAll = () => {
    commercial.refresh();
    industrial.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/35 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                Commercial asset pipeline
              </div>
              <h1 className="flex items-start gap-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-700 shadow-sm dark:text-amber-300">
                  <Building2 className="h-6 w-6" />
                </span>
                <span>Commercial & Industrial Properties</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                One pipeline for manual entry, URL scrape and PDF/image parsing across office, retail, mixed-use, warehouse and logistics assets.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap xl:w-auto xl:justify-end">
              <Button
                variant="outline"
                className="justify-center border-border/80 bg-background/80 shadow-sm sm:min-w-36"
                onClick={() => navigate('/calculators?domain=commercial')}
              >
                <Calculator className="mr-2 h-4 w-4" /> Calculators
              </Button>
              <Button
                variant="secondary"
                className="justify-center border border-border/70 bg-muted text-foreground shadow-sm sm:min-w-40"
                onClick={() => openNew('industrial')}
              >
                <Factory className="mr-2 h-4 w-4" /> New Industrial
              </Button>
              <Button
                className="justify-center bg-amber-600 text-white shadow-sm hover:bg-amber-700 sm:min-w-44"
                onClick={() => openNew('commercial')}
              >
                <Plus className="mr-2 h-4 w-4" /> New Commercial
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeKind} onValueChange={(value) => setActiveKind(value as typeof activeKind)}>
          <TabsList className="h-auto rounded-2xl border border-border/70 bg-muted/40 p-1.5 shadow-sm">
            <TabsTrigger className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm" value="all">All ({commercial.properties.length + industrial.properties.length})</TabsTrigger>
            <TabsTrigger className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm" value="commercial">Commercial ({commercial.properties.length})</TabsTrigger>
            <TabsTrigger className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm" value="industrial">Industrial ({industrial.properties.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardContent className="p-0">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-lg font-medium">No commercial or industrial properties yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add an asset manually, scrape a listing URL, or parse a PDF/image in the property form.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => openNew('commercial')}><Plus className="h-4 w-4 mr-2" /> Add Commercial</Button>
                <Button variant="outline" onClick={() => openNew('industrial')}><Plus className="h-4 w-4 mr-2" /> Add Industrial</Button>
              </div>
            </div>
          ) : (
            <div className="ci-table-wrap"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Area (m²)</TableHead>
                  <TableHead className="text-right">Site (m²)</TableHead>
                  <TableHead className="text-right">Price / Valuation</TableHead>
                  <TableHead>Status / GST</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const p: any = row.property;
                  const isIndustrial = row.kind === 'industrial';
                  const address = isIndustrial ? industrialAddress(p) : commercialAddress(p);
                  const area = isIndustrial ? p.gla_sqm : (p.nla_sqm || p.gfa_sqm);
                  const value = isIndustrial ? (p.current_valuation || p.purchase_price) : (p.valuation || p.purchase_price);
                  return (
                    <TableRow key={`${row.kind}-${row.property.id}`} className="cursor-pointer focus-within:bg-primary/5" onClick={() => navigateToDetail(row)}>
                      <TableCell className="font-medium">
                        {isIndustrial && p.property_name ? <div>{p.property_name}</div> : null}
                        <div className={isIndustrial && p.property_name ? 'text-xs text-muted-foreground' : ''}>{address || '—'}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={isIndustrial ? 'ci-badge ci-badge-verified' : 'ci-badge'}>{isIndustrial ? 'Industrial' : 'Commercial'}</Badge></TableCell>
                      <TableCell>{isIndustrial ? (SUBTYPE_LABEL[p.asset_subtype] || p.asset_subtype) : (ASSET_LABEL[p.asset_class] || p.asset_class)}</TableCell>
                      <TableCell className="text-right">{area?.toLocaleString() || '—'}</TableCell>
                      <TableCell className="text-right">{p.site_area_sqm?.toLocaleString() || '—'}</TableCell>
                      <TableCell className="text-right">{fmtMoney(value)}</TableCell>
                      <TableCell className="capitalize text-xs text-muted-foreground">{isIndustrial ? p.status?.replace('_', ' ') : p.gst_treatment?.replace('_', ' ')}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 border-l border-border/70 pl-3">
                          <Button size="icon" variant="ghost" onClick={() => editRow(row)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(row)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table></div>
          )}
        </CardContent>
        </Card>
      </div>

      {commercialOpen && (
        <CommercialPropertyFormModal open={commercialOpen} onClose={() => setCommercialOpen(false)} property={editingCommercial} onSaved={refreshAll} />
      )}
      {industrialOpen && (
        <IndustrialPropertyFormModal open={industrialOpen} onClose={() => setIndustrialOpen(false)} property={editingIndustrial} onSaved={refreshAll} />
      )}
    </div>
  );
}
