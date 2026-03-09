import { useState } from 'react';
import { usePortalNotificationsData, usePortalUpdateData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell, CheckCircle, Info, AlertTriangle, ArrowRight,
  Loader2, BellOff, FileText, Building2, MessageSquare, Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const typeIcons: Record<string, any> = {
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

const categoryIcons: Record<string, any> = {
  deal: Building2,
  document: FileText,
  message: MessageSquare,
  property: Building2,
  general: Bell,
};

export default function PortalNotifications() {
  const { data, isLoading } = usePortalNotificationsData();
  const updateMutation = usePortalUpdateData();
  const [filter, setFilter] = useState('all');

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const filtered = filter === 'all'
    ? notifications
    : filter === 'unread'
      ? notifications.filter((n: any) => !n.is_read)
      : notifications.filter((n: any) => n.category === filter);

  const markAsRead = async (id: string) => {
    try {
      await updateMutation.mutateAsync({
        operation: 'update',
        table: 'client_portal_notifications',
        id,
        data: { is_read: true, read_at: new Date().toISOString() },
      });
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Stay updated on your deals, documents, and account activity
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="default" className="text-sm px-3 py-1">
            {unreadCount} unread
          </Badge>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="w-full flex">
          <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
          <TabsTrigger value="unread" className="flex-1">
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
          <TabsTrigger value="deal" className="flex-1">Deals</TabsTrigger>
          <TabsTrigger value="document" className="flex-1">Documents</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
              <BellOff className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">No notifications yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              You'll see updates about your deals, documents, and account here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((notif: any) => {
                const TypeIcon = typeIcons[notif.type] || Info;
                const CatIcon = categoryIcons[notif.category] || Bell;
                const style = typeStyles[notif.type] || typeStyles.info;

                return (
                  <div
                    key={notif.id}
                    className={`px-5 py-4 transition-colors flex items-start gap-4 ${
                      !notif.is_read ? 'bg-primary/[0.02] hover:bg-primary/[0.04]' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${style}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className={`text-sm font-medium ${!notif.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      {notif.message && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{notif.message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className="text-[10px] capitalize gap-1">
                          <CatIcon className="h-3 w-3" />
                          {notif.category}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground/60">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    {!notif.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => markAsRead(notif.id)}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
