import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Send, Plus, Trash2, CheckCircle2, ShieldCheck, AlertCircle, Clock, FileCheck,
  Sparkles, Loader2, FileText, Eye, EyeOff, Package, ScanLine, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LenderPacketDialog } from './LenderPacketDialog';


const CATEGORY_LABEL: Record<string, string> = {
  identity: 'Identity',
  income_payg: 'Income — PAYG',
  income_self_employed: 'Income — Self-employed',
  bank_statements: 'Bank statements',
  existing_loans: 'Existing loans',
  assets: 'Assets',
  liabilities: 'Liabilities',
  purchase_docs: 'Purchase documents',
  deposit_proof: 'Deposit proof',
  valuation: 'Valuation',
  loan_approval: 'Loan approval',
  settlement: 'Settlement',
  other: 'Other',
};

const CATEGORY_ORDER = [
  'identity','income_payg','income_self_employed','bank_statements','existing_loans',
  'assets','liabilities','purchase_docs','deposit_proof','valuation','loan_approval','settlement','other',
];

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  required:   { label: 'Required',  tone: 'bg-muted text-muted-foreground', icon: Clock },
  requested:  { label: 'Requested', tone: 'bg-amber-500/15 text-amber-500',  icon: Send },
  uploaded:   { label: 'Uploaded',  tone: 'bg-sky-500/15 text-sky-500',      icon: FileCheck },
  verified:   { label: 'Verified',  tone: 'bg-emerald-500/15 text-emerald-500', icon: ShieldCheck },
  waived:     { label: 'Waived',    tone: 'bg-muted text-muted-foreground',  icon: AlertCircle },
  expired:    { label: 'Expired',   tone: 'bg-destructive/15 text-destructive', icon: AlertCircle },
};

const OWNER_LABEL: Record<string, string> = {
  client: 'Client',
  finance_partner: 'Finance partner',
  npc_team: 'NPC team',
  legal: 'Legal',
  other: 'Other',
};

interface Props {
  fileId: string;
  purchaseType: string;
}

export function DocumentsTab({ fileId, purchaseType }: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requestOpen, setRequestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [packetOpen, setPacketOpen] = useState(false);
  const [rerequestFor, setRerequestFor] = useState<any | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const { data: requirements, isLoading } = useQuery({
    queryKey: ['finance-portal-doc-requirements', fileId],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-document-requirements', {
        operation: 'list_requirements', purchase_file_id: fileId,
      });
      if (error) throw new Error(error.message);
      return (data?.requirements || []) as any[];
    },
  });

  const { data: messageTemplates } = useQuery({
    queryKey: ['finance-portal-doc-msg-templates'],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-document-requirements', {
        operation: 'list_message_templates',
      });
      if (error) throw new Error(error.message);
      return (data?.templates || []) as any[];
    },
  });


  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance-portal-doc-requirements', fileId] });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of requirements || []) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return CATEGORY_ORDER
      .filter(c => map.has(c))
      .map(c => ({ category: c, items: map.get(c)!.sort((a, b) => a.sort_order - b.sort_order) }));
  }, [requirements]);

  const stats = useMemo(() => {
    const list = requirements || [];
    const total = list.length;
    const verified = list.filter(r => r.status === 'verified').length;
    const requested = list.filter(r => r.status === 'requested').length;
    const outstanding = list.filter(r => r.is_required && !['verified','uploaded','waived'].includes(r.status)).length;
    return { total, verified, requested, outstanding };
  }, [requirements]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllInCategory = (items: any[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(i => on ? next.add(i.id) : next.delete(i.id));
      return next;
    });
  };

  const handleInstantiate = async () => {
    setBusy(true);
    try {
      const { data, error } = await invokeFinanceFunction('finance-portal-document-requirements', {
        operation: 'instantiate_from_template', purchase_file_id: fileId,
      });
      if (error) throw new Error(error.message);
      toast.success(`Seeded ${data?.inserted || 0} default requirements`);
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to seed');
    } finally { setBusy(false); }
  };

  const handleRequest = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { error } = await invokeFinanceFunction('finance-portal-document-requirements', {
        operation: 'request_from_client',
        purchase_file_id: fileId,
        requirement_ids: Array.from(selected),
        message: requestMessage || null,
      });
      if (error) throw new Error(error.message);
      toast.success(`Requested ${selected.size} item(s) from client`);
      setSelected(new Set());
      setRequestMessage('');
      setRequestOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message || 'Request failed');
    } finally { setBusy(false); }
  };

  const setStatus = async (reqId: string, status: string) => {
    const { error } = await invokeFinanceFunction('finance-portal-document-requirements', {
      operation: 'set_status', requirement_id: reqId, status,
    });
    if (error) return toast.error(error.message);
    refresh();
  };

  const toggleVerify = async (req: any) => {
    const { error } = await invokeFinanceFunction('finance-portal-document-requirements', {
      operation: 'verify_requirement',
      requirement_id: req.id,
      unverify: req.status === 'verified',
    });
    if (error) return toast.error(error.message);
    refresh();
  };

  const removeReq = async (reqId: string) => {
    const { error } = await invokeFinanceFunction('finance-portal-document-requirements', {
      operation: 'delete_requirement', requirement_id: reqId,
    });
    if (error) return toast.error(error.message);
    setSelected(prev => { const n = new Set(prev); n.delete(reqId); return n; });
    refresh();
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Loading checklist…</div>;
  }

  if ((requirements || []).length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <div>
            <p className="font-medium">No document checklist yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Seed this file with the standard checklist for {purchaseType.replace(/_/g, ' ')}, then tailor as needed.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={handleInstantiate} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Seed default checklist
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add custom item
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-5 text-sm">
              <Stat label="Total" value={stats.total} />
              <Stat label="Outstanding" value={stats.outstanding} tone="text-amber-500" />
              <Stat label="Requested" value={stats.requested} tone="text-sky-500" />
              <Stat label="Verified" value={stats.verified} tone="text-emerald-500" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleInstantiate} disabled={busy} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Add missing defaults
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Custom item
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0}
                onClick={() => setRequestOpen(true)}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" /> Request {selected.size > 0 ? `${selected.size} ` : ''}from client
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {grouped.map(({ category, items }) => {
        const allSelected = items.every(i => selected.has(i.id));
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {CATEGORY_LABEL[category] || category}
                  <Badge variant="secondary" className="ml-1">{items.length}</Badge>
                </CardTitle>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => selectAllInCategory(items, !allSelected)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map(req => {
                const meta = STATUS_META[req.status] || STATUS_META.required;
                const Icon = meta.icon;
                return (
                  <div
                    key={req.id}
                    className={cn(
                      'rounded-lg border p-3 flex items-start gap-3 transition-colors',
                      selected.has(req.id) && 'border-primary/40 bg-primary/5',
                    )}
                  >
                    <Checkbox
                      checked={selected.has(req.id)}
                      onCheckedChange={() => toggleSelect(req.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-medium text-sm leading-tight">
                            {req.label}
                            {!req.is_required && (
                              <Badge variant="outline" className="ml-2 text-[10px]">Optional</Badge>
                            )}
                          </p>
                          {req.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded', meta.tone)}>
                              <Icon className="h-3 w-3" /> {meta.label}
                            </span>
                            <span>· {OWNER_LABEL[req.owner] || req.owner}</span>
                            {req.requested_at && (
                              <span>· Requested {new Date(req.requested_at).toLocaleDateString('en-AU')}</span>
                            )}
                            {req.expiry_date && (
                              <span>· Expires {new Date(req.expiry_date).toLocaleDateString('en-AU')}</span>
                            )}
                            {req.visible_to_client ? (
                              <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" /> Client</span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5"><EyeOff className="h-3 w-3" /> Internal</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Select value={req.status} onValueChange={(v) => setStatus(req.id, v)}>
                            <SelectTrigger className="h-8 w-[125px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_META).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={req.status === 'verified' ? 'Unverify' : 'Mark verified'}
                            onClick={() => toggleVerify(req)}
                          >
                            {req.status === 'verified'
                              ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              : <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeReq(req.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {req.finance_portal_documents && (
                        <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs flex items-center gap-1.5">
                          <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="truncate">{req.finance_portal_documents.original_filename}</span>
                        </div>
                      )}
                      {req.request_message && req.status === 'requested' && (
                        <p className="mt-2 text-xs italic text-muted-foreground border-l-2 border-amber-500/40 pl-2">
                          "{req.request_message}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Request dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request documents from client</DialogTitle>
            <DialogDescription>
              {selected.size} item(s) will be marked Requested and surfaced on the client portal dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="msg">Message to client (optional)</Label>
            <Textarea
              id="msg"
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder="e.g. Please upload by Friday — needed for finance approval."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button onClick={handleRequest} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCustomDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fileId={fileId}
        onAdded={refresh}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold leading-none', tone)}>{value}</span>
    </div>
  );
}

function AddCustomDialog({
  open, onOpenChange, fileId, onAdded,
}: { open: boolean; onOpenChange: (v: boolean) => void; fileId: string; onAdded: () => void }) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [owner, setOwner] = useState('client');
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) return toast.error('Label required');
    setBusy(true);
    try {
      const { error } = await invokeFinanceFunction('finance-portal-document-requirements', {
        operation: 'add_requirement',
        purchase_file_id: fileId,
        payload: {
          label: label.trim(),
          description: description.trim() || null,
          category, owner,
          is_required: required,
          sort_order: 999,
        },
      });
      if (error) throw new Error(error.message);
      toast.success('Added');
      setLabel(''); setDescription(''); setCategory('other'); setOwner('client'); setRequired(true);
      onOpenChange(false);
      onAdded();
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom requirement</DialogTitle>
          <DialogDescription>Add an item that isn't in the default checklist.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rl">Label</Label>
            <Input id="rl" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. ATO portal screenshot" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rd">Description</Label>
            <Textarea id="rd" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OWNER_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
            Required
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add requirement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
