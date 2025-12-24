import { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Users, Filter, RefreshCw, GripVertical, LayoutList, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useGHLCalendar, GHLEvent } from '@/hooks/useGHLCalendar';
import { EventDetailsModal } from '@/components/calendar/EventDetailsModal';
import { CalendarSearchDropdown } from '@/components/calendar/CalendarSearchDropdown';
import { TimelineView } from '@/components/calendar/TimelineView';
import { DraggableEvent } from '@/components/calendar/DraggableEvent';
import { DropZone } from '@/components/calendar/DropZone';
import { EventHoverPreview } from '@/components/calendar/EventHoverPreview';
import { AvailabilitySlots } from '@/components/calendar/AvailabilitySlots';
import { EventTemplates } from '@/components/calendar/EventTemplates';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, addWeeks, subWeeks, getHours, addHours, differenceInMilliseconds, addMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

// Module-level helper functions for date parsing/formatting
const safeParseISO = (value: string | undefined | null): Date | null => {
  try {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;

    // Handle numeric timestamps that arrive as strings
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = n < 1_000_000_000_000 ? n * 1000 : n;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = parseISO(trimmed);
    if (!Number.isNaN(d.getTime())) return d;

    const fallbackMs = Date.parse(trimmed);
    if (!Number.isNaN(fallbackMs)) return new Date(fallbackMs);

    return null;
  } catch {
    return null;
  }
};

const safeFormatISO = (value: string | undefined | null, fmt: string): string => {
  const d = value ? safeParseISO(value) : null;
  return d ? format(d, fmt) : '—';
};

export default function Calendar() {
  const { calendars, events, contactCache, isLoading, isUpdating, error, fetchCalendarData, fetchContact, getCalendarColor, rescheduleEvent, createAppointment } = useGHLCalendar();
  const [sidebarTab, setSidebarTab] = useState<'events' | 'availability' | 'templates'>('events');
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [view, setView] = useState<'month' | 'week' | 'timeline'>('month');
  const [selectedEvent, setSelectedEvent] = useState<GHLEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggingEvent, setDraggingEvent] = useState<GHLEvent | null>(null);
  const [viewTransition, setViewTransition] = useState<'enter' | 'exit' | null>(null);
  const { toast } = useToast();

  // Handle view transitions with animation
  const handleViewChange = useCallback((newView: 'month' | 'week' | 'timeline') => {
    if (newView === view) return;
    setViewTransition('exit');
    setTimeout(() => {
      setView(newView);
      setViewTransition('enter');
      setTimeout(() => setViewTransition(null), 300);
    }, 150);
  }, [view]);

  const getVisibleRange = () => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(currentMonth));
      const end = endOfWeek(endOfMonth(currentMonth));
      return { start, end };
    }

    const start = startOfWeek(currentWeek);
    const end = endOfWeek(currentWeek);
    return { start, end };
  };

  useEffect(() => {
    const { start, end } = getVisibleRange();
    fetchCalendarData(start.toISOString(), end.toISOString());
  }, [fetchCalendarData, view, currentMonth, currentWeek]);

  // Handle drag-and-drop rescheduling
  const handleEventDrop = useCallback(async (event: GHLEvent, targetDate: Date, targetHour?: number) => {
    const originalStart = safeParseISO(event.startTime);
    const originalEnd = safeParseISO(event.endTime);
    
    if (!originalStart || !originalEnd) {
      toast({
        title: 'Cannot reschedule',
        description: 'Event has invalid time data.',
        variant: 'destructive',
      });
      return;
    }

    // Calculate duration
    const duration = differenceInMilliseconds(originalEnd, originalStart);

    // Build new start time
    let newStart: Date;
    if (targetHour !== undefined) {
      // Dropping on a specific hour (week view or timeline)
      newStart = new Date(targetDate);
      newStart.setHours(targetHour, 0, 0, 0);
    } else {
      // Dropping on a date (month view) - preserve original time
      newStart = new Date(targetDate);
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
    }

    const newEnd = new Date(newStart.getTime() + duration);

    // Check if actually moved
    if (newStart.getTime() === originalStart.getTime()) {
      return; // No change
    }

    const result = await rescheduleEvent(
      event.id,
      newStart.toISOString(),
      newEnd.toISOString(),
      event.startTime,
      event.endTime
    );

    if (result.success) {
      toast({
        title: 'Event rescheduled',
        description: `Moved to ${format(newStart, 'MMM d, h:mm a')}`,
        action: result.undo ? (
          <Button variant="outline" size="sm" onClick={() => result.undo?.()}>
            Undo
          </Button>
        ) : undefined,
      });
    }
  }, [rescheduleEvent, toast]);

  const toSearchable = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (selectedCalendarId !== 'all') {
      filtered = filtered.filter((event) => event.calendarId === selectedCalendarId);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          toSearchable(event.title).includes(query) ||
          toSearchable(event.notes).includes(query) ||
          toSearchable(event.address).includes(query)
      );
    }

    return filtered;
  }, [events, selectedCalendarId, searchQuery]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return filteredEvents.filter((event) => {
      const d = safeParseISO(event.startTime);
      return d ? isSameDay(d, selectedDate) : false;
    });
  }, [filteredEvents, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents
      .map((e) => ({ e, d: safeParseISO(e.startTime) }))
      .filter((x) => x.d && x.d >= now)
      .sort((a, b) => a.d!.getTime() - b.d!.getTime())
      .slice(0, 10)
      .map((x) => x.e);
  }, [filteredEvents]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentWeek);
    const weekEnd = endOfWeek(currentWeek);
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentWeek]);

  const weekHours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter((event) => {
      const d = safeParseISO(event.startTime);
      return d ? isSameDay(d, day) : false;
    });
  };

  const getEventsForDayAndHour = (day: Date, hour: number) => {
    return filteredEvents.filter((event) => {
      const eventStart = safeParseISO(event.startTime);
      return eventStart ? isSameDay(eventStart, day) && getHours(eventStart) === hour : false;
    });
  };

  const getStatusColor = (status: string, appointmentStatus?: string) => {
    const effectiveStatus = appointmentStatus || status;
    switch (effectiveStatus?.toLowerCase()) {
      case 'confirmed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'booked': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'showed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'noshow': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'cancelled': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handleEventClick = (event: GHLEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  const getEventStyle = (event: GHLEvent) => {
    const color = event.calendarColor || getCalendarColor(event.calendarId);
    return {
      backgroundColor: `${color}20`,
      borderLeft: `3px solid ${color}`,
      color: color,
    };
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">GoHighLevel Calendar Integration</p>
        </div>
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button
              onClick={() => {
                const { start, end } = getVisibleRange();
                fetchCalendarData(start.toISOString(), end.toISOString());
              }}
              variant="outline"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Event Details Modal (Read-Only) */}
      <EventDetailsModal 
        event={selectedEvent}
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        getStatusColor={getStatusColor}
        fetchContact={fetchContact}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            GoHighLevel Appointments
            {isUpdating && <span className="text-xs text-primary animate-pulse">(Updating...)</span>}
            <GripVertical className="h-3 w-3 ml-2 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/70">Drag events to reschedule</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarSearchDropdown
            events={events}
            contactCache={contactCache}
            fetchContact={fetchContact}
            onSelectEvent={(event) => {
              setSelectedEvent(event);
              setEventModalOpen(true);
            }}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
          <Tabs value={view} onValueChange={(v) => handleViewChange(v as 'month' | 'week' | 'timeline')}>
            <TabsList className="h-9">
              <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs flex items-center gap-1">
                <LayoutList className="h-3 w-3" />
                Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
            <SelectTrigger className="w-[220px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Calendars" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Calendars</SelectItem>
              {calendars.map(cal => (
                <SelectItem key={cal.id} value={cal.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cal.eventColor || '#3b82f6' }}
                    />
                    <span className="truncate max-w-[160px]">{cal.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              const { start, end } = getVisibleRange();
              fetchCalendarData(start.toISOString(), end.toISOString());
            }}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{calendars.length}</div>
            <p className="text-xs text-muted-foreground">Calendars</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{filteredEvents.length}</div>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-400">
              {filteredEvents.filter(e => e.appointmentStatus === 'confirmed' || e.appointmentStatus === 'showed').length}
            </div>
            <p className="text-xs text-muted-foreground">Confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-400">{upcomingEvents.length}</div>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Legend */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <span className="text-xs font-medium text-muted-foreground">Calendars:</span>
          {calendars.map(calendar => (
            <button
              key={calendar.id}
              onClick={() => setSelectedCalendarId(calendar.id === selectedCalendarId ? 'all' : calendar.id)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors ${
                selectedCalendarId === calendar.id 
                  ? 'bg-primary/20 ring-1 ring-primary' 
                  : selectedCalendarId === 'all' 
                    ? 'bg-muted/50 hover:bg-muted' 
                    : 'opacity-40 hover:opacity-100'
              }`}
            >
              <span 
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: calendar.eventColor || '#3b82f6' }}
              />
              <span className="truncate max-w-[120px]">{calendar.name}</span>
            </button>
          ))}
          {selectedCalendarId !== 'all' && (
            <button
              onClick={() => setSelectedCalendarId('all')}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Show all
            </button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {view === 'month' 
                  ? format(currentMonth, 'MMMM yyyy')
                  : view === 'week'
                    ? `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
                    : selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Timeline'
                }
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => view === 'month' 
                    ? setCurrentMonth(subMonths(currentMonth, 1))
                    : setCurrentWeek(subWeeks(currentWeek, 1))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    setCurrentMonth(today);
                    setCurrentWeek(today);
                    setSelectedDate(today);
                  }}
                >
                  Today
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => view === 'month'
                    ? setCurrentMonth(addMonths(currentMonth, 1))
                    : setCurrentWeek(addWeeks(currentWeek, 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Animation wrapper */}
            <div
              className={cn(
                'transition-all duration-300 ease-out',
                viewTransition === 'exit' && 'opacity-0 scale-95 translate-y-2',
                viewTransition === 'enter' && 'animate-fade-in',
                !viewTransition && 'opacity-100'
              )}
            >
              {isLoading ? (
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : view === 'month' ? (
                <>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  {/* Calendar grid with DropZones */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map(day => {
                      const dayEvents = getEventsForDay(day);
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      
                      return (
                        <DropZone
                          key={day.toISOString()}
                          date={day}
                          onDrop={handleEventDrop}
                          disabled={isUpdating}
                          className={cn(
                            'min-h-[80px] p-1 rounded-md border text-left transition-colors cursor-pointer',
                            isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/50',
                            !isCurrentMonth && 'opacity-40',
                            isToday(day) && 'ring-1 ring-primary'
                          )}
                        >
                          <div 
                            onClick={() => setSelectedDate(day)}
                            className="h-full"
                          >
                            <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-primary' : ''}`}>
                              {format(day, 'd')}
                            </div>
                            <div className="space-y-0.5">
                              {dayEvents.slice(0, 3).map(event => (
                                <EventHoverPreview
                                  key={event.id}
                                  event={event}
                                  getStatusColor={getStatusColor}
                                  fetchContact={fetchContact}
                                  contactCache={contactCache}
                                  onViewDetails={() => handleEventClick(event)}
                                >
                                  <DraggableEvent 
                                    event={event}
                                    disabled={isUpdating}
                                    onDragStart={setDraggingEvent}
                                    onDragEnd={() => setDraggingEvent(null)}
                                  >
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEventClick(event);
                                      }}
                                      style={getEventStyle(event)}
                                      className="text-[10px] truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-80"
                                    >
                                      {safeFormatISO(event.startTime, 'HH:mm')}
                                    </div>
                                  </DraggableEvent>
                                </EventHoverPreview>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="text-[10px] text-muted-foreground px-1">
                                  +{dayEvents.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        </DropZone>
                      );
                    })}
                  </div>
                </>
              ) : view === 'week' ? (
                /* Week View with Drag and Drop */
                <ScrollArea className="h-[600px]">
                  <div className="min-w-[700px]">
                    {/* Week day headers */}
                    <div className="grid grid-cols-8 gap-1 mb-1 sticky top-0 bg-background z-10 pb-2">
                      <div className="text-xs font-medium text-muted-foreground py-2 w-16"></div>
                      {weekDays.map(day => (
                        <div 
                          key={day.toISOString()} 
                          className={`text-center text-xs font-medium py-2 ${isToday(day) ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                          <div>{format(day, 'EEE')}</div>
                          <div className={`text-lg font-bold ${isToday(day) ? 'bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}`}>
                            {format(day, 'd')}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Time grid with DropZones */}
                    <div className="relative">
                      {weekHours.map(hour => (
                        <div key={hour} className="grid grid-cols-8 gap-1 border-t border-border/50">
                          <div className="text-[10px] text-muted-foreground py-1 w-16 text-right pr-2">
                            {format(new Date().setHours(hour, 0), 'h a')}
                          </div>
                          {weekDays.map(day => {
                            const hourEvents = getEventsForDayAndHour(day, hour);
                            return (
                              <DropZone 
                                key={`${day.toISOString()}-${hour}`}
                                date={day}
                                hour={hour}
                                onDrop={handleEventDrop}
                                disabled={isUpdating}
                                className="min-h-[48px] border-l border-border/30 px-1 py-0.5"
                              >
                                {hourEvents.map(event => (
                                  <DraggableEvent
                                    key={event.id}
                                    event={event}
                                    disabled={isUpdating}
                                    onDragStart={setDraggingEvent}
                                    onDragEnd={() => setDraggingEvent(null)}
                                  >
                                    <div
                                      onClick={() => handleEventClick(event)}
                                      style={getEventStyle(event)}
                                      className="w-full text-left text-[10px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                      <div className="font-medium truncate">
                                        {event.title || 'Event'}
                                      </div>
                                      <div className="opacity-75">{safeFormatISO(event.startTime, 'h:mm a')}</div>
                                    </div>
                                  </DraggableEvent>
                                ))}
                              </DropZone>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                /* Timeline View */
                <TimelineView
                  selectedDate={selectedDate || new Date()}
                  events={filteredEvents}
                  onEventClick={handleEventClick}
                  onEventDrop={handleEventDrop}
                  getEventStyle={getEventStyle}
                  isUpdating={isUpdating}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar Panel with Tabs */}
        <Card>
          <CardHeader className="pb-2">
            <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as any)}>
              <TabsList className="w-full grid grid-cols-3 h-8">
                <TabsTrigger value="events" className="text-xs">Events</TabsTrigger>
                <TabsTrigger value="availability" className="text-xs">Slots</TabsTrigger>
                <TabsTrigger value="templates" className="text-xs flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Quick
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-3">
            {sidebarTab === 'events' && (
              <div>
                <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Upcoming'}
                </h4>
                <ScrollArea className="h-[380px]">
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (selectedDate ? selectedDateEvents : upcomingEvents).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No events {selectedDate ? 'on this day' : 'upcoming'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(selectedDate ? selectedDateEvents : upcomingEvents).map(event => (
                        <EventCard 
                          key={event.id} 
                          event={event} 
                          getStatusColor={getStatusColor}
                          onClick={() => handleEventClick(event)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
            {sidebarTab === 'availability' && selectedDate && (
              <AvailabilitySlots
                selectedDate={selectedDate}
                events={filteredEvents}
                onSlotClick={(start, end) => {
                  setSidebarTab('templates');
                }}
              />
            )}
            {sidebarTab === 'templates' && (
              <EventTemplates
                calendars={calendars}
                selectedDate={selectedDate || undefined}
                onCreateAppointment={createAppointment}
                isUpdating={isUpdating}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calendars List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Available Calendars ({calendars.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {calendars.map(calendar => (
                <button
                  key={calendar.id}
                  onClick={() => setSelectedCalendarId(calendar.id === selectedCalendarId ? 'all' : calendar.id)}
                  className={`
                    p-3 rounded-lg border text-left transition-all
                    ${selectedCalendarId === calendar.id 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: calendar.eventColor || '#3b82f6' }}
                        />
                        <span className="font-medium text-sm truncate">{calendar.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {calendar.calendarType.replace('_', ' ')}
                        </Badge>
                        {calendar.isActive && (
                          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                    {calendar.teamMembers && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {calendar.teamMembers}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventCard({ 
  event, 
  getStatusColor,
  onClick
}: { 
  event: GHLEvent; 
  getStatusColor: (status: string, appointmentStatus?: string) => string;
  onClick: () => void;
}) {
  const color = event.calendarColor || '#3b82f6';
  
  return (
    <button 
      onClick={onClick}
      className="w-full p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors text-left"
      style={{ borderLeftWidth: '4px', borderLeftColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{event.title || 'Untitled Event'}</p>
          {event.calendarName && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <span 
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {event.calendarName}
            </p>
          )}
        </div>
        <Badge className={`text-[10px] shrink-0 ${getStatusColor(event.status, event.appointmentStatus)}`}>
          {event.appointmentStatus || event.status}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {safeFormatISO(event.startTime, 'MMM d, HH:mm')} - {safeFormatISO(event.endTime, 'HH:mm')}
        </div>
      </div>
      {event.notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{event.notes}</p>
      )}
    </button>
  );
}
