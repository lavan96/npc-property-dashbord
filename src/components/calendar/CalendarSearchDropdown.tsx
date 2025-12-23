import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, User, Phone, Mail, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import type { GHLEvent, GHLContact } from '@/hooks/useGHLCalendar';

interface EventWithContact extends GHLEvent {
  contact?: GHLContact | null;
}

interface CalendarSearchDropdownProps {
  events: GHLEvent[];
  contactCache: Map<string, GHLContact>;
  fetchContact: (contactId: string) => Promise<GHLContact | null>;
  onSelectEvent: (event: GHLEvent) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function CalendarSearchDropdown({
  events,
  contactCache,
  fetchContact,
  onSelectEvent,
  searchQuery,
  setSearchQuery,
}: CalendarSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventsWithContacts, setEventsWithContacts] = useState<EventWithContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toSearchable = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

  // When search query changes, enrich events with contact info
  useEffect(() => {
    const enrichEvents = async () => {
      if (!searchQuery.trim()) {
        setEventsWithContacts([]);
        return;
      }

      setLoadingContacts(true);

      // Get unique contact IDs from events
      const contactIds = new Set(
        events.filter((e) => e.contactId).map((e) => e.contactId!)
      );

      // Fetch missing contacts
      const fetchPromises: Promise<void>[] = [];
      contactIds.forEach((id) => {
        if (!contactCache.has(id)) {
          fetchPromises.push(fetchContact(id).then(() => {}));
        }
      });

      await Promise.all(fetchPromises);

      // Map events with their contacts
      const enriched: EventWithContact[] = events.map((event) => ({
        ...event,
        contact: event.contactId ? contactCache.get(event.contactId) || null : null,
      }));

      setEventsWithContacts(enriched);
      setLoadingContacts(false);
    };

    enrichEvents();
  }, [searchQuery, events, contactCache, fetchContact]);

  // Filter results based on search query
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();

    return eventsWithContacts
      .filter((event) => {
        // Search in event fields
        if (toSearchable(event.title).includes(query)) return true;
        if (toSearchable(event.notes).includes(query)) return true;
        if (toSearchable(event.address).includes(query)) return true;

        // Search in contact fields
        if (event.contact) {
          const c = event.contact;
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
          if (toSearchable(c.name).includes(query)) return true;
          if (toSearchable(fullName).includes(query)) return true;
          if (toSearchable(c.email).includes(query)) return true;
          if (toSearchable(c.phone).includes(query)) return true;
        }

        return false;
      })
      .slice(0, 15); // Limit to 15 results
  }, [eventsWithContacts, searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const safeParseISO = (value: string) => {
    try {
      const d = parseISO(value);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const handleSelectEvent = (event: GHLEvent) => {
    onSelectEvent(event);
    setIsOpen(false);
    setSearchQuery('');
  };

  const getContactDisplayName = (contact: GHLContact) => {
    if (contact.name) return contact.name;
    if (contact.firstName || contact.lastName) {
      return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
    }
    return 'Unknown';
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events, contacts..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => searchQuery.trim() && setIsOpen(true)}
          className="w-[260px] pl-8 pr-8 h-9"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && searchQuery.trim() && (
        <div className="absolute top-full mt-1 left-0 w-[360px] bg-popover border border-border rounded-md shadow-lg z-50">
          <ScrollArea className="max-h-[320px]">
            {loadingContacts && filteredResults.length === 0 ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No events found for "{searchQuery}"
              </div>
            ) : (
              <div className="py-1">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
                </div>
                {filteredResults.map((event) => {
                  const startDate = safeParseISO(event.startTime);

                  return (
                    <button
                      key={event.id}
                      onClick={() => handleSelectEvent(event)}
                      className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors flex items-start gap-3"
                    >
                      {/* Calendar color indicator */}
                      <div
                        className="w-1 h-full min-h-[40px] rounded-full shrink-0"
                        style={{ backgroundColor: event.calendarColor || '#3b82f6' }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{event.title || 'Untitled'}</div>

                        {/* Date/Time */}
                        {startDate && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <CalendarIcon className="h-3 w-3" />
                            <span>{format(startDate, 'MMM d, yyyy')}</span>
                            <Clock className="h-3 w-3 ml-1" />
                            <span>{format(startDate, 'h:mm a')}</span>
                          </div>
                        )}

                        {/* Contact info */}
                        {event.contact && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="secondary" className="gap-1 font-normal">
                              <User className="h-3 w-3" />
                              {getContactDisplayName(event.contact)}
                            </Badge>
                            {event.contact.phone && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {event.contact.phone}
                              </span>
                            )}
                            {event.contact.email && (
                              <span className="flex items-center gap-1 text-muted-foreground truncate max-w-[140px]">
                                <Mail className="h-3 w-3 shrink-0" />
                                {event.contact.email}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Calendar name */}
                        {event.calendarName && (
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {event.calendarName}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
