import { useClientReminderNotifications } from '@/hooks/useClientReminderNotifications';
import { useCallAlertNotifications } from '@/hooks/useCallAlertNotifications';
import { useDealDateNotifications } from '@/hooks/useDealDateNotifications';
import { useReportNotifications } from '@/hooks/useReportNotifications';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';
import { usePortalReportRequestNotifications } from '@/hooks/usePortalReportRequestNotifications';
import { useAgreementNotifications } from '@/hooks/useAgreementNotifications';
import { useGHLContactNotifications } from '@/hooks/useGHLContactNotifications';
import { useMarketingLeadNotifications } from '@/hooks/useMarketingLeadNotifications';
// useGlobalEmailNotifications removed — email notifications are now created server-side
// in outlook-email-sync and outlook-email-webhook edge functions

/**
 * Component that initializes all notification listeners
 * This component doesn't render anything, it just sets up the hooks
 */
export function Phase1NotificationListeners() {
  // Client reminder notifications (due today / overdue / upcoming tomorrow)
  useClientReminderNotifications();
  
  // Call alert triggered + missed calls
  useCallAlertNotifications();
  
  // Deal critical date warnings (finance expiry, settlement, build dates)
  useDealDateNotifications();
  
  // Report completion / failure (realtime on investment_reports)
  useReportNotifications();
  
  // Appointment events from activity logs (external GHL, Outlook, etc.)
  useAppointmentNotifications();

  // Portal report requests from clients
  usePortalReportRequestNotifications();

  // Agency agreement generation
  useAgreementNotifications();

  // New GHL contacts synced
  useGHLContactNotifications();

  // Marketing leads (UTM/Meta attributed)
  useMarketingLeadNotifications();

  // Global email notifications (all pages, not just EmailCopilot)
  useGlobalEmailNotifications();
  
  return null;
}
