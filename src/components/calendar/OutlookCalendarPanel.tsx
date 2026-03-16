import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, Users, Clock, RefreshCw, Settings, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { OutlookEvent, OutlookTeamMember } from '@/hooks/useOutlookCalendar';
import { format, parseISO } from 'date-fns';

interface OutlookCalendarPanelProps {
  outlookEvents: OutlookEvent[];
  teamAvailability: OutlookTeamMember[];
  isLoading: boolean;
  isCreating: boolean;
  outlookEnabled: boolean;
  microsoftEmail: string | null;
  onRefresh: () => void;
  onFetchTeam: () => void;
  onCreateEvent: (payload: {
    subject: string;
    startTime: string;
    endTime: string;
    body?: string;
    attendees?: string[];
    reminderMinutes?: number;
  }) => Promise<any>;
  onDeleteEvent: (eventId: string) => Promise<boolean>;
  onSetMicrosoftEmail: (email: string | null) => Promise<boolean>;
  onGetMicrosoftEmail: () => Promise<string | null>;
  outlookVisible: boolean;
  onToggleOutlookVisible: () => void;
  selectedDate?: Date | null;
}

export function OutlookCalendarPanel({
  outlookEvents,
  teamAvailability,
  isLoading,
  isCreating,
  outlookEnabled,
  microsoftEmail,
  onRefresh,
  onFetchTeam,
  onCreateEvent,
  onDeleteEvent,
  onSetMicrosoftEmail,
  onGetMicrosoftEmail,
  outlookVisible,
  onToggleOutlookVisible,
  selectedDate,
}: OutlookCalendarPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [showTeam, setShowTeam] = useState(false);

  useEffect(() => {
    onGetMicrosoftEmail().then(email => {
      if (email) setEmailInput(email);
    });
  }, []);

  // Set default times when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      setNewStartTime(`${dateStr}T09:00`);
      setNewEndTime(`${dateStr}T09:30`);
    }
  }, [selectedDate]);

  const handleSaveEmail = async () => {
    const trimmed = emailInput.trim();
    const success = await onSetMicrosoftEmail(trimmed || null);
    if (success) {
      setShowSettings(false);
      if (trimmed) onRefresh();
    }
  };

  const handleCreateEvent = async () => {
    if (!newSubject || !newStartTime || !newEndTime) return;
    await onCreateEvent({
      subject: newSubject,
      startTime: new Date(newStartTime).toISOString(),
      endTime: new Date(newEndTime).toISOString(),
    });
    setNewSubject('');
    setShowQuickCreate(false);
  };

  const dayEvents = selectedDate
    ? outlookEvents.filter(e => {
        if (!e.startTime) return false;
        try {
          const d = parseISO(e.startTime);
          return format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
        } catch { return false; }
      })
    : outlookEvents;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#0078d4]" />
          Outlook Calendar
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <Card className="p-3 space-y-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">Your Microsoft 365 email:</p>
          <div className="flex gap-2">
            <Input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="user@npcservices.com.au"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8" onClick={handleSaveEmail}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            This links your Outlook calendar. Events will appear as an overlay on the calendar.
          </p>
        </Card>
      )}

      {/* Status & Toggle */}
      <Card className="p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn('w-3 h-3 rounded-full', microsoftEmail ? 'bg-[#0078d4]' : 'bg-muted-foreground/30')}
            />
            <span className="text-xs">
              {microsoftEmail ? (
                <>
                  <span className="text-muted-foreground">Connected: </span>
                  <span className="font-medium">{microsoftEmail}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Not configured — set email above</span>
              )}
            </span>
          </div>
          {microsoftEmail && (
            <Switch
              checked={outlookVisible}
              onCheckedChange={onToggleOutlookVisible}
            />
          )}
        </div>
        {microsoftEmail && (
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className="text-xs" style={{ borderColor: '#0078d4', color: '#0078d4' }}>
              {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}{selectedDate ? ' today' : ''}
            </Badge>
          </div>
        )}
      </Card>

      {/* Quick Create */}
      {microsoftEmail && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => setShowQuickCreate(!showQuickCreate)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Internal Event
          </Button>

          {showQuickCreate && (
            <Card className="p-3 mt-2 space-y-2 bg-muted/30">
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Event title (e.g. Prep: John Smith)"
                className="h-8 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="datetime-local"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="datetime-local"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={handleCreateEvent}
                disabled={isCreating || !newSubject}
              >
                {isCreating ? 'Creating...' : 'Create on Outlook'}
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* Team Availability */}
      {microsoftEmail && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => { setShowTeam(!showTeam); if (!showTeam) onFetchTeam(); }}
          >
            <Users className="h-3 w-3 mr-1" />
            Team Availability
          </Button>

          {showTeam && teamAvailability.length > 0 && (
            <Card className="p-3 mt-2 bg-muted/30">
              <ScrollArea className="h-[150px]">
                <div className="space-y-2">
                  {teamAvailability.map(member => (
                    <div key={member.userId} className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[120px]">{member.username}</span>
                      <div className="flex items-center gap-1">
                        {member.busySlots.length === 0 ? (
                          <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">Free</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                            {member.busySlots.length} busy
                          </Badge>
                        )}
                        {member.error && (
                          <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Error</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </div>
      )}

      <Separator />

      {/* Event List */}
      {outlookVisible && microsoftEmail && (
        <ScrollArea className="h-[250px]">
          <div className="space-y-1.5 pr-2">
            {dayEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {isLoading ? 'Loading Outlook events...' : 'No Outlook events'}
              </p>
            ) : (
              dayEvents.map(event => (
                <div
                  key={event.id}
                  className="p-2 rounded-md border bg-[#0078d4]/5 border-[#0078d4]/20 hover:bg-[#0078d4]/10 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{event.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {event.startTime ? format(parseISO(event.startTime), 'h:mm a') : '—'}
                          {' – '}
                          {event.endTime ? format(parseISO(event.endTime), 'h:mm a') : '—'}
                        </span>
                      </div>
                      {event.location && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{event.location}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={() => onDeleteEvent(event.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
