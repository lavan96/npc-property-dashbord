import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

export function useCallNotifications() {
  const { addNotification } = useNotifications();
  const processedCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase
      .channel('call-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vapi_call_logs'
        },
        async (payload) => {
          const call = payload.new as any;
          
          // Skip if already processed or call is still in progress
          if (processedCallIds.current.has(call.id)) return;
          if (call.status === 'in-progress' || call.status === 'ringing' || call.status === 'queued') return;
          
          processedCallIds.current.add(call.id);
          
          const customerName = call.customer_name || call.customer_phone_number || 'Unknown caller';
          const agentName = call.agent_name || 'Voice Agent';
          const duration = call.duration_seconds 
            ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`
            : 'N/A';
          
          const direction = call.direction === 'inbound' ? 'Incoming' : 'Outgoing';
          const intent = call.call_intent ? ` - ${call.call_intent}` : '';
          
          await addNotification({
            type: 'call_completed',
            title: `${direction} Call Ended${intent}`,
            message: `${customerName} with ${agentName} (${duration})`
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vapi_call_logs'
        },
        async (payload) => {
          const call = payload.new as any;
          const oldCall = payload.old as any;
          
          // Only notify when call transitions to ended status
          if (processedCallIds.current.has(call.id)) return;
          if (call.status !== 'ended') return;
          if (oldCall.status === 'ended') return; // Already ended
          
          processedCallIds.current.add(call.id);
          
          const customerName = call.customer_name || call.customer_phone_number || 'Unknown caller';
          const agentName = call.agent_name || 'Voice Agent';
          const duration = call.duration_seconds 
            ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`
            : 'N/A';
          
          const direction = call.direction === 'inbound' ? 'Incoming' : 'Outgoing';
          const intent = call.call_intent ? ` - ${call.call_intent}` : '';
          
          await addNotification({
            type: 'call_completed',
            title: `${direction} Call Ended${intent}`,
            message: `${customerName} with ${agentName} (${duration})`
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addNotification]);
}
