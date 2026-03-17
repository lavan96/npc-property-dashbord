import { useClientReminderNotifications } from '@/hooks/useClientReminderNotifications';
import { useCallAlertNotifications } from '@/hooks/useCallAlertNotifications';
import { useDealDateNotifications } from '@/hooks/useDealDateNotifications';
import { useReportNotifications } from '@/hooks/useReportNotifications';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';

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
  
  // Report completion / failure (realtime on investment_reports)
  useReportNotifications();
  
  // Appointment events from activity logs (external GHL, Outlook, etc.)
  useAppointmentNotifications();
  
  return null;
}
