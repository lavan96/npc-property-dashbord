import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/contexts/NotificationsContext';

/**
 * Global realtime listener for incoming emails (email_copilot_emails).
 * Unlike useEmailNotifications (which only runs on EmailCopilot page),
 * this runs app-wide to ensure the bell notification always shows new emails.
 */
export function useGlobalEmailNotifications() {
  const { addNotification } = useNotifications();
  const processedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[GlobalEmailNotifications] Setting up realtime subscription');

    const channel = supabase
      .channel('global-email-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_copilot_emails'
        },
        async (payload) => {
          const email = payload.new as any;

          if (processedIds.current.has(email.id)) return;
          processedIds.current.add(email.id);

          // Only notify for received emails, not sent ones
          if (email.folder === 'sentItems' || email.folder === 'drafts') return;

          const senderName = email.sender?.split('<')[0]?.trim() || email.sender?.split('@')[0] || 'Unknown';
          const subject = email.subject || 'No subject';

          console.log('[GlobalEmailNotifications] New email:', email.id);
          await addNotification({
            type: 'email_received',
            title: `Email from ${senderName}`,
            message: subject,
            entityId: email.id
          });
        }
      )
      .subscribe((status) => {
        console.log('[GlobalEmailNotifications] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addNotification]);
}
