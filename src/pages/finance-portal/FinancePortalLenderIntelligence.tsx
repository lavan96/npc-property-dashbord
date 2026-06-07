import { useEffect, useState, useMemo } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, BookOpen, RefreshCw, Trophy, Scale } from 'lucide-react';

type LiveRate = {
  lender_id: string;
  lender_name: string;
  product_name: string | null;
  rate: number | null;
  comparison_rate: number | null;
  rate_type: string | null;
  loan_purpose: string | null;
  repayment_type: string | null;
  lvr_min: number | null;
  lvr_max: number | null;
  features?: string[];
  last_updated?: string | null;
};

const fmtPct = (n?: number | null, d = 2) =>
  n == null ? '—' : `${Number(n).toFixed(d)}%`;
const fmtAUD = (n?: number | null) =>
  n == null ? '—' : `$${Math.round(Number(n)).toLocaleString('en-AU')}`;

export default function FinancePortalLenderIntelligence() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<LiveRate[]>([]);
  const [lenderSummary, setLenderSummary] = useState<{ lender_id: string; lender_name: string; lowest: number | null; count: number }[]>([]);
  const [loanAmount, setLoanAmount] = useState<number>(700_000);
  const [lvr, setLvr] = useState<number>(80);
  const [purpose, setPurpose] = useState<string>('OWNER_OCCUPIED');
  const [repayment, setRepayment] = useState<string>('PRINCIPAL_AND_INTEREST');
  const [rateType, setRateType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await invokeFinanceFunction(
      'finance-portal-lender-intelligence',
      {
        operation: 'live_rates',
        loan_purpose: purpose,
        repayment_type: repayment,
        rate_type: rateType === 'all' ? '' : rateType,
        lvr,
        loan_amount: loanAmount,
        limit: 200,
      },
    );
    if (error) {
      setLoadError(error.message || 'Unable to load lender intelligence');
      setRates([]);
      setLenderSummary([]);
    } else {
      setLoadError(null);
      setRates(data?.rates || []);
      setLenderSummary(data?.lenders || []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [purpose, repayment, rateType, lvr, loanAmount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(
      (r) =>
        r.lender_name?.toLowerCase().includes(q) ||
        r.product_name?.toLowerCase().includes(q),
    );
  }, [rates, search]);

  const monthly = (rate: number | null) => {
    if (!rate || !loanAmount) return null;
    const r = rate / 100 / 12;
    const n = 30 * 12;
    return Math.round((loanAmount * r) / (1 - Math.pow(1 + r, -n)));
  };

  const best = filtered[0];

  const getRateKey = (rate: LiveRate) =>
    `${rate.lender_id}:${rate.product_name || rate.rate}:${rate.rate_type || ''}`;

  const selectedRates = selectedKeys
    .map((key) => rates.find((rate) => getRateKey(rate) === key))
    .filter((rate): rate is LiveRate => !!rate);

  const toggleSelected = (rate: LiveRate) => {
    const key = getRateKey(rate);
    setSelectedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const isSelected = (rate: LiveRate) => selectedKeys.includes(getRateKey(rate));

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Lender Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Live lender & rate data sourced from the Command Centre. Filter, compare,
            and find the lowest rate for your scenario.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your scenario</CardTitle>
          <CardDescription>Adjust to filter live rates to your client's deal.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Field label="Loan amount">
              <Input
                type="number"
                value={loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="LVR %">
              <Input
                type="number"
                value={lvr}
                onChange={(e) => setLvr(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Purpose">
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER_OCCUPIED">Owner-occupied</SelectItem>
                  <SelectItem value="INVESTMENT">Investment</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Repayment">
              <Select value={repayment} onValueChange={setRepayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRINCIPAL_AND_INTEREST">P&amp;I</SelectItem>
                  <SelectItem value="INTEREST_ONLY">Interest only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rate type">
              <Select value={rateType} onValueChange={setRateType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="VARIABLE">Variable</SelectItem>
                  <SelectItem value="FIXED">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Search lender / product">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Macquarie, Basic Variable"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Lender summary chips */}
      {lenderSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lenderSummary.slice(0, 18).map((l) => (
            <Badge key={l.lender_id} variant="outline" className="text-xs">
              {l.lender_name} · from {fmtPct(l.lowest)} · {l.count} products
            </Badge>
          ))}
        </div>
      )}

      {/* Best-fit hero */}
      {best && !loading && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" /> Best fit for your scenario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Stat label="Lender" value={best.lender_name} />
              <Stat label="Product" value={best.product_name || '—'} />
              <Stat label="Rate p.a." value={fmtPct(best.rate)} />
              <Stat label="Comparison" value={fmtPct(best.comparison_rate)} />
              <Stat label="Est. monthly" value={fmtAUD(monthly(best.rate))} />
            </div>
          </CardContent>
        </Card>
      )}

      {selectedRates.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Selected lender comparison
            </CardTitle>
            <CardDescription>Compare up to three products side-by-side for this scenario.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {selectedRates.map((r) => (
                <Card key={`${r.lender_id}-${r.product_name}`} className="bg-muted/20">
                  <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">{r.lender_name}</div>
                    <div className="text-sm text-muted-foreground line-clamp-2">{r.product_name || '—'}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Stat label="Rate" value={fmtPct(r.rate)} />
                      <Stat label="Comparison" value={fmtPct(r.comparison_rate)} />
                      <Stat label="Monthly" value={fmtAUD(monthly(r.rate))} />
                      <Stat label="LVR" value={`${r.lvr_min ?? 0}-${r.lvr_max ?? 100}%`} />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => toggleSelected(r)} className="w-full">Remove</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loadError && !loading && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-6 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{loadError}. This usually means the lender-intelligence edge function has not been deployed or the Command Centre rate cache is unavailable.</span>
          </CardContent>
        </Card>
      )}

      {/* Rates table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All matching rates ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live rates…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No products match these filters. Try widening LVR, switching rate type,
              or ask an admin to refresh the bank rate cache in the Command Centre.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lender</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate p.a.</TableHead>
                    <TableHead className="text-right">Comparison</TableHead>
                    <TableHead className="text-right">LVR</TableHead>
                    <TableHead className="text-right">Est. monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => (
                    <TableRow key={`${r.lender_id}-${r.product_name}-${i}`}>
                      <TableCell className="font-medium">
                        <div>{r.lender_name}</div>
                        <Button
                          size="sm"
                          variant={isSelected(r) ? 'default' : 'outline'}
                          className="mt-1 h-7 text-[11px]"
                          onClick={() => toggleSelected(r)}
                          disabled={!isSelected(r) && selectedRates.length >= 3}
                        >
                          {isSelected(r) ? 'Selected' : 'Compare'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm">{r.product_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.rate_type || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtPct(r.rate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtPct(r.comparison_rate)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {r.lvr_min != null || r.lvr_max != null
                          ? `${r.lvr_min ?? 0}–${r.lvr_max ?? 95}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtAUD(monthly(r.rate))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Rates are sourced from the Command Centre's bank rate cache (CDR + manual lenders).
        Use the Refresh button in the Command Centre's Lenders page to update the cache.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
