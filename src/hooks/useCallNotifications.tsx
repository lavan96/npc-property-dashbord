import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

export function useCallNotifications() {
  const { addNotification } = useNotifications();
  const processedCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[CallNotifications] Setting up realtime subscription for vapi_call_logs');
    
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
          console.log('[CallNotifications] INSERT received:', payload);
          const call = payload.new as any;
          
          // Skip if already processed or call is still in progress
          if (processedCallIds.current.has(call.id)) {
            console.log('[CallNotifications] Call already processed:', call.id);
            return;
          }
          
          // Use correct column name: call_status (not status)
          if (call.call_status === 'in-progress' || call.call_status === 'ringing' || call.call_status === 'queued') {
            console.log('[CallNotifications] Call still in progress, skipping:', call.call_status);
            return;
          }
          
          processedCallIds.current.add(call.id);
          
          const customerName = call.customer_name || call.phone_number || 'Unknown caller';
          const agentName = call.agent_name || 'Voice Agent';
          const duration = call.duration_seconds 
            ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`
            : 'N/A';
          
          const direction = call.call_direction === 'inbound' ? 'Incoming' : 'Outgoing';
          const intent = call.call_intent ? ` - ${call.call_intent}` : '';
          
          console.log('[CallNotifications] Adding notification for call:', call.id);
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
          console.log('[CallNotifications] UPDATE received:', payload);
          const call = payload.new as any;
          const oldCall = payload.old as any;
          
          // Only notify when call transitions to ended status
          if (processedCallIds.current.has(call.id)) {
            console.log('[CallNotifications] Call already processed:', call.id);
            return;
          }
          
          // Use correct column name: call_status (not status)
          if (call.call_status !== 'ended') {
            console.log('[CallNotifications] Call not ended yet:', call.call_status);
            return;
          }
          
          if (oldCall.call_status === 'ended') {
            console.log('[CallNotifications] Call was already ended');
            return;
          }
          
          processedCallIds.current.add(call.id);
          
          const customerName = call.customer_name || call.phone_number || 'Unknown caller';
          const agentName = call.agent_name || 'Voice Agent';
          const duration = call.duration_seconds 
            ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`
            : 'N/A';
          
          const direction = call.call_direction === 'inbound' ? 'Incoming' : 'Outgoing';
          const intent = call.call_intent ? ` - ${call.call_intent}` : '';
          
          console.log('[CallNotifications] Adding notification for updated call:', call.id);
          await addNotification({
            type: 'call_completed',
            title: `${direction} Call Ended${intent}`,
            message: `${customerName} with ${agentName} (${duration})`
          });
        }
      )
      .subscribe((status) => {
        console.log('[CallNotifications] Subscription status:', status);
      });

    return () => {
      console.log('[CallNotifications] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [addNotification]);
}
