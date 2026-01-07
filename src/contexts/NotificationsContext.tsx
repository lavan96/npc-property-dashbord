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
  | 'email_reply_sent';

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
        if (notification.reportId) {
          localStorage.setItem('openReportId', notification.reportId);
        }
        navigate('/generated-reports');
        break;
      case 'report_failed':
        navigate('/generated-reports');
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
