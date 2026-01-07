import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

/**
 * Hook that monitors call alert history and missed calls
 * Triggers notifications for:
 * - Call alert rules that have been triggered
 * - Missed incoming calls
 */
export function useCallAlertNotifications() {
  const { addNotification } = useNotifications();
  const processedAlertIds = useRef<Set<string>>(new Set());
  const processedMissedCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[CallAlertNotifications] Setting up realtime subscriptions');

    // Subscribe to call_alert_history for triggered alerts
    const alertChannel = supabase
      .channel('call-alert-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_alert_history'
        },
        async (payload) => {
          console.log('[CallAlertNotifications] Alert triggered:', payload);
          const alert = payload.new as any;

          if (processedAlertIds.current.has(alert.id)) {
            return;
          }

          processedAlertIds.current.add(alert.id);

          await addNotification({
            type: 'call_alert_triggered',
            title: `Alert: ${alert.rule_name}`,
            message: alert.message || 'A call alert rule was triggered',
            entityId: alert.call_id
          });
        }
      )
      .subscribe((status) => {
        console.log('[CallAlertNotifications] Alert subscription status:', status);
      });

    // Subscribe to vapi_call_logs for missed calls
    const missedCallChannel = supabase
      .channel('missed-call-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vapi_call_logs'
        },
        async (payload) => {
          const call = payload.new as any;

          // Check if it's a missed call (inbound + short duration or no-answer status)
          const isMissed = 
            call.call_direction === 'inbound' && 
            (call.call_status === 'no-answer' || 
             call.call_status === 'missed' ||
             (call.call_status === 'ended' && call.duration_seconds !== null && call.duration_seconds < 5));

          if (!isMissed) {
            return;
          }

          if (processedMissedCallIds.current.has(call.id)) {
            return;
          }

          processedMissedCallIds.current.add(call.id);

          const customerName = call.customer_name || call.phone_number || 'Unknown caller';
          
          console.log('[CallAlertNotifications] Missed call detected:', call.id);
          await addNotification({
            type: 'missed_call',
            title: 'Missed Call',
            message: `Missed call from ${customerName}`,
            entityId: call.id
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

          // Check if call just transitioned to missed/no-answer
          if (oldCall.call_status === call.call_status) {
            return;
          }

          const isMissed = 
            call.call_direction === 'inbound' && 
            (call.call_status === 'no-answer' || call.call_status === 'missed');

          if (!isMissed) {
            return;
          }

          if (processedMissedCallIds.current.has(call.id)) {
            return;
          }

          processedMissedCallIds.current.add(call.id);

          const customerName = call.customer_name || call.phone_number || 'Unknown caller';
          
          console.log('[CallAlertNotifications] Missed call (update) detected:', call.id);
          await addNotification({
            type: 'missed_call',
            title: 'Missed Call',
            message: `Missed call from ${customerName}`,
            entityId: call.id
          });
        }
      )
      .subscribe((status) => {
        console.log('[CallAlertNotifications] Missed call subscription status:', status);
      });

    return () => {
      console.log('[CallAlertNotifications] Cleaning up subscriptions');
      supabase.removeChannel(alertChannel);
      supabase.removeChannel(missedCallChannel);
    };
  }, [addNotification]);
}
