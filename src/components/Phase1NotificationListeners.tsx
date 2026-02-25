import { useClientReminderNotifications } from '@/hooks/useClientReminderNotifications';
import { useCallAlertNotifications } from '@/hooks/useCallAlertNotifications';
import { useDealDateNotifications } from '@/hooks/useDealDateNotifications';

/**
 * Component that initializes all notification listeners
 * This component doesn't render anything, it just sets up the hooks
 */
export function Phase1NotificationListeners() {
  // Client reminder notifications (due today / overdue)
  useClientReminderNotifications();
  
  // Call alert triggered + missed calls
  useCallAlertNotifications();
  
  // Deal critical date warnings (finance expiry, settlement, build dates)
  useDealDateNotifications();
  
  return null;
}
