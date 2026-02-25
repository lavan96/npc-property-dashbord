import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 
  | 'report_generated' 
  | 'report_failed' 
  | 'info' 
  | 'call_completed' 
  | 'appointment_created' 
  | 'appointment_rescheduled' 
  | 'appointment_cancelled'
  // Phase 1 additions
  | 'client_reminder_due'
  | 'client_reminder_overdue'
  | 'call_alert_triggered'
  | 'missed_call'
  | 'email_received'
  | 'email_reply_sent'
  // Phase 2 additions - Report Lifecycle
  | 'report_generation_started'
  | 'report_generation_completed'
  | 'report_generation_failed'
  | 'report_regeneration_started'
  | 'report_regeneration_completed'
  | 'report_regeneration_failed'
  | 'report_archived'
  | 'report_restored'
  // Phase 3 additions - Client & Portfolio
  | 'client_created'
  | 'client_updated'
  | 'portfolio_updated'
  | 'vownet_form_uploaded'
  | 'vownet_form_exported'
  | 'finance_agent_notified'
  | 'client_file_shared'
  // Phase 4 additions - System & User
  | 'user_role_updated'
  | 'new_user_invited'
  | 'system_maintenance'
  | 'data_import_complete'
  | 'report_comment_added'
  // Phase 3 additions - Deal Lifecycle
  | 'deal_finance_expiry_warning'
  | 'deal_finance_expiry_overdue'
  | 'deal_settlement_warning'
  | 'deal_settlement_overdue'
  | 'deal_build_date_warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  reportId?: string;
  entityId?: string; // Generic ID for linking to entities (client, reminder, etc.)
  timestamp: Date;
  read: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  handleNotificationClick: (notification: Notification) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const navigate = useNavigate();

  // Load notifications from Supabase on mount
  useEffect(() => {
    fetchNotifications();
    
    // Subscribe to real-time changes
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        () => {
          // Refetch all notifications when any change occurs
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data) {
        const notificationsWithDates = data.map((n: any) => ({
          ...n,
          reportId: n.report_id,
          entityId: n.entity_id,
          timestamp: new Date(n.timestamp)
        }));
        setNotifications(notificationsWithDates);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const addNotification = async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          report_id: notification.reportId || null,
          entity_id: notification.entityId || null,
          read: false
        });

      if (error) throw error;
      // Real-time subscription will handle updating the UI
    } catch (error) {
      console.error('Failed to add notification:', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const clearNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to clear notification:', error);
    }
  };

  const clearAll = async () => {
    try {
      // Delete all notifications where created_at is not null (i.e., all notifications)
      const { error } = await supabase
        .from('notifications')
        .delete()
        .gte('created_at', '1970-01-01');

      if (error) throw error;
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    switch (notification.type) {
      case 'report_generated':
      case 'report_generation_completed':
      case 'report_regeneration_completed':
        if (notification.reportId || notification.entityId) {
          localStorage.setItem('openReportId', notification.reportId || notification.entityId || '');
        }
        navigate('/generated-reports?tab=investment');
        break;
      case 'report_failed':
      case 'report_generation_failed':
      case 'report_regeneration_failed':
      case 'report_generation_started':
      case 'report_regeneration_started':
      case 'report_archived':
      case 'report_restored':
        navigate('/generated-reports?tab=investment');
        break;
      case 'call_completed':
      case 'missed_call':
        navigate('/call-logs');
        break;
      case 'call_alert_triggered':
        navigate('/call-logs');
        break;
      case 'appointment_created':
      case 'appointment_rescheduled':
      case 'appointment_cancelled':
        navigate('/calendar');
        break;
      case 'client_reminder_due':
      case 'client_reminder_overdue':
        if (notification.entityId) {
          navigate(`/clients?highlight=${notification.entityId}`);
        } else {
          navigate('/clients');
        }
        break;
      case 'email_received':
      case 'email_reply_sent':
        navigate('/email-copilot');
        break;
      case 'client_created':
      case 'client_updated':
      case 'portfolio_updated':
      case 'vownet_form_uploaded':
      case 'vownet_form_exported':
      case 'finance_agent_notified':
      case 'client_file_shared':
        if (notification.entityId) {
          navigate(`/clients?highlight=${notification.entityId}`);
        } else {
          navigate('/clients');
        }
        break;
      // Phase 4 - System & User
      case 'user_role_updated':
      case 'new_user_invited':
        navigate('/admin/users');
        break;
      case 'system_maintenance':
        // Just mark as read, no navigation
        break;
      case 'data_import_complete':
        navigate('/data-import');
        break;
      // Deal lifecycle notifications
      case 'deal_finance_expiry_warning':
      case 'deal_finance_expiry_overdue':
      case 'deal_settlement_warning':
      case 'deal_settlement_overdue':
      case 'deal_build_date_warning':
        if (notification.entityId) {
          navigate(`/clients?highlight=${notification.entityId}`);
        } else {
          navigate('/deal-pipeline');
        }
        break;
      case 'report_comment_added':
        if (notification.reportId || notification.entityId) {
          localStorage.setItem('openReportId', notification.reportId || notification.entityId || '');
        }
        navigate('/generated-reports?tab=investment');
        break;
      default:
        break;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAll,
        handleNotificationClick
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
