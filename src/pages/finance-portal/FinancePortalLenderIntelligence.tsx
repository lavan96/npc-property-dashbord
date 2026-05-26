import { useEffect, useState, useMemo } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, BookOpen, Trophy } from 'lucide-react';
import { LenderPlaybookEditorDialog } from '@/components/finance-portal/LenderPlaybookEditorDialog';

const normalizeKey = (s: string) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const fmtAUD = (n?: number | null) =>
  n == null ? '—' : `$${n.toLocaleString('en-AU')}`;

export default function FinancePortalLenderIntelligence() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [loading, setLoading] = useState(true);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loanAmount, setLoanAmount] = useState<number>(700000);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<any[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ key: string; label: string; initial: any } | null>(null);
  const [newLenderLabel, setNewLenderLabel] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await invokeFinanceFunction(
      'finance-portal-lender-intelligence',
      { operation: 'list_playbooks' },
    );
    setPlaybooks(data?.playbooks || []);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const toggleSel = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 5) next.add(key);
      return next;
    });
  };

  const runCompare = async () => {
    if (selected.size < 2) return;
    setComparing(true);
    const { data } = await invokeFinanceFunction(
      'finance-portal-lender-intelligence',
      {
        operation: 'compare_lenders',
        lender_keys: Array.from(selected),
        loan_amount: loanAmount,
      },
    );
    setComparison(data?.comparison || []);
    setComparing(false);
  };

  const openEditor = (pb: any | null, label?: string) => {
    const key = pb?.lender_key || normalizeKey(label || '');
    if (!key) return;
    setEditorTarget({ key, label: pb?.lender_label || label || key, initial: pb });
    setEditorOpen(true);
  };

  const winner = useMemo(
    () => comparison.length ? comparison[0]?.lender_key : null,
    [comparison],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Lender Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Workspace playbooks, turnaround stats, and side-by-side comparison.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add lender (e.g. Macquarie)"
            value={newLenderLabel}
            onChange={(e) => setNewLenderLabel(e.target.value)}
            className="w-56"
          />
          <Button
            disabled={!newLenderLabel.trim()}
            onClick={() => {
              openEditor(null, newLenderLabel.trim());
              setNewLenderLabel('');
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Playbooks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : playbooks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No lender playbooks yet. Add your first one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead className="text-right">Rate p.a.</TableHead>
                  <TableHead className="text-right">Turnaround</TableHead>
                  <TableHead className="text-right">Approval rate</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead>BDM</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playbooks.map((p) => {
                  const turnaround = p.typical_turnaround_days_override ?? p.stats?.median_days_to_approval;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(p.lender_key)}
                          onCheckedChange={() => toggleSel(p.lender_key)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.lender_label}</TableCell>
                      <TableCell className="text-right">
                        {p.rate_band_pa != null ? `${Number(p.rate_band_pa).toFixed(2)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {turnaround != null ? `${turnaround}d` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.stats?.approval_rate_pct != null ? `${p.stats.approval_rate_pct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {p.stats?.sample_size || 0}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.bdm_name || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEditor(p)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Side-by-side comparison</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value) || 0)}
              className="w-36"
              placeholder="Loan amount"
            />
            <Button
              onClick={runCompare}
              disabled={selected.size < 2 || comparing}
            >
              {comparing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Compare {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {comparison.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Tick 2–5 lenders, enter a loan amount, and click Compare.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparison.map((c) => (
                <Card
                  key={c.lender_key}
                  className={c.lender_key === winner ? 'border-primary/60 bg-primary/5' : ''}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">{c.lender_label}</h4>
                      {c.lender_key === winner && (
                        <Badge className="bg-primary/20 text-primary border-primary/40">
                          <Trophy className="h-3 w-3 mr-1" /> Best fit
                        </Badge>
                      )}
                    </div>
                    <div className="text-3xl font-bold">{c.composite_score}<span className="text-sm text-muted-foreground">/100</span></div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Rate p.a.</p>
                        <p className="font-medium">
                          {c.rate_band_pa != null ? `${Number(c.rate_band_pa).toFixed(2)}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Turnaround</p>
                        <p className="font-medium">
                          {c.effective_turnaround_days != null ? `${c.effective_turnaround_days}d` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Approval rate</p>
                        <p className="font-medium">
                          {c.stats?.approval_rate_pct != null ? `${c.stats.approval_rate_pct}%` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Est. monthly</p>
                        <p className="font-medium">{fmtAUD(c.estimated_monthly_repayment)}</p>
                      </div>
                    </div>
                    {c.rate_notes && (
                      <p className="text-[11px] text-muted-foreground italic">{c.rate_notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editorTarget && (
        <LenderPlaybookEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          lenderKey={editorTarget.key}
          lenderLabel={editorTarget.label}
          initial={editorTarget.initial}
          onSaved={() => { setEditorOpen(false); void load(); }}
        />
      )}
    </div>
  );
}
