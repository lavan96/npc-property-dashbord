import { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Users, Filter, RefreshCw, GripVertical, LayoutList, Zap, Flame, BarChart3, TrendingUp, AlertTriangle, Sparkles, Plus, Layers, Repeat, Bell, X, PanelLeftClose, PanelLeft, Menu, Mail } from 'lucide-react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GHLExportDialog } from '@/components/shared/GHLExportDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useGHLCalendar, GHLEvent } from '@/hooks/useGHLCalendar';
import { useCalendarKeyboard } from '@/hooks/useCalendarKeyboard';
import { EventDetailsModal } from '@/components/calendar/EventDetailsModal';
import { CalendarSearchDropdown } from '@/components/calendar/CalendarSearchDropdown';
import { TimelineView } from '@/components/calendar/TimelineView';
import { DraggableEvent } from '@/components/calendar/DraggableEvent';
import { DropZone } from '@/components/calendar/DropZone';
import { AvailabilitySlots } from '@/components/calendar/AvailabilitySlots';
import { EventTemplates } from '@/components/calendar/EventTemplates';
import { CalendarHeatmap } from '@/components/calendar/CalendarHeatmap';
import { TimeAllocationDashboard } from '@/components/calendar/TimeAllocationDashboard';
import { WeeklySummaryCards } from '@/components/calendar/WeeklySummaryCards';
import { ConflictDetection } from '@/components/calendar/ConflictDetection';
import { ResourceOptimization } from '@/components/calendar/ResourceOptimization';
import { QuickAddAppointmentModal } from '@/components/calendar/QuickAddAppointmentModal';
import { MultiCalendarOverlay } from '@/components/calendar/MultiCalendarOverlay';
import { RecurringPatterns } from '@/components/calendar/RecurringPatterns';
import { SmartReminders } from '@/components/calendar/SmartReminders';
import { MiniCalendarNavigator } from '@/components/calendar/MiniCalendarNavigator';
import { EnhancedEventPreview } from '@/components/calendar/EnhancedEventPreview';
import { FloatingActions } from '@/components/calendar/FloatingActions';
import { KeyboardShortcutsHint } from '@/components/calendar/KeyboardShortcutsHint';
import { CalendarLoadingSkeleton, StatsLoadingSkeleton, SidebarLoadingSkeleton } from '@/components/calendar/CalendarLoadingSkeleton';
import { BatchActions } from '@/components/calendar/BatchActions';
import { OutlookCalendarPanel } from '@/components/calendar/OutlookCalendarPanel';
import { useOutlookCalendar } from '@/hooks/useOutlookCalendar';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, addWeeks, subWeeks, getHours, addHours, differenceInMilliseconds, addMinutes, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { toTimezoneISO } from '@/lib/sydneyTime';
import { formatInSydney } from '@/lib/timezoneUtils';
import { getBookingTimezone } from '@/lib/bookingTimezone';

// Sidebar tab type
type SidebarTab = 'events' | 'availability' | 'templates' | 'heatmap' | 'analytics' | 'summary' | 'conflicts' | 'optimize' | 'overlay' | 'outlook' | 'patterns' | 'reminders';

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

// Tab configurations with icons and shortcuts
const SIDEBAR_TABS: { id: SidebarTab; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { id: 'events', icon: <CalendarIcon className="h-4 w-4" />, label: 'Events', shortcut: '1' },
  { id: 'availability', icon: <Clock className="h-4 w-4" />, label: 'Availability', shortcut: '2' },
  { id: 'templates', icon: <Zap className="h-4 w-4" />, label: 'Templates', shortcut: '3' },
  { id: 'heatmap', icon: <Flame className="h-4 w-4" />, label: 'Heatmap', shortcut: '4' },
  { id: 'analytics', icon: <BarChart3 className="h-4 w-4" />, label: 'Analytics', shortcut: '5' },
  { id: 'summary', icon: <TrendingUp className="h-4 w-4" />, label: 'Summary', shortcut: '6' },
  { id: 'conflicts', icon: <AlertTriangle className="h-4 w-4" />, label: 'Conflicts', shortcut: '7' },
  { id: 'optimize', icon: <Sparkles className="h-4 w-4" />, label: 'Optimize', shortcut: '8' },
  { id: 'overlay', icon: <Layers className="h-4 w-4" />, label: 'Overlay', shortcut: '9' },
  { id: 'outlook', icon: <Mail className="h-4 w-4" />, label: 'Outlook', shortcut: '' },
  { id: 'patterns', icon: <Repeat className="h-4 w-4" />, label: 'Patterns', shortcut: '' },
  { id: 'reminders', icon: <Bell className="h-4 w-4" />, label: 'Reminders', shortcut: '' },
];

const CALENDAR_PAGE_SHELL = 'relative -m-4 min-h-[calc(100vh-2rem)] space-y-6 overflow-hidden bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_30%),linear-gradient(180deg,hsl(220_18%_5%),hsl(220_16%_8%)_42%,hsl(220_14%_6%))] p-4 md:-m-6 md:p-6';
const PREMIUM_CARD = 'border-white/10 bg-black/35 shadow-[0_18px_60px_hsl(0_0%_0%/0.35)] backdrop-blur-xl transition-all duration-200 ease-out';
const PREMIUM_PANEL = 'border-white/10 bg-gradient-to-br from-zinc-950/95 via-zinc-950/85 to-zinc-900/70 shadow-[0_20px_70px_hsl(0_0%_0%/0.38)] backdrop-blur-xl transition-all duration-200 ease-out';
const PREMIUM_BUTTON = 'border-white/10 bg-white/[0.03] transition-all duration-200 ease-out hover:border-primary/40 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_hsl(var(--primary)/0.12)]';
const PREMIUM_MUTED_SURFACE = 'border-white/10 bg-white/[0.03]';

export default function Calendar() {
  const { canEdit: canEditCalendar } = useModulePermissions('calendar');
  const isMobile = useIsMobile();
  const { calendars, events, calendarGroups, contactCache, isLoading, isUpdating, error, fetchCalendarData, fetchCalendarGroups, fetchContact, getCalendarColor, rescheduleEvent, updateEvent, deleteEvent, createAppointment, searchContacts, blockSlot, fetchFreeSlots } = useGHLCalendar();
  const {
    outlookEvents, teamAvailability, isLoading: outlookLoading, isCreating: outlookCreating,
    outlookEnabled, microsoftEmail, fetchOutlookEvents, createOutlookEvent, updateOutlookEvent,
    deleteOutlookEvent, fetchTeamAvailability, getMicrosoftEmail, setMicrosoftEmail, createPrepBlock,
  } = useOutlookCalendar();
  const [outlookVisible, setOutlookVisible] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('events');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pinnedTabs, setPinnedTabs] = useState<SidebarTab[]>(['events', 'conflicts']);
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddDefaultHour, setQuickAddDefaultHour] = useState<number | undefined>(undefined);
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
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
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { toast } = useToast();

  // Keyboard navigation hook
  const { TAB_SHORTCUTS } = useCalendarKeyboard({
    view,
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    currentWeek,
    setCurrentWeek,
    sidebarTab,
    setSidebarTab,
    setQuickAddModalOpen,
  });

  // Smart tab ordering based on context
  const smartOrderedTabs = useMemo(() => {
    const order: SidebarTab[] = [];

    // If selected date has conflicts, prioritize conflicts tab
    if (selectedDate) {
      const dayEvents = events.filter(e => {
        const d = safeParseISO(e.startTime);
        return d ? isSameDay(d, selectedDate) : false;
      });

      // Check for overlapping events (conflicts)
      const hasConflicts = dayEvents.some((event, i) => {
        const start1 = safeParseISO(event.startTime);
        const end1 = safeParseISO(event.endTime);
        if (!start1 || !end1) return false;

        return dayEvents.slice(i + 1).some(other => {
          const start2 = safeParseISO(other.startTime);
          const end2 = safeParseISO(other.endTime);
          if (!start2 || !end2) return false;
          return start1 < end2 && start2 < end1;
        });
      });

      if (hasConflicts) {
        order.push('conflicts');
      }

      if (dayEvents.length > 5) {
        order.push('analytics');
      }
    }

    return order;
  }, [selectedDate, events]);

  // Toggle pin for a tab
  const handleTogglePin = useCallback((tab: SidebarTab) => {
    setPinnedTabs(prev =>
      prev.includes(tab)
        ? prev.filter(t => t !== tab)
        : [...prev, tab]
    );
  }, []);

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

  const handleRefresh = useCallback(() => {
    const { start, end } = getVisibleRange();
    fetchCalendarData(start.toISOString(), end.toISOString());
    fetchOutlookEvents(start.toISOString(), end.toISOString());
  }, [view, currentMonth, currentWeek]);

  useEffect(() => {
    handleRefresh();
  }, [fetchCalendarData, view, currentMonth, currentWeek]);

  // Initialize visible calendars when calendars load
  useEffect(() => {
    if (calendars.length > 0 && visibleCalendars.size === 0) {
      setVisibleCalendars(new Set(calendars.map(c => c.id)));
    }
  }, [calendars]);

  // Calendar overlay handlers
  const handleToggleCalendar = useCallback((calendarId: string) => {
    setVisibleCalendars(prev => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      return next;
    });
  }, []);

  const handleShowAllCalendars = useCallback(() => {
    setVisibleCalendars(new Set(calendars.map(c => c.id)));
  }, [calendars]);

  const handleHideAllCalendars = useCallback(() => {
    setVisibleCalendars(new Set());
  }, []);

  // Batch actions handlers
  const handleToggleEventSelect = useCallback((eventId: string) => {
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const handleSelectAllEvents = useCallback(() => {
    const dayEvents = selectedDate
      ? events.filter(e => {
          const d = safeParseISO(e.startTime);
          return d ? isSameDay(d, selectedDate) : false;
        })
      : events;
    setSelectedEventIds(new Set(dayEvents.map(e => e.id)));
  }, [selectedDate, events]);

  const handleClearEventSelection = useCallback(() => {
    setSelectedEventIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async (eventIds: string[]) => {
    // Delete events one by one (could be optimized with batch API if available)
    for (const id of eventIds) {
      await deleteEvent(id);
    }
    toast({
      title: 'Events deleted',
      description: `${eventIds.length} event(s) have been deleted`,
    });
  }, [deleteEvent, toast]);

  const handleBatchReschedule = useCallback((eventIds: string[]) => {
    toast({
      title: 'Batch reschedule',
      description: `Select a new date to reschedule ${eventIds.length} event(s)`,
    });
    // TODO: Implement batch reschedule modal
  }, [toast]);

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

    // Build new start time - interpret in configured booking timezone
    // Using static imports from top of file
    const bookingTz = getBookingTimezone();

    let newStartDate: Date;
    if (targetHour !== undefined) {
      newStartDate = new Date(targetDate);
      newStartDate.setHours(targetHour, 0, 0, 0);
    } else {
      newStartDate = new Date(targetDate);
      newStartDate.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
    }

    // Convert the visual date/time to booking-timezone-anchored UTC
    const dateStr = `${newStartDate.getFullYear()}-${String(newStartDate.getMonth() + 1).padStart(2, '0')}-${String(newStartDate.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(newStartDate.getHours()).padStart(2, '0')}:${String(newStartDate.getMinutes()).padStart(2, '0')}`;
    const newStartISO = toTimezoneISO(dateStr, timeStr, bookingTz);

    // Calculate end from duration
    const endTotalMs = new Date(newStartISO).getTime() + duration;
    const newEndISO = new Date(endTotalMs).toISOString();

    // Check if actually moved
    if (newStartISO === event.startTime) {
      return; // No change
    }

    const result = await rescheduleEvent(
      event.id,
      newStartISO,
      newEndISO,
      event.startTime,
      event.endTime
    );

    if (result.success) {
      toast({
        title: 'Event rescheduled',
        description: `Moved to ${formatInSydney(newStartISO)}`,
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

    // Filter by visible calendars (multi-calendar overlay)
    if (visibleCalendars.size > 0 && visibleCalendars.size < calendars.length) {
      filtered = filtered.filter((event) => visibleCalendars.has(event.calendarId || ''));
    }

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

    // Merge Outlook events as GHLEvent-compatible objects when visible
    if (outlookVisible && outlookEvents.length > 0) {
      const outlookAsGHL: GHLEvent[] = outlookEvents
        .filter(oe => oe.startTime && oe.endTime)
        .map(oe => ({
          id: oe.id,
          title: oe.title,
          startTime: oe.startTime!,
          endTime: oe.endTime!,
          calendarId: oe.calendarId,
          calendarName: oe.calendarName,
          calendarColor: oe.calendarColor,
          status: oe.status,
          appointmentStatus: undefined,
          contactId: undefined,
          notes: oe.bodyPreview || undefined,
          address: oe.location || undefined,
        }));

      // Apply search filter to Outlook events too
      let filteredOutlook = outlookAsGHL;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredOutlook = filteredOutlook.filter(
          (event) =>
            toSearchable(event.title).includes(query) ||
            toSearchable(event.notes).includes(query) ||
            toSearchable(event.address).includes(query)
        );
      }

      filtered = [...filtered, ...filteredOutlook];
    }

    return filtered;
  }, [events, selectedCalendarId, searchQuery, outlookVisible, outlookEvents]);

  const ghlExportFields = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'tags', label: 'Tags' },
    { key: 'source', label: 'Source' },
    { key: 'appointment_id', label: 'Appointment ID' },
    { key: 'appointment_title', label: 'Appointment Title' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'status', label: 'Status' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'end_date', label: 'End Date' },
    { key: 'notes', label: 'Notes' },
    { key: 'address', label: 'Address' },
    { key: 'contact_id', label: 'Contact ID' },
  ];

  const ghlExportRecords = filteredEvents.map((event) => ({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    tags: 'Appointment Export',
    source: 'GHL Calendar',
    appointment_id: event.id || '',
    appointment_title: event.title || '',
    calendar: event.calendarName || '',
    status: event.appointmentStatus || event.status || '',
    start_date: safeFormatISO(event.startTime, 'yyyy-MM-dd HH:mm:ss'),
    end_date: safeFormatISO(event.endTime, 'yyyy-MM-dd HH:mm:ss'),
    notes: event.notes || '',
    address: event.address || '',
    contact_id: event.contactId || '',
  }));

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

  // Events per day for mini calendar
  const eventsPerDay = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEvents.forEach(event => {
      const d = safeParseISO(event.startTime);
      if (d) {
        const key = format(d, 'yyyy-MM-dd');
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
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
      case 'confirmed': return 'rounded-full border-emerald-400/25 bg-emerald-500/15 text-emerald-300';
      case 'booked': return 'rounded-full border-blue-400/25 bg-blue-500/15 text-blue-300';
      case 'showed': return 'rounded-full border-teal-400/25 bg-teal-500/15 text-teal-300';
      case 'noshow': return 'rounded-full border-red-400/25 bg-red-500/15 text-red-300';
      case 'cancelled': return 'rounded-full border-zinc-500/25 bg-zinc-500/15 text-zinc-300';
      case 'pending': return 'rounded-full border-amber-400/25 bg-amber-500/15 text-amber-300';
      default: return 'rounded-full border-white/10 bg-white/[0.04] text-zinc-400';
    }
  };

  const handleEventClick = (event: GHLEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  const getEventStyle = (event: GHLEvent) => {
    const status = (event.appointmentStatus || event.status || '').toLowerCase();

    // Outlook events - Microsoft blue styling
    if (event.calendarId?.startsWith('outlook_')) {
      return {
        backgroundColor: 'hsl(207 89% 41% / 0.15)',
        borderLeft: '3px solid hsl(207 89% 41%)',
        color: 'hsl(207 89% 41%)',
      };
    }

    // Cancelled appointments - Red styling with strikethrough effect
    if (status === 'cancelled' || status === 'canceled') {
      return {
        backgroundColor: 'hsl(var(--destructive) / 0.15)',
        borderLeft: '3px solid hsl(var(--destructive))',
        color: 'hsl(var(--destructive))',
        textDecoration: 'line-through',
        opacity: 0.8,
      };
    }

    // Rescheduled appointments - Orange styling
    if (status === 'rescheduled') {
      return {
        backgroundColor: 'hsl(38 92% 50% / 0.15)',
        borderLeft: '3px solid hsl(38 92% 50%)',
        color: 'hsl(38 92% 50%)',
      };
    }

    // No-show appointments - Muted red
    if (status === 'no_show' || status === 'noshow' || status === 'no-show') {
      return {
        backgroundColor: 'hsl(var(--destructive) / 0.1)',
        borderLeft: '3px solid hsl(var(--destructive) / 0.6)',
        color: 'hsl(var(--destructive) / 0.7)',
        opacity: 0.7,
      };
    }

    // Confirmed appointments - Green styling
    if (status === 'confirmed') {
      return {
        backgroundColor: 'hsl(142 76% 36% / 0.15)',
        borderLeft: '3px solid hsl(142 76% 36%)',
        color: 'hsl(142 76% 36%)',
      };
    }

    // Default - Use calendar color
    const color = event.calendarColor || getCalendarColor(event.calendarId);
    return {
      backgroundColor: `${color}20`,
      borderLeft: `3px solid ${color}`,
      color: color,
    };
  };

  // Go to today
  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentMonth(today);
    setCurrentWeek(today);
    setSelectedDate(today);
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedDate(null);
  }, []);

  // Swipe gestures for mobile calendar navigation
  const calendarSwipeHandlers = useSwipeGesture(
    useCallback(() => {
      // Swipe left = navigate forward (only in month view to avoid conflict with week horizontal scroll)
      if (view === 'month') setCurrentMonth(addMonths(currentMonth, 1));
    }, [view, currentMonth]),
    useCallback(() => {
      // Swipe right = navigate backward (only in month view)
      if (view === 'month') setCurrentMonth(subMonths(currentMonth, 1));
    }, [view, currentMonth]),
    { threshold: 60 }
  );

  if (error) {
    return (
      <div className={CALENDAR_PAGE_SHELL}>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">GoHighLevel Calendar Integration</p>
        </div>
        <Card className={cn(PREMIUM_CARD, "overflow-hidden rounded-2xl border-red-400/25 bg-red-500/5")}>
          <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/10 text-red-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="mb-2 text-sm font-semibold text-red-200">Calendar sync error</p>
            <p className="mb-5 max-w-xl text-sm text-red-100/75">{error}</p>
            <Button
              onClick={() => {
                const { start, end } = getVisibleRange();
                fetchCalendarData(start.toISOString(), end.toISOString());
              }}
              variant="outline"
              className="rounded-xl border-red-400/25 bg-red-500/10 text-red-100 transition-all hover:border-red-300/40 hover:bg-red-500/15 hover:text-red-50 focus-visible:ring-2 focus-visible:ring-red-300/40"
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
    <div className={CALENDAR_PAGE_SHELL}>
      <GHLExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="Export calendar for GHL"
        description="Map appointment fields to GHL import headers and export the current calendar view as CSV or XLSX."
        fields={ghlExportFields}
        records={ghlExportRecords}
        fileBaseName={`ghl-calendar-export-${format(new Date(), 'yyyy-MM-dd')}`}
        sheetName="Calendar Export"
        onExported={(exportFormat, count) => toast({ title: 'Exported', description: `Saved ${count} calendar items as ${exportFormat.toUpperCase()}` })}
      />

      {/* Event Details Modal with Edit/Delete */}
      <EventDetailsModal
        event={selectedEvent}
        open={eventModalOpen}
        onOpenChange={setEventModalOpen}
        getStatusColor={getStatusColor}
        fetchContact={fetchContact}
        onUpdateEvent={updateEvent}
        onDeleteEvent={deleteEvent}
        calendars={calendars}
        onRescheduleEvent={async (eventId, data) => {
          const selectedCal = calendars.find(c => c.id === selectedEvent?.calendarId);
          const assignedUserId = data.assignedUserId || selectedCal?.teamMembers?.[0]?.userId || undefined;

          // Call the GHL reschedule (update action)
          const result = await rescheduleEvent(
            eventId,
            data.newStartTime,
            data.newEndTime,
            data.originalStartTime,
            data.originalEndTime,
            { overrideAvailability: data.overrideAvailability, assignedUserId }
          );

          if (result.success) {
            // Send notifications to recipients if any
            const allNotificationRecipients = [
              ...(data.secondaryRecipients || []),
              ...(data.bookingRecipients || []).map(br => ({
                financeContactId: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: br.name,
                email: br.email,
              })),
            ];

            if (allNotificationRecipients.length > 0) {
              try {
                const calendarName = selectedCal?.name;
                await invokeSecureFunction('send-appointment-notification', {
                  appointmentGhlId: eventId,
                  appointmentTitle: selectedEvent?.title || 'Appointment',
                  appointmentStart: data.newStartTime,
                  appointmentEnd: data.newEndTime,
                  appointmentType: 'reschedule',
                  appointmentNotes: selectedEvent?.notes,
                  calendarName,
                  recipients: allNotificationRecipients,
                });
                toast({
                  title: 'Notifications sent',
                  description: `${allNotificationRecipients.length} recipient(s) notified of reschedule.`,
                });
              } catch (err: any) {
                console.error('Failed to send reschedule notifications:', err);
                toast({
                  title: 'Rescheduled, but notifications failed',
                  description: err.message || 'Could not send email notifications.',
                  variant: 'destructive',
                });
              }
            }
          }

          return result;
        }}
      />

      {/* Batch Actions Bar */}
      <BatchActions
        events={selectedDate ? selectedDateEvents : filteredEvents}
        selectedEventIds={selectedEventIds}
        onToggleSelect={handleToggleEventSelect}
        onSelectAll={handleSelectAllEvents}
        onClearSelection={handleClearEventSelection}
        onBatchDelete={handleBatchDelete}
        onBatchReschedule={handleBatchReschedule}
        isLoading={isUpdating}
      />

      {/* Header */}
      <section className={cn(PREMIUM_PANEL, "relative overflow-hidden rounded-2xl border p-4 md:p-6")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="hidden rounded-2xl border border-primary/25 bg-primary/10 p-3 text-primary shadow-[0_12px_35px_hsl(var(--primary)/0.12)] sm:block">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Scheduling command centre
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Calendar</h1>
                <p className="mt-1 flex items-center gap-2 text-sm font-medium text-zinc-300">
                  GoHighLevel Appointments
                  {isUpdating && <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary shadow-sm shadow-primary/10 animate-pulse">Updating...</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 rounded-xl border-white/10 bg-white/[0.04] px-3 font-semibold text-zinc-200 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-[0.98]">
                    <Mail className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
                    Export current view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Mobile sidebar trigger */}
              {isMobile && (
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <Button aria-label="Open calendar tools" variant="outline" size="icon" className={cn(PREMIUM_BUTTON, "h-10 w-10 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-95")}>
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[320px] p-0 flex flex-col h-full">
                  <SheetHeader className="p-4 border-b shrink-0">
                    <SheetTitle>Calendar Tools</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Tab triggers - scrollable horizontally */}
                    <div className="overflow-x-auto px-4 py-2 border-b shrink-0">
                      <div className="inline-flex gap-1 flex-wrap">
                        {SIDEBAR_TABS.map(tab => (
                          <button
                            key={tab.id}
                            aria-pressed={sidebarTab === tab.id}
                            onClick={() => setSidebarTab(tab.id)}
                            className={cn(
                              "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors min-h-[36px] touch-manipulation",
                              sidebarTab === tab.id
                                ? "border border-primary/50 bg-primary/20 text-primary"
                                : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            {tab.icon}
                            <span>{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Tab content */}
                    <ScrollArea className="flex-1 p-4">
                      {/* Mini Calendar Navigator */}
                      <div className="mb-4 pb-3 border-b">
                        <MiniCalendarNavigator
                          currentMonth={currentMonth}
                          setCurrentMonth={setCurrentMonth}
                          selectedDate={selectedDate}
                          onDateSelect={(date) => {
                            setSelectedDate(date);
                            setCurrentMonth(date);
                          }}
                          eventsPerDay={eventsPerDay}
                        />
                      </div>

                      {sidebarTab === 'events' && (
                        <div>
                          <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Upcoming'}
                          </h4>
                          {isLoading ? (
                            <SidebarLoadingSkeleton />
                          ) : (selectedDate ? selectedDateEvents : upcomingEvents).length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No events {selectedDate ? 'on this day' : 'upcoming'}</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {(selectedDate ? selectedDateEvents : upcomingEvents).map(event => (
                                <EventCard key={event.id} event={event} getStatusColor={getStatusColor} onClick={() => { handleEventClick(event); setMobileSidebarOpen(false); }} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {sidebarTab === 'availability' && selectedDate && (
                        <AvailabilitySlots selectedDate={selectedDate} events={filteredEvents} onSlotClick={(startTime) => {
                          setQuickAddDefaultHour(startTime.getHours());
                          setQuickAddModalOpen(true);
                          setMobileSidebarOpen(false);
                        }} />
                      )}
                      {sidebarTab === 'templates' && (
                        <EventTemplates calendars={calendars} selectedDate={selectedDate || undefined} onCreateAppointment={createAppointment} isUpdating={isUpdating} />
                      )}
                      {sidebarTab === 'heatmap' && (
                        <CalendarHeatmap events={filteredEvents} currentMonth={currentMonth} selectedDate={selectedDate} onDateSelect={(date) => { setSelectedDate(date); setSidebarTab('events'); }} />
                      )}
                      {sidebarTab === 'analytics' && (
                        <TimeAllocationDashboard events={filteredEvents} calendars={calendars} currentWeek={currentWeek} selectedDate={selectedDate} />
                      )}
                      {sidebarTab === 'summary' && (
                        <WeeklySummaryCards events={filteredEvents} currentWeek={currentWeek} selectedDate={selectedDate} />
                      )}
                      {sidebarTab === 'conflicts' && (
                        <ConflictDetection events={filteredEvents} onEventClick={(event) => { handleEventClick(event); setMobileSidebarOpen(false); }} selectedDate={selectedDate} />
                      )}
                      {sidebarTab === 'optimize' && (
                        <ResourceOptimization
                          events={filteredEvents}
                          currentWeek={currentWeek}
                          selectedDate={selectedDate}
                          onSlotSelect={(date, hour) => {
                            setSelectedDate(date);
                            setQuickAddDefaultHour(hour);
                            setQuickAddModalOpen(true);
                            setMobileSidebarOpen(false);
                          }}
                        />
                      )}
                      {sidebarTab === 'overlay' && (
                        <MultiCalendarOverlay
                          calendars={calendars}
                          events={events}
                          visibleCalendars={visibleCalendars}
                          onToggleCalendar={handleToggleCalendar}
                          onShowAll={handleShowAllCalendars}
                          onHideAll={handleHideAllCalendars}
                          outlookEnabled={outlookEnabled}
                          outlookVisible={outlookVisible}
                          onToggleOutlook={() => setOutlookVisible(v => !v)}
                          outlookEventCount={outlookEvents.length}
                          microsoftEmail={microsoftEmail}
                        />
                      )}
                      {sidebarTab === 'outlook' && (
                        <OutlookCalendarPanel
                          outlookEvents={outlookEvents}
                          teamAvailability={teamAvailability}
                          isLoading={outlookLoading}
                          isCreating={outlookCreating}
                          outlookEnabled={outlookEnabled}
                          microsoftEmail={microsoftEmail}
                          onRefresh={() => { const { start, end } = getVisibleRange(); fetchOutlookEvents(start.toISOString(), end.toISOString()); }}
                          onFetchTeam={() => { const { start, end } = getVisibleRange(); fetchTeamAvailability(start.toISOString(), end.toISOString()); }}
                          onCreateEvent={createOutlookEvent}
                          onDeleteEvent={deleteOutlookEvent}
                          onSetMicrosoftEmail={setMicrosoftEmail}
                          onGetMicrosoftEmail={getMicrosoftEmail}
                          outlookVisible={outlookVisible}
                          onToggleOutlookVisible={() => setOutlookVisible(v => !v)}
                          selectedDate={selectedDate}
                          onCreatePrepBlock={createPrepBlock}
                        />
                      )}
                      {sidebarTab === 'patterns' && (
                        <RecurringPatterns events={events} onPatternClick={(pattern) => toast({ title: 'Pattern detected', description: pattern.title })} />
                      )}
                      {sidebarTab === 'reminders' && (
                        <SmartReminders calendars={calendars} />
                      )}
                    </ScrollArea>
                  </div>
                </SheetContent>
              </Sheet>
              )}
              <Button
                aria-label="Refresh calendar"
                variant="outline"
                size="icon"
                className={cn(PREMIUM_BUTTON, "h-10 w-10 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60")}
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Controls row - scrollable on mobile */}
          <div className={cn(PREMIUM_MUTED_SURFACE, "flex flex-wrap items-stretch gap-2 rounded-2xl border p-2.5 sm:items-center")}>
            {!isMobile && <KeyboardShortcutsHint />}
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
              <TabsList className="h-10 w-full rounded-xl border border-white/10 bg-black/35 p-1 shadow-inner shadow-black/20 sm:w-auto">
                <TabsTrigger value="month" className="h-8 rounded-lg px-3 text-xs text-zinc-400 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary/40">Month</TabsTrigger>
                <TabsTrigger value="week" className="h-8 rounded-lg px-3 text-xs text-zinc-400 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary/40">Week</TabsTrigger>
                {!isMobile && (
                  <TabsTrigger value="timeline" className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs text-zinc-400 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-white/5 data-[state=inactive]:hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-primary/40">
                    <LayoutList className="h-3 w-3" />
                    Timeline
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
              <SelectTrigger className="h-10 w-full min-w-[200px] flex-1 shrink-0 rounded-xl border-white/10 bg-black/35 px-3 text-sm shadow-inner shadow-black/20 transition-all hover:border-primary/30 hover:bg-primary/10 focus:ring-2 focus:ring-primary/40 sm:w-[220px] sm:flex-none">
                <Filter className="mr-2 h-4 w-4 text-primary/80" />
                <SelectValue placeholder="All Calendars" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/10 bg-zinc-950/95 shadow-[0_18px_60px_hsl(0_0%_0%/0.4)] backdrop-blur-xl">
                <SelectItem value="all">All Calendars</SelectItem>
                {calendars.map(cal => (
                  <SelectItem key={cal.id} value={cal.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0 ring-2 ring-black/30 shadow-sm"
                        style={{ backgroundColor: cal.eventColor || '#3b82f6' }}
                      />
                      <span className="truncate max-w-[120px]">{cal.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Stats Row */}
      {isLoading ? (
        <StatsLoadingSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={cn(PREMIUM_CARD, "group py-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-black/45 hover:shadow-[0_22px_70px_hsl(0_0%_0%/0.42)]")}>
            <CardContent className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-3xl font-bold leading-none tracking-tight text-white">{calendars.length}</div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Calendars</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-zinc-400 transition-all group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                <CalendarIcon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className={cn(PREMIUM_CARD, "group py-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-black/45 hover:shadow-[0_22px_70px_hsl(0_0%_0%/0.42)]")}>
            <CardContent className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-3xl font-bold leading-none tracking-tight text-white">{filteredEvents.length}</div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Total Events</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-zinc-400 transition-all group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
                <LayoutList className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className={cn(PREMIUM_CARD, "group py-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-950/10 hover:shadow-[0_22px_70px_hsl(160_84%_20%/0.16)]")}>
            <CardContent className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-3xl font-bold leading-none tracking-tight text-emerald-400">
                  {filteredEvents.filter(e => e.appointmentStatus === 'confirmed' || e.appointmentStatus === 'showed').length}
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Confirmed</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-emerald-400 transition-all group-hover:border-emerald-300/40 group-hover:bg-emerald-400/15">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className={cn(PREMIUM_CARD, "group py-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:shadow-[0_22px_70px_hsl(var(--primary)/0.16)]")}>
            <CardContent className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <div className="text-3xl font-bold leading-none tracking-tight text-primary">{upcomingEvents.length}</div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary/75">Upcoming</p>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary transition-all group-hover:border-primary/40 group-hover:bg-primary/15">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendar Legend */}
      {calendars.length > 0 && (
        <Card className={cn(PREMIUM_CARD, "py-0 transition-all duration-200 hover:border-primary/25")}>
          <CardContent className="px-4 py-3">
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="mr-0.5 shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Calendars:</span>
                {calendars.map(calendar => (
                  <Tooltip key={calendar.id}>
                    <TooltipTrigger asChild>
                      <button
                        aria-pressed={selectedCalendarId === calendar.id}
                        title={calendar.name}
                        onClick={() => setSelectedCalendarId(calendar.id === selectedCalendarId ? 'all' : calendar.id)}
                        className={cn(
                          'group flex max-w-[190px] items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-sm transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-[0.98]',
                          selectedCalendarId === calendar.id
                            ? 'border-primary/60 bg-primary/20 text-primary shadow-[0_10px_28px_hsl(var(--primary)/0.14)]'
                            : selectedCalendarId === 'all'
                              ? 'border-white/10 bg-white/[0.04] text-zinc-300 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary hover:shadow-[0_10px_28px_hsl(var(--primary)/0.10)]'
                              : 'border-white/5 bg-white/[0.025] text-zinc-500 opacity-70 hover:opacity-100 hover:border-primary/25 hover:text-zinc-200'
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/30"
                          style={{ backgroundColor: calendar.eventColor || '#3b82f6' }}
                        />
                        <span className="min-w-0 truncate">{calendar.name}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{calendar.name}</TooltipContent>
                  </Tooltip>
                ))}
                {selectedCalendarId !== 'all' && (
                  <button
                    onClick={() => setSelectedCalendarId('all')}
                    className="ml-0.5 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                  >
                    Show all
                  </button>
                )}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      <div className={cn(
        "grid gap-4 md:gap-6 transition-all duration-300",
        isMobile ? "grid-cols-1" : sidebarCollapsed ? "grid-cols-[1fr_auto]" : "lg:grid-cols-3"
      )}>
        {/* Calendar View */}
        <Card className={cn(PREMIUM_PANEL, "overflow-hidden rounded-2xl border-primary/10", isMobile ? '' : sidebarCollapsed ? '' : 'lg:col-span-2')}>
          <CardHeader className="border-b border-white/10 bg-white/[0.02] pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
                <span className="rounded-xl border border-primary/25 bg-primary/10 p-2 text-primary">
                  <CalendarIcon className="h-5 w-5" />
                </span>
                {view === 'month'
                  ? format(currentMonth, 'MMMM yyyy')
                  : view === 'week'
                    ? `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
                    : selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Timeline'
                }
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl border border-white/10 text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-95"
                  onClick={() => view === 'month'
                    ? setCurrentMonth(subMonths(currentMonth, 1))
                    : setCurrentWeek(subWeeks(currentWeek, 1))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={goToToday}
                  className="h-10 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_12px_28px_hsl(var(--primary)/0.22)] focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-[0.98]"
                >
                  Today
                </Button>
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="h-10 rounded-xl border border-white/10 text-zinc-400 transition-all hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-[0.98]"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
                <Button
                  aria-label={view === 'month' ? 'Next month' : 'Next week'}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl border border-white/10 text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-95"
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
          <CardContent className="p-3 md:p-4">
            {/* Animation wrapper with swipe support */}
            <div
              {...(isMobile ? calendarSwipeHandlers : {})}
              className={cn(
                'transition-all duration-300 ease-out',
                viewTransition === 'exit' && 'opacity-0 scale-95 translate-y-2',
                viewTransition === 'enter' && 'animate-fade-in',
                !viewTransition && 'opacity-100'
              )}
            >
              {isLoading ? (
                <CalendarLoadingSkeleton view={view} />
              ) : view === 'month' ? (
                <>
                  {/* Day headers - Sticky */}
                  <div className="sticky top-0 z-10 mb-2 grid grid-cols-7 gap-1.5 rounded-2xl border border-white/10 bg-black/60 p-1.5 shadow-inner shadow-black/30 backdrop-blur">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="rounded-xl py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 md:text-xs">
                        {isMobile ? day.charAt(0) : day}
                      </div>
                    ))}
                  </div>
                  {/* Calendar grid with DropZones */}
                  <div className="grid grid-cols-7 gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-1.5 shadow-inner shadow-black/20 md:gap-2 md:p-2">
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
                            'min-h-[76px] rounded-xl border p-1 text-left transition-all duration-200 ease-out cursor-pointer bg-white/[0.02] focus-within:ring-2 focus-within:ring-primary/40 md:min-h-[116px] md:p-2',
                            isSelected ? 'border-primary bg-primary/15 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35),0_14px_36px_hsl(var(--primary)/0.12)]' : 'border-white/5 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/[0.045] hover:shadow-[0_10px_26px_hsl(var(--primary)/0.08)]',
                            !isCurrentMonth && 'bg-black/20 opacity-50',
                            isToday(day) && 'ring-1 ring-primary/70'
                          )}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`Select ${format(day, 'EEEE, MMMM d, yyyy')}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ', no events'}`}
                            onClick={() => setSelectedDate(day)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedDate(day);
                              }
                            }}
                            className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                          >
                            <div className={cn(
                              'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                              isSelected ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20' : isToday(day) ? 'border border-primary/50 bg-primary/10 text-primary' : isCurrentMonth ? 'text-zinc-200' : 'text-zinc-500'
                            )}>
                              {format(day, 'd')}
                            </div>
                            <div className="space-y-1">
                              {dayEvents.slice(0, isMobile ? 2 : 3).map(event => (
                                <EnhancedEventPreview
                                  key={event.id}
                                  event={event}
                                  getStatusColor={getStatusColor}
                                  fetchContact={fetchContact}
                                  contactCache={contactCache}
                                  onViewDetails={() => handleEventClick(event)}
                                  onConfirm={async () => {
                                    await updateEvent(event.id, { appointmentStatus: 'confirmed' });
                                    toast({ title: 'Event confirmed' });
                                  }}
                                  onCancel={async () => {
                                    await updateEvent(event.id, { appointmentStatus: 'cancelled' });
                                    toast({ title: 'Event cancelled' });
                                  }}
                                >
                                  <DraggableEvent
                                    event={event}
                                    disabled={isUpdating}
                                    onDragStart={setDraggingEvent}
                                    onDragEnd={() => setDraggingEvent(null)}
                                  >
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      aria-label={`Open ${event.title || 'Event'} at ${safeFormatISO(event.startTime, 'HH:mm')}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEventClick(event);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleEventClick(event);
                                        }
                                      }}
                                      style={getEventStyle(event)}
                                      className="flex min-h-[20px] items-center gap-1.5 overflow-hidden rounded-lg px-1.5 py-1 text-[10px] font-semibold leading-none shadow-sm ring-1 ring-white/10 transition-all duration-150 ease-out cursor-pointer hover:translate-x-0.5 hover:opacity-95 hover:ring-white/20 hover:shadow-[0_6px_18px_hsl(0_0%_0%/0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 md:px-2"
                                    >
                                      <span className="shrink-0 tabular-nums">{safeFormatISO(event.startTime, 'HH:mm')}</span>
                                      {!isMobile && (
                                        <span className="min-w-0 truncate opacity-90">{event.title || 'Event'}</span>
                                      )}
                                    </div>
                                  </DraggableEvent>
                                </EnhancedEventPreview>
                              ))}
                              {dayEvents.length > (isMobile ? 2 : 3) && (
                                <div className="rounded-lg border border-white/5 bg-white/[0.04] px-1.5 py-1 text-[9px] font-semibold text-zinc-400 md:text-[10px]">
                                  +{dayEvents.length - (isMobile ? 2 : 3)} more
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
                <div className={cn("h-[600px]", isMobile ? "overflow-auto" : "overflow-y-auto overflow-x-hidden")}>
                  <div className="min-w-[700px]">
                    {/* Week day headers - Sticky */}
                    <div className="grid grid-cols-8 gap-1 mb-1 sticky top-0 bg-background z-10 pb-2 border-b">
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
                          <div className="text-[10px] text-muted-foreground py-1 w-16 text-right pr-2 sticky left-0 bg-background">
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
                                      role="button"
                                      tabIndex={0}
                                      aria-label={`Open ${event.title || 'Event'} at ${safeFormatISO(event.startTime, 'h:mm a')}`}
                                      onClick={() => handleEventClick(event)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          handleEventClick(event);
                                        }
                                      }}
                                      style={getEventStyle(event)}
                                      className="w-full text-left text-[10px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
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
                </div>
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

        {/* Sidebar Panel with Tabs - Hidden on mobile (accessible via Sheet) */}
        {!isMobile && (
        <Card className={cn(
          PREMIUM_PANEL, "rounded-2xl transition-all duration-300 overflow-hidden border-primary/10",
          sidebarCollapsed ? "w-[52px] min-w-[52px]" : "min-w-0"
        )}>
          {sidebarCollapsed ? (
            // Collapsed: compact vertical icon strip
            <div className="flex flex-col items-center gap-2 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Expand calendar tools sidebar"
                    variant="ghost"
                    size="icon"
                    className="mb-1 h-9 w-9 rounded-xl border border-white/10 text-zinc-300 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45"
                    onClick={() => setSidebarCollapsed(false)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Expand sidebar</TooltipContent>
              </Tooltip>

              <TooltipProvider delayDuration={100}>
                {SIDEBAR_TABS.map((tab) => {
                  const isPinned = pinnedTabs.includes(tab.id);
                  return (
                    <Tooltip key={tab.id}>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={tab.label}
                          aria-pressed={sidebarTab === tab.id}
                          title={tab.label}
                          onClick={() => {
                            setSidebarTab(tab.id);
                            setSidebarCollapsed(false);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            handleTogglePin(tab.id);
                          }}
                          className={cn(
                            'relative flex h-10 w-10 flex-col items-center justify-center gap-0.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
                            sidebarTab === tab.id
                              ? 'border-primary/60 bg-primary/20 text-primary shadow-[0_10px_24px_hsl(var(--primary)/0.14)]'
                              : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-primary/35 hover:bg-primary/10 hover:text-primary',
                            isPinned && 'ring-1 ring-primary/30'
                          )}
                        >
                          {tab.icon}
                          <span className="text-[8px] leading-none">{tab.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <div className="flex items-center gap-2">
                          {tab.label}
                          {tab.shortcut && (
                            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded">{tab.shortcut}</kbd>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    );
                  })}
              </TooltipProvider>
            </div>
          ) : (
            // Expanded: full sidebar with header and content
            <>
              <CardHeader className="border-b border-white/10 bg-white/[0.02] pb-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-semibold text-white">Tools</span>
                    <p className="mt-0.5 text-[11px] text-zinc-500">Calendar command sidebar</p>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Button size="sm" variant="outline" className="h-10 rounded-xl border-primary/40 bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-[0_12px_28px_hsl(var(--primary)/0.22)] focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-[0.98]" onClick={() => setQuickAddModalOpen(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Quick Add
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="Collapse calendar tools sidebar"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-xl border border-white/10 text-zinc-400 transition-all hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-95"
                          onClick={() => setSidebarCollapsed(true)}
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Collapse sidebar</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <TooltipProvider delayDuration={100}>
                  <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as any)}>
                    <TabsList className="grid h-auto w-full grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-black/35 p-2 shadow-inner shadow-black/20">
                      {SIDEBAR_TABS.map((tab) => {
                        const isPinned = pinnedTabs.includes(tab.id);
                        return (
                          <Tooltip key={tab.id}>
                            <TooltipTrigger asChild>
                              <TabsTrigger
                                aria-label={tab.label}
                                title={tab.label}
                                value={tab.id}
                                className={cn(
                                  "relative h-11 rounded-xl border border-white/10 bg-white/[0.03] p-0 text-zinc-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/45 active:translate-y-0 active:scale-95 data-[state=active]:border-primary/60 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_10px_24px_hsl(var(--primary)/0.14)]",
                                  isPinned && "ring-1 ring-primary/30"
                                )}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  handleTogglePin(tab.id);
                                }}
                              >
                                {tab.icon}
                              </TabsTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {tab.label}
                                {tab.shortcut && (
                                  <kbd className="px-1.5 py-0.5 text-[10px] bg-background/50 rounded border">{tab.shortcut}</kbd>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                Right-click to {isPinned ? 'unpin' : 'pin'}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                </TooltipProvider>
              </CardHeader>

              <CardContent className="p-3">
              {/* Mini Calendar Navigator */}
              <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-3 shadow-inner shadow-black/20">
                <MiniCalendarNavigator
                  currentMonth={currentMonth}
                  setCurrentMonth={setCurrentMonth}
                  selectedDate={selectedDate}
                  onDateSelect={(date) => {
                    setSelectedDate(date);
                    setCurrentMonth(date);
                  }}
                  eventsPerDay={eventsPerDay}
                />
              </div>

              {sidebarTab === 'events' && (
                <div>
                  <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                      <Clock className="h-4 w-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Upcoming'}
                      </h4>
                      <p className="text-[11px] text-zinc-500">
                        {selectedDate ? 'Selected day agenda' : 'Next scheduled appointments'}
                      </p>
                    </div>
                  </div>
                  <div>
                    {isLoading ? (
                      <SidebarLoadingSkeleton />
                    ) : (selectedDate ? selectedDateEvents : upcomingEvents).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-muted-foreground">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                          <CalendarIcon className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-medium text-zinc-300">No events {selectedDate ? 'on this day' : 'upcoming'}</p>
                        <p className="mt-1 text-xs text-zinc-500">Use Quick Add to schedule from this panel.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(selectedDate ? selectedDateEvents : upcomingEvents).map(event => (
                          <EventCard key={event.id} event={event} getStatusColor={getStatusColor} onClick={() => handleEventClick(event)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {sidebarTab === 'availability' && selectedDate && (
                <AvailabilitySlots selectedDate={selectedDate} events={filteredEvents} onSlotClick={(startTime) => {
                  setQuickAddDefaultHour(startTime.getHours());
                  setQuickAddModalOpen(true);
                }} />
              )}
              {sidebarTab === 'templates' && (
                <EventTemplates calendars={calendars} selectedDate={selectedDate || undefined} onCreateAppointment={createAppointment} isUpdating={isUpdating} />
              )}
              {sidebarTab === 'heatmap' && (
                <ScrollArea className="h-[320px]">
                  <CalendarHeatmap events={filteredEvents} currentMonth={currentMonth} selectedDate={selectedDate} onDateSelect={(date) => { setSelectedDate(date); setSidebarTab('events'); }} />
                </ScrollArea>
              )}
              {sidebarTab === 'analytics' && (
                <ScrollArea className="h-[320px]">
                  <TimeAllocationDashboard events={filteredEvents} calendars={calendars} currentWeek={currentWeek} selectedDate={selectedDate} />
                </ScrollArea>
              )}
              {sidebarTab === 'summary' && (
                <ScrollArea className="h-[320px]">
                  <WeeklySummaryCards events={filteredEvents} currentWeek={currentWeek} selectedDate={selectedDate} />
                </ScrollArea>
              )}
              {sidebarTab === 'conflicts' && (
                <ConflictDetection events={filteredEvents} onEventClick={handleEventClick} selectedDate={selectedDate} />
              )}
              {sidebarTab === 'optimize' && (
                <ResourceOptimization
                  events={filteredEvents}
                  currentWeek={currentWeek}
                  selectedDate={selectedDate}
                  onSlotSelect={(date, hour) => {
                    setSelectedDate(date);
                    setQuickAddDefaultHour(hour);
                    setQuickAddModalOpen(true);
                  }}
                />
              )}
              {sidebarTab === 'overlay' && (
                <MultiCalendarOverlay
                  calendars={calendars}
                  events={events}
                  visibleCalendars={visibleCalendars}
                  onToggleCalendar={handleToggleCalendar}
                  onShowAll={handleShowAllCalendars}
                  onHideAll={handleHideAllCalendars}
                  outlookEnabled={outlookEnabled}
                  outlookVisible={outlookVisible}
                  onToggleOutlook={() => setOutlookVisible(v => !v)}
                  outlookEventCount={outlookEvents.length}
                  microsoftEmail={microsoftEmail}
                />
              )}
              {sidebarTab === 'outlook' && (
                <OutlookCalendarPanel
                  outlookEvents={outlookEvents}
                  teamAvailability={teamAvailability}
                  isLoading={outlookLoading}
                  isCreating={outlookCreating}
                  outlookEnabled={outlookEnabled}
                  microsoftEmail={microsoftEmail}
                  onRefresh={() => { const { start, end } = getVisibleRange(); fetchOutlookEvents(start.toISOString(), end.toISOString()); }}
                  onFetchTeam={() => { const { start, end } = getVisibleRange(); fetchTeamAvailability(start.toISOString(), end.toISOString()); }}
                  onCreateEvent={createOutlookEvent}
                  onDeleteEvent={deleteOutlookEvent}
                  onSetMicrosoftEmail={setMicrosoftEmail}
                  onGetMicrosoftEmail={getMicrosoftEmail}
                  outlookVisible={outlookVisible}
                  onToggleOutlookVisible={() => setOutlookVisible(v => !v)}
                  selectedDate={selectedDate}
                  onCreatePrepBlock={createPrepBlock}
                />
              )}
              {sidebarTab === 'patterns' && (
                <RecurringPatterns events={events} onPatternClick={(pattern) => toast({ title: 'Pattern detected', description: pattern.title })} />
              )}
              {sidebarTab === 'reminders' && (
                <SmartReminders calendars={calendars} />
              )}
             </CardContent>
            </>
          )}
        </Card>
        )}
      </div>

      {/* Floating Actions */}
      <FloatingActions
        onQuickAdd={() => setQuickAddModalOpen(true)}
        onRefresh={handleRefresh}
        onClearSelection={selectedDate ? clearSelection : undefined}
        hasSelection={!!selectedDate}
        isRefreshing={isLoading}
      />

      {/* Quick Add Modal */}
      <QuickAddAppointmentModal
        open={quickAddModalOpen}
        onOpenChange={setQuickAddModalOpen}
        calendars={calendars}
        defaultDate={selectedDate || undefined}
        defaultHour={quickAddDefaultHour}
        isLoading={isUpdating}
        onSubmit={async (data) => {
          const { secondaryRecipients, bookingRecipients, overrideAvailability, assignedUserId: manualAssignedUserId, ...appointmentData } = data;

          // Use manually selected team member, or auto-assign first member as fallback
          const selectedCal = calendars.find(c => c.id === data.calendarId);
          const assignedUserId = (manualAssignedUserId && manualAssignedUserId !== 'auto')
            ? manualAssignedUserId
            : selectedCal?.teamMembers?.[0]?.userId || undefined;

          const result = await createAppointment({ ...appointmentData, overrideAvailability, assignedUserId });

          if (result.success) {
            logActivityDirect({
              actionType: 'appointment_created',
              entityType: 'appointment',
              entityName: data.title,
              metadata: { calendar: calendars.find(c => c.id === data.calendarId)?.name }
            });
            const calendarName = calendars.find(c => c.id === data.calendarId)?.name;
            const appointmentId = result.event?.id || `temp-${Date.now()}`;

            // Combine all notification recipients: finance contacts + booking recipients
            const allNotificationRecipients = [
              ...(secondaryRecipients || []),
              ...(bookingRecipients || []).map(br => ({
                financeContactId: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: br.name,
                email: br.email,
              })),
            ];

            if (allNotificationRecipients.length > 0) {
              try {
                await invokeSecureFunction('send-appointment-notification', {
                  appointmentGhlId: appointmentId,
                  appointmentTitle: data.title,
                  appointmentStart: data.startTime,
                  appointmentEnd: data.endTime,
                  appointmentType: 'call',
                  appointmentNotes: data.notes,
                  calendarName,
                  recipients: allNotificationRecipients,
                });
                toast({
                  title: 'Notifications sent',
                  description: `${allNotificationRecipients.length} recipient(s) notified with calendar invite.`,
                });
              } catch (err: any) {
                console.error('Failed to send appointment notifications:', err);
                toast({
                  title: 'Appointment created, but notifications failed',
                  description: err.message || 'Could not send email notifications.',
                  variant: 'destructive',
                });
              }
            }

            // Auto-create Outlook prep block if user has Outlook configured
            if (microsoftEmail && outlookEnabled) {
              try {
                await createPrepBlock({
                  appointmentTitle: data.title,
                  appointmentStartTime: data.startTime,
                  clientName: data.title,
                  prepMinutes: 15,
                  notes: data.notes,
                });
              } catch (err) {
                console.log('[Calendar] Prep block creation failed (non-critical):', err);
              }
            }
          }

          return result.success;
        }}
        onSearchContacts={searchContacts}
      />

      {/* Calendars List — split into Frequently Used and Other */}
      <Card className={cn(PREMIUM_PANEL, "overflow-hidden rounded-2xl border-primary/10")}>
        <CardHeader className="border-b border-white/10 bg-white/[0.02]">
          <CardTitle className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
              <span className="rounded-2xl border border-primary/25 bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </span>
              Available Calendars ({calendars.length})
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Calendar registry</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-5">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : (() => {
            // Rank active calendars by how many events they have (descending), then alphabetically
            const eventCountByCalendar: Record<string, number> = {};
            events.forEach(e => {
              if (e.calendarId) {
                eventCountByCalendar[e.calendarId] = (eventCountByCalendar[e.calendarId] || 0) + 1;
              }
            });

            const activeCalendars = calendars.filter(c => c.isActive);
            const inactiveCalendars = calendars.filter(c => !c.isActive);

            // Sort active calendars by event count (most used first), then by name
            const rankedActive = [...activeCalendars].sort((a, b) => {
              const countDiff = (eventCountByCalendar[b.id] || 0) - (eventCountByCalendar[a.id] || 0);
              if (countDiff !== 0) return countDiff;
              return a.name.localeCompare(b.name);
            });

            // Top 4 with at least 1 event are "Most Frequently Used"
            const withEvents = rankedActive.filter(c => (eventCountByCalendar[c.id] || 0) > 0);
            const frequentlyUsed = withEvents.slice(0, 4);
            const frequentlyUsedIds = new Set(frequentlyUsed.map(c => c.id));
            const otherCalendars = [...rankedActive.filter(c => !frequentlyUsedIds.has(c.id)), ...inactiveCalendars];

            const renderCalendarCard = (calendar: typeof calendars[0]) => {
              const calEventCount = eventCountByCalendar[calendar.id] || 0;
              return (
              <button
                key={calendar.id}
                title={calendar.name}
                aria-pressed={selectedCalendarId === calendar.id}
                onClick={() => setSelectedCalendarId(calendar.id === selectedCalendarId ? 'all' : calendar.id)}
                className={cn(
                  'group rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 active:scale-[0.99]',
                  selectedCalendarId === calendar.id
                    ? 'border-primary/60 bg-primary/15 shadow-[0_16px_42px_hsl(var(--primary)/0.14)]'
                    : 'border-white/10 bg-white/[0.03] hover:-translate-y-1 hover:border-primary/35 hover:bg-primary/10 hover:shadow-[0_18px_46px_hsl(0_0%_0%/0.28)]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3.5 w-3.5 rounded-full shrink-0 ring-2 ring-black/30 shadow-sm"
                        style={{ backgroundColor: calendar.eventColor || '#3b82f6' }}
                      />
                      <span className="truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-white">{calendar.name}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                        {calendar.calendarType.replace('_', ' ')}
                      </Badge>
                      {calendar.isActive && (
                        <Badge className="rounded-full border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Active
                        </Badge>
                      )}
                      {calEventCount > 0 && (
                        <Badge variant="secondary" className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {calEventCount} event{calEventCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {calendar.teamMembers && calendar.teamMembers.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-xs text-zinc-400">
                      <Users className="h-3 w-3" />
                      {calendar.teamMembers.length} member{calendar.teamMembers.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </button>
            );
            };

            return (
              <div className="space-y-7">
                {frequentlyUsed.length > 0 && (
                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Most Frequently Used</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {frequentlyUsed.map(renderCalendarCard)}
                    </div>
                  </div>
                )}
                {otherCalendars.length > 0 && (
                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Other Calendars</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {otherCalendars.map(renderCalendarCard)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
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
      className="w-full p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-primary/30 hover:bg-primary/10 transition-all text-left shadow-sm"
      style={{ borderLeftWidth: '4px', borderLeftColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{event.title || 'Untitled Event'}</p>
          {event.calendarName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-black/30"
                style={{ backgroundColor: color }}
              />
              {event.calendarName}
            </p>
          )}
        </div>
        <Badge className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(event.status, event.appointmentStatus)}`}>
          {event.appointmentStatus || event.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {safeFormatISO(event.startTime, 'MMM d, HH:mm')} - {safeFormatISO(event.endTime, 'HH:mm')}
        </div>
        {event.contactId && (
          <div className="flex items-center gap-1 text-primary">
            <Users className="h-3 w-3" />
            <span>Contact linked</span>
          </div>
        )}
      </div>
      {event.notes && (
        <p className="text-xs text-muted-foreground mt-2">{event.notes}</p>
      )}
    </button>
  );
}
