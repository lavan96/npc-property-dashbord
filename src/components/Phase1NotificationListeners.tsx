import { useClientReminderNotifications } from '@/hooks/useClientReminderNotifications';
import { useCallAlertNotifications } from '@/hooks/useCallAlertNotifications';

/**
 * Component that initializes all Phase 1 notification listeners
 * This component doesn't render anything, it just sets up the hooks
 */
export function Phase1NotificationListeners() {
  // Client reminder notifications (due today / overdue)
  useClientReminderNotifications();
  
  // Call alert triggered + missed calls
  useCallAlertNotifications();
  
  return null;
}
