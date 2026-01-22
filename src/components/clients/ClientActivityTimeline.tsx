import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, 
  FileUp, 
  Bell, 
  CheckCircle, 
  Tag, 
  Building2, 
  Activity,
  Phone,
  Mail,
  Users,
  Settings,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

interface ClientActivityTimelineProps {
  clientId: string;
}

const activityIcons: Record<string, any> = {
  note_added: MessageSquare,
  file_uploaded: FileUp,
  reminder_created: Bell,
  reminder_completed: CheckCircle,
  tag_added: Tag,
  tag_removed: Tag,
  property_added: Building2,
  property_updated: Building2,
  score_updated: Activity,
  contact_made: Phone,
  meeting: Users,
  email_sent: Mail,
  status_changed: Settings,
  custom: Activity,
};

const activityColors: Record<string, string> = {
  note_added: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  file_uploaded: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  reminder_created: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  reminder_completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  tag_added: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  tag_removed: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  property_added: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  property_updated: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  score_updated: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  contact_made: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  meeting: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  email_sent: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  status_changed: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  custom: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
};

/**
 * Helper to get session token
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

/**
 * Secure fetch for activities data with fallback
 */
async function fetchActivitiesSecure(clientId: string) {
  const sessionToken = getSessionToken();
  
  // Try secure Edge Function first
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('get-client-data', {
        body: {
          session_token: sessionToken,
          clientId,
          include: { activities: true },
        },
      });

      if (!error && data?.success) {
        return data.data?.activities || [];
      }
    } catch (err) {
      console.warn('Secure activities fetch failed, falling back:', err);
    }
  }

  // Fallback: Direct Supabase query
  const { data, error } = await supabase
    .from('client_activities')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export function ClientActivityTimeline({ clientId }: ClientActivityTimelineProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['client-activities', clientId],
    queryFn: () => fetchActivitiesSecure(clientId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No activity recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  // Group activities by date
  const groupedActivities: Record<string, typeof activities> = {};
  activities.forEach((activity: any) => {
    const dateKey = format(new Date(activity.created_at), 'yyyy-MM-dd');
    if (!groupedActivities[dateKey]) {
      groupedActivities[dateKey] = [];
    }
    groupedActivities[dateKey].push(activity);
  });

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-6 pr-4">
        {Object.entries(groupedActivities).map(([dateKey, dateActivities]) => (
          <div key={dateKey}>
            <div className="sticky top-0 bg-background py-2">
              <Badge variant="outline" className="text-xs">
                {format(new Date(dateKey), 'EEEE, MMMM d, yyyy')}
              </Badge>
            </div>
            <div className="space-y-0 mt-2 relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              
              {dateActivities.map((activity: any) => {
                const Icon = activityIcons[activity.activity_type] || Activity;
                const colorClass = activityColors[activity.activity_type] || activityColors.custom;
                
                return (
                  <div key={activity.id} className="relative pl-10 pb-4">
                    {/* Timeline dot */}
                    <div className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center ${colorClass}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    
                    <Card className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{activity.title}</p>
                            {activity.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {activity.description}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(activity.created_at), 'h:mm a')}
                          </span>
                        </div>
                        
                        {/* Activity metadata */}
                        {activity.metadata && Object.keys(activity.metadata as object).length > 0 && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(activity.metadata as Record<string, any>).slice(0, 3).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {String(value)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
