/**
 * Finance Portal — Messages tab on a client profile (partner side).
 * Auto-creates a thread for the partner if none exists, then renders the shared thread UI.
 */
import { useEffect, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageSquare } from 'lucide-react';
import { FinanceMessagesThread } from './FinanceMessagesThread';

interface Props {
  clientId: string;
}

export function FinancePortalMessagesPanel({ clientId }: Props) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await invokeFinanceFunction('finance-portal-messages', {
        operation: 'get_or_create_thread',
        client_id: clientId,
      });
      if (cancelled) return;
      if (error || !data?.thread) {
        setError(error?.message || 'Could not open conversation');
      } else {
        setThreadId(data.thread.id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, invokeFinanceFunction]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !threadId) {
    const isSession = /invalid session|session expired|session token required|authentication required/i.test(error || '');
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-3" />
          <p className="text-sm font-medium">
            {isSession ? 'Your session has expired' : 'Conversation unavailable'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {isSession
              ? 'Please sign in again to view this client\'s messages.'
              : (error || 'We couldn\'t load this conversation. Try again in a moment.')}
          </p>
          {isSession && (
            <a href="/finance/login" className="inline-flex items-center text-xs font-medium text-primary hover:underline mt-3">
              Sign in again →
            </a>
          )}
        </CardContent>
      </Card>
    );
  }


  return (
    <FinanceMessagesThread
      threadId={threadId}
      viewerSide="partner"
      invoke={(fn, body) => invokeFinanceFunction(fn, body)}
    />
  );
}
