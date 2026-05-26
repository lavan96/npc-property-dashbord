import { useEffect, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenderKey: string;
  lenderLabel: string;
  initial?: any;
  onSaved: () => void;
}

export function LenderPlaybookEditorDialog({
  open, onOpenChange, lenderKey, lenderLabel, initial, onSaved,
}: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) {
      setForm({
        lender_label: initial?.lender_label || lenderLabel,
        quirks: initial?.quirks || '',
        document_rules: initial?.document_rules || '',
        bdm_name: initial?.bdm_name || '',
        bdm_email: initial?.bdm_email || '',
        bdm_phone: initial?.bdm_phone || '',
        typical_turnaround_days_override: initial?.typical_turnaround_days_override ?? '',
        rate_band_pa: initial?.rate_band_pa ?? '',
        rate_notes: initial?.rate_notes || '',
      });
    }
  }, [open, initial, lenderLabel]);

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await invokeFinanceFunction(
      'finance-portal-lender-intelligence',
      {
        operation: 'upsert_playbook',
        payload: {
          ...form,
          lender_key: lenderKey,
          typical_turnaround_days_override:
            form.typical_turnaround_days_override === ''
              ? null
              : Number(form.typical_turnaround_days_override),
          rate_band_pa:
            form.rate_band_pa === '' ? null : Number(form.rate_band_pa),
        },
      },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Save failed');
      return;
    }
    toast.success('Playbook saved');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lender Playbook — {lenderLabel}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Typical turnaround (days, override)</Label>
              <Input
                type="number"
                value={form.typical_turnaround_days_override}
                onChange={(e) => update('typical_turnaround_days_override', e.target.value)}
                placeholder="Auto-calculated if blank"
              />
            </div>
            <div>
              <Label>Rate band (% p.a.)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.rate_band_pa}
                onChange={(e) => update('rate_band_pa', e.target.value)}
                placeholder="e.g. 6.24"
              />
            </div>
          </div>

          <div>
            <Label>Rate notes</Label>
            <Input
              value={form.rate_notes}
              onChange={(e) => update('rate_notes', e.target.value)}
              placeholder="e.g. P&I 80% LVR owner-occupier"
            />
          </div>

          <div>
            <Label>Quirks / policy notes</Label>
            <Textarea
              rows={4}
              value={form.quirks}
              onChange={(e) => update('quirks', e.target.value)}
              placeholder="Anything your team needs to remember before submitting…"
            />
          </div>

          <div>
            <Label>Document rules</Label>
            <Textarea
              rows={3}
              value={form.document_rules}
              onChange={(e) => update('document_rules', e.target.value)}
              placeholder="e.g. Wants 2 latest payslips + 3 months bank statements"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>BDM name</Label>
              <Input
                value={form.bdm_name}
                onChange={(e) => update('bdm_name', e.target.value)}
              />
            </div>
            <div>
              <Label>BDM email</Label>
              <Input
                value={form.bdm_email}
                onChange={(e) => update('bdm_email', e.target.value)}
              />
            </div>
            <div>
              <Label>BDM phone</Label>
              <Input
                value={form.bdm_phone}
                onChange={(e) => update('bdm_phone', e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save playbook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
