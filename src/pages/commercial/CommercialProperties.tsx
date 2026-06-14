import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { useCommercialProperties, commercialApi, type CommercialProperty } from '@/hooks/useCommercialProperties';
import { CommercialPropertyFormModal } from '@/components/commercial/CommercialPropertyFormModal';
import { toast } from '@/hooks/use-toast';

function fmtMoney(n: number | null | undefined) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

const ASSET_LABEL: Record<string, string> = {
  office: 'Office', retail: 'Retail', industrial: 'Industrial', mixed_use: 'Mixed Use',
  medical: 'Medical', childcare: 'Childcare', hospitality: 'Hospitality', other: 'Other',
};

export default function CommercialProperties() {
  const { properties, loading, refresh } = useCommercialProperties();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommercialProperty | null>(null);
  const navigate = useNavigate();

  const handleDelete = async (id: string, address: string) => {
    if (!confirm(`Delete "${address}" and all its tenancies & scenarios?`)) return;
    const res = await commercialApi.deleteProperty(id);
    if (res.error) toast({ title: 'Delete failed', description: res.error.message, variant: 'destructive' });
    else { toast({ title: 'Property deleted' }); refresh(); }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Commercial / Industrial Properties
          </h1>
          <p className="text-muted-foreground mt-1">
            Commercial and industrial rent rolls, NOI, yield, ICR/DSCR and DCF scenarios.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/calculators?domain=commercial')}>Calculators</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Property
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : properties.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-lg font-medium">No commercial or industrial properties yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first asset to start building the rent roll and DCF models.</p>
              <Button className="mt-4" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Property
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Asset Class</TableHead>
                  <TableHead>NLA (m²)</TableHead>
                  <TableHead className="text-right">Purchase Price</TableHead>
                  <TableHead className="text-right">Valuation</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map(p => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/commercial/${p.id}`)}>
                    <TableCell className="font-medium">
                      {p.address}
                      {p.suburb && <span className="text-muted-foreground">, {p.suburb} {p.state} {p.postcode}</span>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{ASSET_LABEL[p.asset_class] || p.asset_class}</Badge></TableCell>
                    <TableCell>{p.nla_sqm?.toLocaleString() || '—'}</TableCell>
                    <TableCell className="text-right">{fmtMoney(p.purchase_price)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(p.valuation)}</TableCell>
                    <TableCell className="capitalize text-xs text-muted-foreground">{p.gst_treatment.replace('_', ' ')}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id, p.address)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && (
        <CommercialPropertyFormModal
          open={open}
          onClose={() => setOpen(false)}
          property={editing}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
