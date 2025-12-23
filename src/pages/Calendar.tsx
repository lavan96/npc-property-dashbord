import { useEffect, useState, useMemo } from 'react';
import type { DragEvent } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Users, Filter, RefreshCw, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGHLCalendar, GHLEvent } from '@/hooks/useGHLCalendar';
import { EventDetailsModal } from '@/components/calendar/EventDetailsModal';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, addWeeks, subWeeks, getHours, setHours, setMinutes, differenceInMinutes, addMinutes } from 'date-fns';

export default function Calendar() {
  const { calendars, events, isLoading, isUpdating, error, fetchCalendarData, rescheduleEvent, getCalendarColor } = useGHLCalendar();
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedEvent, setSelectedEvent] = useState<GHLEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<GHLEvent | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: Date; hour?: number } | null>(null);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const filteredEvents = useMemo(() => {
    if (selectedCalendarId === 'all') return events;
    return events.filter(event => event.calendarId === selectedCalendarId);
  }, [events, selectedCalendarId]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return filteredEvents.filter(event => 
      isSameDay(parseISO(event.startTime), selectedDate)
    );
  }, [filteredEvents, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents
      .filter(event => parseISO(event.startTime) >= now)
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
      .slice(0, 10);
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
    return filteredEvents.filter(event => isSameDay(parseISO(event.startTime), day));
  };

  const getEventsForDayAndHour = (day: Date, hour: number) => {
    return filteredEvents.filter(event => {
      const eventStart = parseISO(event.startTime);
      return isSameDay(eventStart, day) && getHours(eventStart) === hour;
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

  const getCalendarTypeIcon = (calendarType: string) => {
    switch (calendarType) {
      case 'round_robin': return <Users className="h-3 w-3" />;
      case 'personal': return <CalendarIcon className="h-3 w-3" />;
      default: return <CalendarIcon className="h-3 w-3" />;
    }
  };

  const handleEventClick = (event: GHLEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, event: GHLEvent) => {
    e.dataTransfer.setData('text/plain', event.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedEvent(event);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, day: Date, hour?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ day, hour });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, day: Date, hour?: number) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedEvent) return;

    const originalStart = parseISO(draggedEvent.startTime);
    const originalEnd = parseISO(draggedEvent.endTime);
    const durationMinutes = differenceInMinutes(originalEnd, originalStart);

    let newStart: Date;
    if (hour !== undefined) {
      // Week view - drop on specific hour
      newStart = setMinutes(setHours(day, hour), originalStart.getMinutes());
    } else {
      // Month view - keep same time, change day
      newStart = setMinutes(setHours(day, getHours(originalStart)), originalStart.getMinutes());
    }
    const newEnd = addMinutes(newStart, durationMinutes);

    // Call API to reschedule
    await rescheduleEvent(
      draggedEvent.id,
      newStart.toISOString(),
      newEnd.toISOString()
    );

    setDraggedEvent(null);
  };

  // Get event style with calendar color
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
            <Button onClick={() => fetchCalendarData()} variant="outline">
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
      {/* Event Details Modal */}
      <EventDetailsModal 
        event={selectedEvent}
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        getStatusColor={getStatusColor}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">GoHighLevel Appointments & Schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as 'month' | 'week')}>
            <TabsList className="h-9">
              <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
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
            onClick={() => fetchCalendarData()}
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
                  : `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
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
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map(day => {
                    const dayEvents = getEventsForDay(day);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isDropping = dropTarget && isSameDay(day, dropTarget.day) && dropTarget.hour === undefined;
                    
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        onDragOver={(e) => handleDragOver(e, day)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day)}
                        className={`
                          min-h-[80px] p-1 rounded-md border text-left transition-colors cursor-pointer
                          ${isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/50'}
                          ${!isCurrentMonth ? 'opacity-40' : ''}
                          ${isToday(day) ? 'ring-1 ring-primary' : ''}
                          ${isDropping ? 'bg-primary/20 border-primary border-dashed' : ''}
                        `}
                      >
                        <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-primary' : ''}`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(event => (
                            <div 
                              key={event.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, event)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(event);
                              }}
                              style={getEventStyle(event)}
                              className="text-[10px] truncate px-1 py-0.5 rounded cursor-grab active:cursor-grabbing hover:opacity-80 flex items-center gap-0.5"
                            >
                              <GripVertical className="h-2 w-2 opacity-50 shrink-0" />
                              {format(parseISO(event.startTime), 'HH:mm')}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Week View */
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
                  {/* Time grid */}
                  <div className="relative">
                    {weekHours.map(hour => (
                      <div key={hour} className="grid grid-cols-8 gap-1 border-t border-border/50">
                        <div className="text-[10px] text-muted-foreground py-1 w-16 text-right pr-2">
                          {format(new Date().setHours(hour, 0), 'h a')}
                        </div>
                        {weekDays.map(day => {
                          const hourEvents = getEventsForDayAndHour(day, hour);
                          const isDropping = dropTarget && isSameDay(day, dropTarget.day) && dropTarget.hour === hour;
                          return (
                            <div 
                              key={`${day.toISOString()}-${hour}`}
                              onDragOver={(e) => handleDragOver(e, day, hour)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, day, hour)}
                              className={`min-h-[48px] border-l border-border/30 px-1 py-0.5 transition-colors ${isDropping ? 'bg-primary/20' : ''}`}
                            >
                              {hourEvents.map(event => (
                                <div
                                  key={event.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, event)}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => handleEventClick(event)}
                                  style={getEventStyle(event)}
                                  className="w-full text-left text-[10px] px-1 py-0.5 rounded mb-0.5 truncate cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity"
                                >
                                  <div className="font-medium truncate flex items-center gap-0.5">
                                    <GripVertical className="h-2 w-2 opacity-50 shrink-0" />
                                    {event.title || 'Event'}
                                  </div>
                                  <div className="opacity-75">{format(parseISO(event.startTime), 'h:mm a')}</div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Selected Day Events / Upcoming Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Upcoming Events'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {(selectedDate ? selectedDateEvents : upcomingEvents).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No events {selectedDate ? 'on this day' : 'upcoming'}</p>
                    </div>
                  ) : (
                    (selectedDate ? selectedDateEvents : upcomingEvents).map(event => (
                      <EventCard 
                        key={event.id} 
                        event={event} 
                        getStatusColor={getStatusColor}
                        onClick={() => handleEventClick(event)}
                      />
                    ))
                  )}
                </div>
              )}
            </ScrollArea>
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
          {format(parseISO(event.startTime), 'MMM d, HH:mm')} - {format(parseISO(event.endTime), 'HH:mm')}
        </div>
      </div>
      {event.notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{event.notes}</p>
      )}
    </button>
  );
}
