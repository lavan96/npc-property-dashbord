import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  type: 'report_generated' | 'report_failed' | 'info';
  title: string;
  message: string;
  reportId?: string;
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
      const { error } = await supabase
        .from('notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    if (notification.type === 'report_generated' && notification.reportId) {
      // Store reportId in localStorage for GeneratedReports page to open
      localStorage.setItem('openReportId', notification.reportId);
      navigate('/generated-reports');
    } else if (notification.type === 'report_generated') {
      navigate('/generated-reports');
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
