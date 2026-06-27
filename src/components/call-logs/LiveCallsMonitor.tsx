import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSecureCallLogs } from '@/hooks/useSecureCallLogs';
import { callLogBadgeTone } from './badgeStyles';
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
import { cn } from '@/lib/utils';

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

const livePanel =
  'relative h-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950/95 via-zinc-900/80 to-black/90 shadow-2xl shadow-black/30';
const liveControl =
  'rounded-full border border-white/10 bg-black/35 text-zinc-100 shadow-inner shadow-black/25 transition-all hover:border-emerald-300/35 hover:bg-emerald-300/10 hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const liveCallCard =
  'group relative cursor-default overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-950/95 via-zinc-900/80 to-black/90 p-4 shadow-sm shadow-black/25 transition-all duration-300 before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-r-full before:bg-gradient-to-b before:from-transparent before:via-emerald-300/0 before:to-transparent hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-emerald-400/5 hover:shadow-xl hover:shadow-emerald-500/10 hover:before:via-emerald-300/90';

const getLiveStatusTone = (status: string | null) => {
  if (status === 'in-progress') return 'border-l-emerald-400/70';
  if (status === 'ringing') return 'border-l-amber-300/70 hover:border-amber-300/45 hover:shadow-amber-500/10 hover:before:via-amber-300/90';
  if (status === 'queued') return 'border-l-sky-300/70 hover:border-sky-300/45 hover:shadow-sky-500/10 hover:before:via-sky-300/90';
  return 'border-l-zinc-500/60';
};

export const LiveCallsMonitor = () => {
  const { fetchLiveCalls: fetchLiveCallsSecure } = useSecureCallLogs();
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
      const { data, error } = await fetchLiveCallsSecure();

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
          <Badge className={callLogBadgeTone('success', 'animate-pulse')}>
            <Activity className="w-3 h-3 mr-1" />
            In Progress
          </Badge>
        );
      case 'ringing':
        return (
          <Badge className={callLogBadgeTone('warning', 'animate-pulse')}>
            <Phone className="w-3 h-3 mr-1 animate-bounce" />
            Ringing
          </Badge>
        );
      case 'queued':
        return (
          <Badge className={callLogBadgeTone('info')}>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Queued
          </Badge>
        );
      default:
        return <Badge variant="outline" className={callLogBadgeTone('neutral')}>{status}</Badge>;
    }
  };

  return (
    <Card className={livePanel}>
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/55 to-transparent" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
      <CardHeader className="relative border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(90deg,rgba(24,24,27,0.92),rgba(0,0,0,0.72),rgba(8,47,73,0.16))] pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)] animate-pulse" />
              Realtime Voice Ops
            </div>
            <CardTitle className="flex items-center gap-3 text-xl text-zinc-50 md:text-2xl">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-500/10 text-emerald-200 shadow-inner shadow-emerald-950/30">
                <Radio className="w-4 h-4 text-emerald-300 relative z-10" />
              {/* Outer pulse ring */}
                <span className="absolute w-7 h-7 bg-emerald-500/20 rounded-full animate-ping" />
              {/* Middle pulse ring */}
                <span className="absolute w-6 h-6 bg-emerald-500/30 rounded-full animate-pulse" />
              {/* Inner glow */}
                <span className="absolute w-5 h-5 bg-emerald-500/30 rounded-full" />
              {/* Dot indicator */}
                <span className="absolute right-1.5 top-1.5 w-2 h-2 bg-emerald-300 rounded-full animate-pulse shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
              </div>
              Live Calls
            </CardTitle>
            <p className="mt-2 text-sm text-zinc-400">Monitor active, ringing, and queued voice-agent sessions in real time.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={callLogBadgeTone('neutral', 'font-mono')}>
              {liveCalls.length} active
            </Badge>
            <Button variant="ghost" size="icon" onClick={fetchLiveCalls} className={cn("h-9 w-9", liveControl)}>
              <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/30 px-6 py-12 text-center shadow-inner shadow-black/30">
            <div className="mb-4 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-emerald-200 shadow-lg shadow-emerald-500/10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <p className="font-semibold text-zinc-100">Syncing live monitor...</p>
            <p className="mt-1 text-sm text-zinc-500">Checking active voice sessions.</p>
          </div>
        ) : liveCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/30 px-6 py-12 text-center shadow-inner shadow-black/30">
            <div className="p-4 rounded-2xl border border-zinc-400/20 bg-zinc-400/10 mb-4">
              <Phone className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="font-semibold text-zinc-100">No active calls</p>
            <p className="text-sm text-zinc-500 mt-1">
              Live calls will appear here in real-time
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[430px] pr-3 [scrollbar-color:rgba(16,185,129,0.45)_rgba(0,0,0,0.35)] [scrollbar-width:thin]">
            <div className="space-y-3">
              {liveCalls.map((call) => (
                <div key={call.id} className={cn(liveCallCard, 'border-l-4', getLiveStatusTone(call.call_status))}>
                  <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={cn(
                        'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-inner',
                        call.call_direction === 'inbound'
                          ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-300'
                          : 'border-sky-300/25 bg-sky-500/10 text-sky-300'
                      )}>
                        <span className={cn(
                          'absolute right-2 top-2 h-2 w-2 rounded-full shadow-[0_0_10px_currentColor]',
                          call.call_status === 'in-progress' ? 'bg-emerald-300 animate-pulse' : call.call_status === 'ringing' ? 'bg-amber-300 animate-pulse' : 'bg-sky-300'
                        )} />
                        {call.call_direction === 'inbound' ? (
                          <PhoneIncoming className="h-5 w-5" />
                        ) : (
                          <PhoneOutgoing className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-semibold text-zinc-50">
                            {call.customer_name || call.phone_number || 'Unknown Caller'}
                          </span>
                          <Badge className={call.call_direction === 'inbound' ? callLogBadgeTone('success') : callLogBadgeTone('info')}>
                            {call.call_direction || 'unknown'}
                          </Badge>
                        {call.is_squad_call && (
                          <Badge className={callLogBadgeTone('squad')}>
                            <Users className="w-3 h-3 mr-1" />
                            Squad
                          </Badge>
                        )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1">
                            <User className="w-3 h-3 text-zinc-500" />
                            {call.agent_name || 'Unknown Agent'}
                          </div>
                          {call.squad_name && (
                            <div className="flex items-center gap-1 rounded-full border border-purple-300/20 bg-purple-400/10 px-2.5 py-1 text-purple-200">
                              <Zap className="w-3 h-3" />
                              {call.squad_name}
                            </div>
                          )}
                        </div>

                        {call.call_intent && (
                          <Badge variant="secondary" className={callLogBadgeTone('info', 'capitalize')}>
                            {call.call_intent.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </Badge>
                        )}
                      </div>
                    </div>

                      <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 md:flex-col md:items-end">
                        {getStatusBadge(call.call_status)}
                        <div className="flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 font-mono text-sm text-emerald-200 shadow-sm shadow-emerald-500/10">
                          <Clock className="w-3 h-3 text-emerald-300" />
                          <span className="font-semibold">
                            {getCallDuration(call.started_at)}
                          </span>
                        </div>
                        {call.started_at && (
                          <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-xs text-zinc-400">
                            Started {format(new Date(call.started_at), 'h:mm a')}
                          </span>
                        )}
                      </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
