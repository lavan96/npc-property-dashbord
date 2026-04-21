import { useMemo, useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Search, Users, Loader2, ExternalLink, X,
  ArrowUpDown, UserCheck, Clock, SortAsc,
  ChevronRight, Shield, UserX
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type SortKey = 'name' | 'date' | 'status';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  lead: 'bg-amber-500',
  prospect: 'bg-blue-500',
  inactive: 'bg-zinc-400',
  nurture: 'bg-purple-500',
  settled: 'bg-emerald-600',
  'under contract': 'bg-sky-500',
};

const STATUS_DOT_RING: Record<string, string> = {
  active: 'ring-emerald-500/30',
  lead: 'ring-amber-500/30',
  prospect: 'ring-blue-500/30',
  inactive: 'ring-zinc-400/30',
  nurture: 'ring-purple-500/30',
  settled: 'ring-emerald-600/30',
  'under contract': 'ring-sky-500/30',
};

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getAvatarColor(name?: string): string {
  if (!name) return 'hsl(var(--primary))';
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hues = [25, 45, 200, 260, 330, 150, 10, 280];
  return `hsl(${hues[hash % hues.length]}, 55%, 50%)`;
}

function PermissionBar({ granted, total }: { granted: number; total: number }) {
  const pct = total === 0 ? 0 : (granted / total) * 100;
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[140px] sm:max-w-[140px]">
      <div className="flex-1 h-2 sm:h-1.5 rounded-full bg-muted overflow-hidden min-w-[40px]">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-medium tabular-nums shrink-0">
        {granted}/{total}
      </span>
    </div>
  );
}

function ClientCardSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border border-border/50 rounded-xl p-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <Skeleton className="h-11 w-11 rounded-full shrink-0" />
        <div className="space-y-2 flex-1 sm:hidden">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <div className="hidden sm:block flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-1.5 w-28 rounded-full" />
      </div>
      <Skeleton className="h-8 w-full sm:w-28 rounded-lg" />
    </div>
  );
}

export default function FinancePortalClients() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [handoffBusyId, setHandoffBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['finance-portal-clients-list'],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_assigned_clients',
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const records = data?.records || [];

  // Extract unique statuses for filter chips
  const statusOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r: any) => {
      const s = (r.client?.status || 'active').toLowerCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({ status, count }));
  }, [records]);

  const filtered = useMemo(() => {
    let list = [...records];

    // Status filter
    if (statusFilter) {
      list = list.filter((r: any) => (r.client?.status || 'active').toLowerCase() === statusFilter);
    }

    // Text search
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (r: any) =>
          (r.client?.primary_contact_name || '').toLowerCase().includes(s) ||
          (r.client?.secondary_contact_name || '').toLowerCase().includes(s) ||
          (r.client?.primary_contact_email || '').toLowerCase().includes(s)
      );
    }

    // Sort
    list.sort((a: any, b: any) => {
      if (sortKey === 'name') {
        return (a.client?.primary_contact_name || '').localeCompare(b.client?.primary_contact_name || '');
      }
      if (sortKey === 'date') {
        return (b.assigned_at || '').localeCompare(a.assigned_at || '');
      }
      if (sortKey === 'status') {
        return (a.client?.status || '').localeCompare(b.client?.status || '');
      }
      return 0;
    });
    return list;
  }, [records, search, sortKey, statusFilter]);

  const openClientPortal = async (clientId: string, readonly = true) => {
    setHandoffBusyId(clientId);
    try {
      const { data, error } = await invokeFinanceFunction('finance-portal-handoff-create', {
        client_id: clientId,
        readonly,
      });
      if (error || !data?.success || !data?.token) {
        throw new Error(data?.error || error?.message || 'Failed to create handoff link');
      }
      const url = `${window.location.origin}/client/handoff?token=${encodeURIComponent(data.token)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e?.message || 'Could not open client portal view');
    } finally {
      setHandoffBusyId(null);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const sortLabel = sortKey === 'name' ? 'Name' : sortKey === 'date' ? 'Date Assigned' : 'Status';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2.5 text-foreground">
          <div className="p-2 rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          My Clients
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 ml-[42px]">
          {isLoading
            ? 'Loading your assigned clients\u2026'
            : `${records.length} client${records.length !== 1 ? 's' : ''} assigned to you`}
        </p>
      </div>

      {/* Search + Sort row */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'relative flex items-center flex-1 transition-all duration-300 rounded-xl border bg-card',
              searchFocused
                ? 'border-primary/40 shadow-md shadow-primary/5'
                : 'border-border/60'
            )}
          >
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              placeholder="Search clients\u2026 \u2318K"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="pl-9 pr-8 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => { setSearch(''); inputRef.current?.focus(); }}
                  className="absolute right-2 p-1 rounded-md hover:bg-muted transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {(search || statusFilter) && (
            <Badge variant="secondary" className="shrink-0 tabular-nums font-medium">
              {filtered.length}
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-xl">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{sortLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem onClick={() => setSortKey('name')} className={cn(sortKey === 'name' && 'text-primary font-medium')}>
                <SortAsc className="h-4 w-4 mr-2" /> Name
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey('date')} className={cn(sortKey === 'date' && 'text-primary font-medium')}>
                <Clock className="h-4 w-4 mr-2" /> Date Assigned
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey('status')} className={cn(sortKey === 'status' && 'text-primary font-medium')}>
                <UserCheck className="h-4 w-4 mr-2" /> Status
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status filter chips */}
        {statusOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStatusFilter(null)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 touch-manipulation',
                statusFilter === null
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              All
              <span className={cn(
                'tabular-nums text-[10px] px-1 rounded-full min-w-[18px] text-center',
                statusFilter === null ? 'bg-primary-foreground/20' : 'bg-background/60'
              )}>
                {records.length}
              </span>
            </button>
            {statusOptions.map(({ status, count }) => {
              const isActive = statusFilter === status;
              const dotColor = STATUS_COLORS[status] || 'bg-zinc-400';
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(isActive ? null : status)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all duration-200 touch-manipulation',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full shrink-0', dotColor)} />
                  {status}
                  <span className={cn(
                    'tabular-nums text-[10px] px-1 rounded-full min-w-[18px] text-center',
                    isActive ? 'bg-primary-foreground/20' : 'bg-background/60'
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cards List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ClientCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-5 rounded-full bg-primary/5 mb-4">
              {records.length === 0 ? (
                <UserX className="h-12 w-12 text-primary/30" />
              ) : (
                <Search className="h-12 w-12 text-primary/30" />
              )}
            </div>
            <h3 className="font-semibold text-lg text-foreground mb-1">
              {records.length === 0 ? 'No clients assigned yet' : 'No matches found'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {records.length === 0
                ? 'Once NPC assigns clients to your finance partner account, they\u2019ll appear here.'
                : `No clients match your current filters. Try adjusting your search or status filter.`}
            </p>
            {(search || statusFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setStatusFilter(null); }}
                className="mt-4 gap-1.5"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((r: any, idx: number) => {
              const name = r.client?.primary_contact_name || '\u2014';
              const perms = r.permissions || {};
              const grantedTables = Object.entries(perms).filter(([_, p]: any) => p?.view).length;
              const totalTables = 12;
              const status = (r.client?.status || 'active').toLowerCase();
              const statusColor = STATUS_COLORS[status] || 'bg-zinc-400';
              const isBusy = handoffBusyId === r.client_id;
              const avatarBg = getAvatarColor(name);

              return (
                <motion.div
                  key={r.assignment_id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                >
                  <div
                    className={cn(
                      'group border border-border/50 rounded-xl transition-all duration-200 cursor-pointer touch-manipulation',
                      'hover:border-primary/20 hover:bg-primary/[0.02] hover:shadow-md hover:shadow-primary/5',
                      'active:scale-[0.99] active:bg-primary/[0.03]',
                      /* Mobile: stacked layout with generous tap target. Desktop: row layout */
                      'flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-4',
                      'min-h-[72px] sm:min-h-0'
                    )}
                    onClick={() => navigate(`/finance/clients/${r.client_id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/finance/clients/${r.client_id}`);
                      }
                    }}
                  >
                    {/* Top row on mobile: avatar + name + chevron */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      {/* Avatar with status dot */}
                      <div className="relative shrink-0">
                        <Avatar className="h-11 w-11 border-2 border-border/30">
                          <AvatarFallback
                            className="font-semibold text-sm text-white"
                            style={{ backgroundColor: avatarBg }}
                          >
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
                            statusColor
                          )}
                          title={status}
                        />
                      </div>

                      {/* Name & contact info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground break-words">
                            {name}
                          </span>
                          {r.client?.secondary_contact_name && (
                            <span className="text-xs text-muted-foreground break-words">
                              & {r.client.secondary_contact_name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 break-all">
                          {r.client?.primary_contact_email || ''}
                          {r.client?.primary_contact_phone && (
                            <span className="hidden xs:inline"> \u00b7 {r.client.primary_contact_phone}</span>
                          )}
                        </div>
                        {/* Phone on its own line for very small screens */}
                        {r.client?.primary_contact_phone && (
                          <div className="text-xs text-muted-foreground xs:hidden">
                            {r.client.primary_contact_phone}
                          </div>
                        )}
                      </div>

                      {/* Chevron - visible on mobile inline */}
                      <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 sm:hidden" />
                    </div>

                    {/* Bottom row on mobile: badges + permission bar */}
                    <div className="flex items-center justify-between gap-3 sm:contents pl-14 sm:pl-0">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0 shrink-0">
                          {status}
                        </Badge>
                        <PermissionBar granted={grantedTables} total={totalTables} />
                      </div>

                      {/* Desktop actions */}
                      <div className="hidden sm:flex items-center gap-2 shrink-0 relative z-10">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); openClientPortal(r.client_id, true); }}
                          onPointerDown={(e) => e.stopPropagation()}
                          disabled={isBusy}
                          title="Open this client\u2019s portal in a new tab (read-only)"
                          className="gap-1.5 rounded-lg text-xs"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          View as client
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && records.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/40 pt-2">
          <Shield className="h-3 w-3" />
          <span>Data access governed by NPC permission policies</span>
        </div>
      )}
    </div>
  );
}
