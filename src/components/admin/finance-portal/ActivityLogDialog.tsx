import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  financeUserId?: string | null;
  title?: string;
}

interface LogEntry {
  id: string;
  finance_user_id: string | null;
  client_id: string | null;
  actor_user_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  invite_sent:                    { label: 'Invite Sent',           tone: 'secondary' },
  invite_resent:                  { label: 'Invite Resent',         tone: 'secondary' },
  access_revoked:                 { label: 'Access Revoked',        tone: 'destructive' },
  access_reinstated:              { label: 'Access Reinstated',     tone: 'default' },
  assignment_upserted:            { label: 'Assignment Updated',    tone: 'default' },
  assignment_removed:             { label: 'Assignment Removed',    tone: 'destructive' },
  bulk_auto_linked:               { label: 'Bulk Auto-Linked',      tone: 'secondary' },
  default_permissions_updated:    { label: 'Defaults Updated',      tone: 'outline' },
  login_success:                  { label: 'Login',                 tone: 'default' },
  login_failed:                   { label: 'Login Failed',          tone: 'destructive' },
  logout:                         { label: 'Logout',                tone: 'outline' },
  password_reset:                 { label: 'Password Reset',        tone: 'secondary' },
  invite_accepted:                { label: 'Invite Accepted',       tone: 'default' },
};

export function ActivityLogDialog({ open, onOpenChange, financeUserId, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await invokeSecureFunction('finance-portal-admin', {
          operation: 'get_activity_log',
          finance_user_id: financeUserId || undefined,
          limit: 200,
        });
        if (error) throw new Error(error.message);
        setLogs(data?.records || []);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load activity log');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, financeUserId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title || 'Finance Portal Activity'}</DialogTitle>
          <DialogDescription>
            {financeUserId ? 'Audit trail for this portal user.' : 'Recent activity across all finance portal users.'}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[60vh] border rounded-lg">
            <div className="divide-y">
              {logs.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No activity yet.</div>
              )}
              {logs.map(l => {
                const label = ACTION_LABELS[l.action] || { label: l.action, tone: 'outline' as const };
                return (
                  <div key={l.id} className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={label.tone}>{label.label}</Badge>
                        <span className="text-xs text-muted-foreground capitalize">{l.actor_type}</span>
                      </div>
                      {l.metadata && Object.keys(l.metadata).length > 0 && (
                        <pre className="mt-2 text-[11px] bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(l.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(l.created_at), 'MMM d, HH:mm')}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
