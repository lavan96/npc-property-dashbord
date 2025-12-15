import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  Radio, 
  Clock, 
  User,
  Users,
  Loader2,
  Activity,
  Zap
} from 'lucide-react';
import { format, differenceInSeconds } from 'date-fns';

interface LiveCall {
  id: string;
  vapi_call_id: string;
  agent_name: string | null;
  phone_number: string | null;
  customer_name: string | null;
  call_direction: string | null;
  call_status: string | null;
  started_at: string | null;
  is_squad_call: boolean | null;
  squad_name: string | null;
  call_intent: string | null;
}

export const LiveCallsMonitor = () => {
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchLiveCalls();

    // Set up realtime subscription for live calls
    const channel = supabase
      .channel('live-calls-monitor')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'vapi_call_logs',
          filter: 'call_status=in.in-progress,ringing,queued'
        },
        (payload) => {
          console.log('Live call update:', payload);
          fetchLiveCalls();
        }
      )
      .subscribe();

    // Update timer every second
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    // Refresh live calls every 10 seconds
    const refreshInterval = setInterval(fetchLiveCalls, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
      clearInterval(refreshInterval);
    };
  }, []);

  const fetchLiveCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('vapi_call_logs')
        .select('id, vapi_call_id, agent_name, phone_number, customer_name, call_direction, call_status, started_at, is_squad_call, squad_name, call_intent')
        .in('call_status', ['in-progress', 'ringing', 'queued'])
        .order('started_at', { ascending: false });

      if (error) throw error;
      setLiveCalls(data || []);
    } catch (error) {
      console.error('Error fetching live calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCallDuration = (startedAt: string | null) => {
    if (!startedAt) return '00:00';
    const seconds = differenceInSeconds(new Date(), new Date(startedAt));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'in-progress':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse">
            <Activity className="w-3 h-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'ringing':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">
            <Phone className="w-3 h-3 mr-1 animate-bounce" />
            Ringing
          </Badge>
        );
      case 'queued':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Queued
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <Radio className="w-4 h-4 text-emerald-500" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            </div>
            Live Calls
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {liveCalls.length} active
            </Badge>
            <Button variant="ghost" size="icon" onClick={fetchLiveCalls} className="h-8 w-8">
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {liveCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Phone className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No active calls</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Live calls will appear here in real-time
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {liveCalls.map((call) => (
                <Card key={call.id} className="border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-500/5 to-transparent">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {call.call_direction === 'inbound' ? (
                            <PhoneIncoming className="w-4 h-4 text-green-500" />
                          ) : (
                            <PhoneOutgoing className="w-4 h-4 text-blue-500" />
                          )}
                          <span className="font-medium">
                            {call.customer_name || call.phone_number || 'Unknown Caller'}
                          </span>
                          {call.is_squad_call && (
                            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              Squad
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {call.agent_name || 'Unknown Agent'}
                          </div>
                          {call.squad_name && (
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {call.squad_name}
                            </div>
                          )}
                        </div>

                        {call.call_intent && (
                          <Badge variant="secondary" className="text-xs">
                            {call.call_intent.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(call.call_status)}
                        <div className="flex items-center gap-1 text-sm font-mono">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-emerald-500 font-semibold">
                            {getCallDuration(call.started_at)}
                          </span>
                        </div>
                        {call.started_at && (
                          <span className="text-xs text-muted-foreground">
                            Started {format(new Date(call.started_at), 'h:mm a')}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
