import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { FinancePermissionMatrixEditor, EMPTY_MATRIX, normalizeMatrix, type FinancePermissionMatrix } from './FinancePermissionMatrix';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (matrix: FinancePermissionMatrix) => void;
}

export function DefaultPermissionsDialog({ open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matrix, setMatrix] = useState<FinancePermissionMatrix>(EMPTY_MATRIX);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await invokeSecureFunction('finance-portal-admin', {
          operation: 'get_default_permissions',
        });
        if (error) throw new Error(error.message);
        setMatrix(normalizeMatrix(data?.record?.permissions));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load defaults');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await invokeSecureFunction('finance-portal-admin', {
        operation: 'update_default_permissions',
        permissions: matrix,
      });
      if (error) throw new Error(error.message);
      toast.success('Default permissions saved');
      onSaved?.(matrix);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Default Permission Template</DialogTitle>
          <DialogDescription>
            New client assignments will start with these permissions. Existing assignments are not changed.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <FinancePermissionMatrixEditor matrix={matrix} onChange={setMatrix} disabled={saving} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
