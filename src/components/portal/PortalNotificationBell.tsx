import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, Info, AlertTriangle, ArrowRight, Building2, FileText, MessageSquare, BellOff } from 'lucide-react';

interface PortalNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  category: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

const typeIcons: Record<string, React.ElementType> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  action: ArrowRight,
};

const typeStyles: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  action: 'bg-primary/10 text-primary',
};

export function PortalNotificationBell() {
  const { sessionToken } = usePortalAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const result = await invokeSecureFunction('get-portal-client-data', {
        include: { notifications: true },
        portal_session_token: sessionToken,
      });
      if (result?.data?.notifications) {
        setNotifications(result.data.notifications);
      }
    } catch (err) {
      console.error('[PortalNotificationBell] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60 seconds for new notifications
    const interval = setInterval(fetchNotifications, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    if (!sessionToken) return;
    try {
      await invokeSecureFunction('manage-portal-client-data', {
        operation: 'update',
        table: 'client_portal_notifications',
        id,
        data: { is_read: true, read_at: new Date().toISOString() },
        portal_session_token: sessionToken,
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {
      // Silently fail
    }
  };

  const handleClick = (notif: PortalNotification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.action_url) navigate(notif.action_url);
  };

  const recentNotifications = notifications.slice(0, 10);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {recentNotifications.length === 0 ? (
          <div className="py-8 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            {recentNotifications.map((notif) => {
              const TypeIcon = typeIcons[notif.type] || Info;
              const style = typeStyles[notif.type] || typeStyles.info;

              return (
                <DropdownMenuItem
                  key={notif.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer ${!notif.is_read ? 'bg-primary/[0.03]' : ''}`}
                  onClick={() => handleClick(notif)}
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${style}`}>
                    <TypeIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-medium leading-tight truncate ${!notif.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    </div>
                    {notif.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/50 mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-center text-sm text-primary cursor-pointer justify-center py-2"
              onClick={() => navigate('/client/notifications')}
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
