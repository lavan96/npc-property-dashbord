import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Download, DollarSign, Wallet, Hourglass, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (n: number) =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary', invoiced: 'default', paid: 'default', clawback: 'destructive', void: 'outline',
};

export default function FinancePortalEarnings() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [searchParams] = useSearchParams();
  const highlightLatest = searchParams.get('highlight') === 'latest';
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'commissions' | 'statements'>(highlightLatest ? 'commissions' : 'commissions');
  const [kpis, setKpis] = useState<any>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const latestRowRef = useRef<HTMLTableRowElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [sumRes, cRes, stRes] = await Promise.all([
        invokeFinanceFunction('finance-portal-commissions', { operation: 'partner_summary' }),
        invokeFinanceFunction('finance-portal-commissions', { operation: 'partner_commissions' }),
        invokeFinanceFunction('finance-portal-commissions', { operation: 'partner_statements' }),
      ]);
      if (sumRes.error) throw new Error(sumRes.error.message);
      setKpis(sumRes.data?.kpis);
      setCommissions(cRes.data?.commissions || []);
      setStatements(stRes.data?.statements || []);
    } catch (e: any) {
      toast.error('Failed to load earnings: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const downloadStatement = async (id: string, type: 'pdf' | 'csv') => {
    const { data, error } = await invokeFinanceFunction('finance-portal-commissions', {
      operation: 'partner_statement_pdf_url', statement_id: id,
    });
    if (error) { toast.error(error.message); return; }
    const url = type === 'pdf' ? data?.pdf_url : data?.csv_url;
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Earnings</h1>
          <p className="text-muted-foreground">Your commissions and remittance statements.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="YTD Gross" value={fmt(kpis?.ytd_gross || 0)} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="YTD Net" value={fmt(kpis?.ytd_net || 0)} accent />
        <KpiCard icon={<Hourglass className="h-4 w-4" />} label="Pending Net" value={fmt(kpis?.pending_net || 0)} />
        <KpiCard icon={<CalendarCheck className="h-4 w-4" />} label="Paid This Month" value={fmt(kpis?.paid_this_month || 0)} />
      </div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('commissions')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'commissions' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>
          Commissions ({commissions.length})
        </button>
        <button onClick={() => setTab('statements')}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium ${tab === 'statements' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}>
          Statements ({statements.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />Loading…
        </div>
      ) : tab === 'commissions' ? (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Basis</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {commissions.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No commissions yet</TableCell></TableRow>
                )}
                {commissions.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{format(new Date(c.created_at), 'd MMM yyyy')}</TableCell>
                    <TableCell>
                      <div>{c.client_name_snapshot || '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.deal_type_snapshot || ''}</div>
                    </TableCell>
                    <TableCell className="text-xs">{c.trigger_event || '—'}</TableCell>
                    <TableCell className="text-right">{fmt(c.basis_amount)}</TableCell>
                    <TableCell className="text-right">{Number(c.rate_pct).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(c.net_amount)}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[c.status] || 'outline'}>{c.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {statements.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No statements issued yet</TableCell></TableRow>
                )}
                {statements.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{s.period_start} → {s.period_end}</TableCell>
                    <TableCell className="text-right">{s.line_count}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(s.total_net)}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[s.status] || 'outline'}>{s.status}</Badge></TableCell>
                    <TableCell className="text-xs">{s.issued_at ? format(new Date(s.issued_at), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {s.pdf_storage_path && (
                        <Button size="sm" variant="ghost" onClick={() => downloadStatement(s.id, 'pdf')}>
                          <Download className="h-4 w-4 mr-1" />PDF
                        </Button>
                      )}
                      {s.remittance_csv_path && (
                        <Button size="sm" variant="ghost" onClick={() => downloadStatement(s.id, 'csv')}>
                          <Download className="h-4 w-4 mr-1" />CSV
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">{icon}{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${accent ? 'text-primary' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
