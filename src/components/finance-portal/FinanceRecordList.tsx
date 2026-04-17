import { useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TableKey, FieldConfig } from './financeTableConfig';

interface FinanceRecordListProps {
  tableKey: TableKey;
  clientId: string;
  records: any[];
  fields: FieldConfig[];
  canEdit: boolean;
  canDelete: boolean;
  onMutated: () => void;
}

function formatCurrency(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(v: any): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-AU'); } catch { return String(v); }
}

function displayValue(field: FieldConfig, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'currency') return formatCurrency(value);
  if (field.type === 'date') return formatDate(value);
  if (field.type === 'select' && field.options) {
    const o = field.options.find(opt => opt.value === String(value));
    return o ? o.label : String(value);
  }
  return String(value);
}

function buildEmptyRecord(fields: FieldConfig[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const f of fields) obj[f.key] = '';
  return obj;
}

export function FinanceRecordList({
  tableKey, clientId, records, fields, canEdit, canDelete, onMutated,
}: FinanceRecordListProps) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const { toast } = useToast();

  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState<Record<string, any> | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const summaryFields = fields.filter(f => !f.hideInSummary).slice(0, 4);

  const handleSave = async (payload: Record<string, any>, recordId?: string) => {
    setSubmitting(true);
    // Coerce numeric/currency fields and yes/no
    const cleaned: Record<string, any> = {};
    for (const f of fields) {
      let v = payload[f.key];
      if (v === '' || v === undefined) { cleaned[f.key] = null; continue; }
      if (f.type === 'number' || f.type === 'currency') {
        const n = Number(v);
        cleaned[f.key] = Number.isNaN(n) ? null : n;
      } else if (f.type === 'select' && f.options?.some(o => o.value === 'true' || o.value === 'false')) {
        cleaned[f.key] = v === 'true' || v === true;
      } else {
        cleaned[f.key] = v;
      }
    }

    const op = recordId ? 'update' : 'create';
    const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
      operation: op,
      table: tableKey,
      client_id: clientId,
      record_id: recordId,
      data: cleaned,
    });
    setSubmitting(false);

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: recordId ? 'Updated successfully' : 'Created successfully' });
    setEditing(null);
    setCreating(null);
    onMutated();
  };

  const handleDelete = async (recordId: string) => {
    setSubmitting(true);
    const { error } = await invokeFinanceFunction('finance-portal-client-data', {
      operation: 'delete',
      table: tableKey,
      client_id: clientId,
      record_id: recordId,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    setDeleting(null);
    onMutated();
  };

  const renderForm = (record: Record<string, any>, setRecord: (r: Record<string, any>) => void) => (
    <div className="grid gap-4 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
      {fields.map(f => (
        <div
          key={f.key}
          className={`space-y-1.5 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}
        >
          <Label htmlFor={`field-${f.key}`}>
            {f.label}{f.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {f.type === 'textarea' ? (
            <Textarea
              id={`field-${f.key}`}
              value={record[f.key] ?? ''}
              onChange={(e) => setRecord({ ...record, [f.key]: e.target.value })}
              rows={3}
              placeholder={f.placeholder}
            />
          ) : f.type === 'select' && f.options ? (
            <Select
              value={record[f.key] != null ? String(record[f.key]) : ''}
              onValueChange={(v) => setRecord({ ...record, [f.key]: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {f.options.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`field-${f.key}`}
              type={
                f.type === 'currency' || f.type === 'number' ? 'number'
                  : f.type === 'date' ? 'date'
                    : f.type === 'email' ? 'email'
                      : f.type === 'tel' ? 'tel'
                        : 'text'
              }
              value={record[f.key] ?? ''}
              onChange={(e) => setRecord({ ...record, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              step={f.type === 'currency' || f.type === 'number' ? 'any' : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(buildEmptyRecord(fields))}>
            <Plus className="h-4 w-4 mr-2" />Add new
          </Button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
          No records yet.
          {canEdit && ' Click "Add new" above to create the first one.'}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="flex items-start justify-between gap-3 p-3 border rounded-md hover:bg-muted/30 transition-colors">
              <div className="min-w-0 flex-1 grid gap-1">
                {summaryFields.map(f => {
                  const val = displayValue(f, r[f.key]);
                  if (f.primary) {
                    return (
                      <div key={f.key} className="font-medium truncate">{val}</div>
                    );
                  }
                  if (f.secondary) {
                    return (
                      <div key={f.key} className="text-sm text-muted-foreground truncate">{val}</div>
                    );
                  }
                  return (
                    <div key={f.key} className="text-xs text-muted-foreground truncate">
                      <span className="font-medium">{f.label}:</span> {val}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setViewing(r)} title="View details">
                  <Eye className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ ...r })} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(r)} title="Delete" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {viewing && fields.map(f => (
              <div key={f.key} className="grid grid-cols-3 gap-2 py-1.5 border-b last:border-0">
                <div className="text-xs text-muted-foreground font-medium">{f.label}</div>
                <div className="col-span-2 text-sm break-words">{displayValue(f, viewing[f.key])}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add new record</DialogTitle>
            <DialogDescription>Fill in the fields below and save.</DialogDescription>
          </DialogHeader>
          {creating && renderForm(creating, setCreating)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => creating && handleSave(creating)} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit record</DialogTitle>
            <DialogDescription>Update the fields below and save changes.</DialogDescription>
          </DialogHeader>
          {editing && renderForm(editing, setEditing)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={() => editing && handleSave(editing, editing.id)} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDelete(deleting.id)}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
