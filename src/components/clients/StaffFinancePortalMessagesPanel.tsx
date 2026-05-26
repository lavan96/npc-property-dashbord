/**
 * Staff-side panel for the FINANCE PORTAL messaging thread.
 * Auto-gets/creates the thread for the client's assigned finance partner,
 * then renders the shared FinanceMessagesThread UI with viewerSide='staff'.
 */
import { useEffect, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageSquare } from 'lucide-react';
import { FinanceMessagesThread } from '@/components/finance-portal/FinanceMessagesThread';

interface Props {
  clientId: string;
}

export function StaffFinancePortalMessagesPanel({ clientId }: Props) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await invokeSecureFunction('finance-portal-messages', {
        operation: 'get_or_create_thread',
        client_id: clientId,
      });
      if (cancelled) return;
      if (error || !data?.thread) {
        setError(error?.message || 'No finance partner assigned to this client yet.');
      } else {
        setThreadId(data.thread.id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !threadId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
          <p className="text-sm text-muted-foreground">{error || 'No finance conversation available'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <FinanceMessagesThread
      threadId={threadId}
      viewerSide="staff"
      invoke={(fn, body) => invokeSecureFunction(fn, body)}
    />
  );
}
