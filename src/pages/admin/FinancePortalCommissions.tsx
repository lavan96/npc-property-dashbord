import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FlattenPdfIconButton } from '@/components/common/FlattenPdfIconButton';
import { fetchPdfBlob } from '@/lib/pdf/downloadPdf';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import {
  Loader2, Plus, RefreshCw, FileText, DollarSign, Download, Search, ArrowLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface Commission {
  id: string;
  finance_contact_id: string;
  client_id: string | null;
  deal_id: string | null;
  partner_name_snapshot: string | null;
  partner_company_snapshot: string | null;
  client_name_snapshot: string | null;
  deal_type_snapshot: string | null;
  commission_basis: string;
  basis_amount: number;
  rate_pct: number;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
  trigger_event: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  statement_id: string | null;
}

interface Statement {
  id: string;
  finance_contact_id: string;
  partner_name_snapshot: string | null;
  partner_company_snapshot: string | null;
  period_start: string;
  period_end: string;
  total_gross: number;
  total_gst: number;
  total_net: number;
  line_count: number;
  status: string;
  pdf_storage_path: string | null;
  remittance_csv_path: string | null;
  issued_at: string | null;
  paid_at: string | null;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  invoiced: 'default',
  paid: 'default',
  clawback: 'destructive',
  void: 'outline',
};

const fmt = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinancePortalCommissions() {
  const [tab, setTab] = useState<'commissions' | 'statements'>('commissions');
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [filterPartner, setFilterPartner] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [cRes, sRes, pRes] = await Promise.all([
        invokeSecureFunction('finance-portal-commissions', { operation: 'list_commissions' }),
        invokeSecureFunction('finance-portal-commissions', { operation: 'list_statements' }),
        invokeSecureFunction('finance-portal-admin', { operation: 'list_users' }),
      ]);
      if (cRes.error) throw new Error(cRes.error.message);
      if (sRes.error) throw new Error(sRes.error.message);
      setCommissions(cRes.data?.commissions || []);
      setStatements(sRes.data?.statements || []);
      const users = pRes.data?.users || [];
      setPartners(users.map((u: any) => ({ id: u.id, name: u.name, company: u.company })));
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const filteredCommissions = useMemo(() => {
    return commissions.filter(c => {
      if (filterPartner !== 'all' && c.finance_contact_id !== filterPartner) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        const hit =
          (c.partner_name_snapshot || '').toLowerCase().includes(s) ||
          (c.client_name_snapshot || '').toLowerCase().includes(s) ||
          (c.notes || '').toLowerCase().includes(s);
        if (!hit) return false;
      }
      return true;
    });
  }, [commissions, filterPartner, filterStatus, search]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const bulkSetStatus = async (status: string) => {
    if (selected.size === 0) return;
    const { error } = await invokeSecureFunction('finance-portal-commissions', {
      operation: 'set_status', ids: Array.from(selected), status,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Updated ${selected.size} commission${selected.size === 1 ? '' : 's'}`);
    setSelected(new Set());
    void refresh();
  };

  const issueStatement = async (id: string) => {
    const { error } = await invokeSecureFunction('finance-portal-commissions', { operation: 'issue_statement', id });
    if (error) { toast.error(error.message); return; }
    toast.success('Statement issued');
    void refresh();
  };

  const markPaid = async (id: string) => {
    const ref = window.prompt('Payment reference (optional):') || null;
    const { error } = await invokeSecureFunction('finance-portal-commissions', {
      operation: 'mark_statement_paid', id, paid_reference: ref,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Statement marked paid');
    void refresh();
  };

  const downloadStatement = async (path: string) => {
    const { data, error } = await invokeSecureFunction('finance-portal-commissions', {
      operation: 'admin_get_signed_url', path,
    });
    if (error) { toast.error(error.message); return; }
    if (data?.url) window.open(data.url, '_blank', 'noopener');
  };

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/finance-portal"><ArrowLeft className="h-4 w-4 mr-1" />Finance Portal</Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Commissions & Payouts</h1>
          <p className="text-muted-foreground">Track partner commissions, issue statements, and process remittance.</p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab('commissions')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'commissions' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        ><DollarSign className="inline h-4 w-4 mr-1" />Commissions ({commissions.length})</button>
        <button
          onClick={() => setTab('statements')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'statements' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        ><FileText className="inline h-4 w-4 mr-1" />Statements ({statements.length})</button>
      </div>

      {tab === 'commissions' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search partner, client, notes…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterPartner} onValueChange={setFilterPartner}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Partner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All partners</SelectItem>
                  {partners.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.company ? ` · ${p.company}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="invoiced">Invoiced</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="clawback">Clawback</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
              <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
                <DialogTrigger asChild>
                  <Button variant="outline"><FileText className="h-4 w-4 mr-2" />Generate statement</Button>
                </DialogTrigger>
                <GenerateStatementDialog partners={partners} onClose={() => { setShowGenerate(false); refresh(); }} />
              </Dialog>
              <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Manual commission</Button>
                </DialogTrigger>
                <ManualCommissionDialog partners={partners} onClose={() => { setShowCreate(false); refresh(); }} />
              </Dialog>
            </div>

            {selected.size > 0 && (
              <div className="mt-3 flex items-center gap-2 p-2 rounded-md bg-muted/40 border">
                <span className="text-sm">{selected.size} selected</span>
                <Button size="sm" variant="outline" onClick={() => bulkSetStatus('invoiced')}>Mark invoiced</Button>
                <Button size="sm" variant="outline" onClick={() => bulkSetStatus('paid')}>Mark paid</Button>
                <Button size="sm" variant="outline" onClick={() => bulkSetStatus('void')}>Void</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />Loading commissions…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Partner</TableHead>
                    <TableHead>Client / Deal</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Basis</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommissions.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No commissions found</TableCell></TableRow>
                  )}
                  {filteredCommissions.map(c => (
                    <TableRow key={c.id}>
                      <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{c.partner_name_snapshot || '—'}</div>
                        <div className="text-xs text-muted-foreground">{c.partner_company_snapshot || ''}</div>
                      </TableCell>
                      <TableCell>
                        <div>{c.client_name_snapshot || '—'}</div>
                        <div className="text-xs text-muted-foreground">{c.deal_type_snapshot || ''}</div>
                      </TableCell>
                      <TableCell><span className="text-xs">{c.trigger_event || '—'}</span></TableCell>
                      <TableCell className="text-right">{fmt(c.basis_amount)}</TableCell>
                      <TableCell className="text-right">{Number(c.rate_pct).toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(c.net_amount)}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[c.status] || 'outline'}>{c.status}</Badge></TableCell>
                      <TableCell className="text-xs">{format(new Date(c.created_at), 'd MMM yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'statements' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Partner statements</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No statements yet</TableCell></TableRow>
                  )}
                  {statements.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.partner_name_snapshot}</div>
                        <div className="text-xs text-muted-foreground">{s.partner_company_snapshot}</div>
                      </TableCell>
                      <TableCell className="text-sm">{s.period_start} → {s.period_end}</TableCell>
                      <TableCell className="text-right">{s.line_count}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(s.total_net)}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[s.status] || 'outline'}>{s.status}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        {s.status === 'draft' && (
                          <Button size="sm" variant="outline" onClick={() => issueStatement(s.id)}>Issue</Button>
                        )}
                        {s.status === 'issued' && (
                          <Button size="sm" variant="outline" onClick={() => markPaid(s.id)}>Mark paid</Button>
                        )}
                        {s.pdf_storage_path && (
                          <Button size="sm" variant="ghost" onClick={() => downloadStatement(s.pdf_storage_path!)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Manual commission dialog ────────────────────────────────────────────────
function ManualCommissionDialog({ partners, onClose }: { partners: any[]; onClose: () => void }) {
  const [partnerId, setPartnerId] = useState('');
  const [basis, setBasis] = useState('');
  const [rate, setRate] = useState('0.55');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partnerId) { toast.error('Select a partner'); return; }
    setSaving(true);
    const { error } = await invokeSecureFunction('finance-portal-commissions', {
      operation: 'create_manual',
      finance_contact_id: partnerId,
      basis_amount: Number(basis) || 0,
      rate_pct: Number(rate) || 0,
      notes,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Commission created');
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Manual commission line</DialogTitle>
        <DialogDescription>Add an ad-hoc commission for a partner.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Partner</Label>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
            <SelectContent>
              {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.company ? ` · ${p.company}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Basis amount ($)</Label><Input type="number" value={basis} onChange={e => setBasis(e.target.value)} /></div>
          <div><Label>Rate (%)</Label><Input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></div>
        </div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Generate statement dialog ───────────────────────────────────────────────
function GenerateStatementDialog({ partners, onClose }: { partners: any[]; onClose: () => void }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [partnerId, setPartnerId] = useState('');
  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(lastOfMonth);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partnerId) { toast.error('Select a partner'); return; }
    setSaving(true);
    const { data, error } = await invokeSecureFunction('finance-portal-commissions', {
      operation: 'generate_statement', partner_id: partnerId, period_start: start, period_end: end,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Statement created with ${data?.line_count || 0} line${data?.line_count === 1 ? '' : 's'}`);
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Generate statement</DialogTitle>
        <DialogDescription>Pulls all eligible (pending / invoiced) commissions in the period that aren't already on a statement.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Partner</Label>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
            <SelectContent>
              {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.company ? ` · ${p.company}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Period start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><Label>Period end</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Generate</Button>
      </DialogFooter>
    </DialogContent>
  );
}
