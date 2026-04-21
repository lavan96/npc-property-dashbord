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

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getAvatarColor(name?: string): string {
  if (!name) return 'hsl(var(--primary))';
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hues = [25, 45, 200, 260, 330, 150, 10, 280]; // warm gold-biased palette
  return `hsl(${hues[hash % hues.length]}, 55%, 50%)`;
}

function PermissionBar({ granted, total }: { granted: number; total: number }) {
  const pct = total === 0 ? 0 : (granted / total) * 100;
  return (
    <div className="flex items-center gap-2 w-full max-w-[140px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-medium tabular-nums whitespace-nowrap">
        {granted}/{total}
      </span>
    </div>
  );
}

function ClientCardSkeleton() {
  return (
    <div className="flex items-center gap-4 border border-border/50 rounded-xl p-4">
      <Skeleton className="h-11 w-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-1.5 w-28 rounded-full" />
      </div>
      <Skeleton className="h-8 w-28 rounded-lg" />
    </div>
  );
}

export default function FinancePortalClients() {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
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

  const filtered = useMemo(() => {
    let list = [...records];
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (r: any) =>
          (r.client?.primary_contact_name || '').toLowerCase().includes(s) ||
          (r.client?.secondary_contact_name || '').toLowerCase().includes(s) ||
          (r.client?.primary_contact_email || '').toLowerCase().includes(s)
      );
    }
    list.sort((a: any, b: any) => {
      if (sortKey === 'name') {
        return (a.client?.primary_contact_name || '').localeCompare(
          b.client?.primary_contact_name || ''
        );
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
  }, [records, search, sortKey]);

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

  // Focus search on keyboard shortcut
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
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-foreground">
            <div className="p-2 rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            My Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 ml-[42px]">
            {isLoading
              ? 'Loading your assigned clients…'
              : `${records.length} client${records.length !== 1 ? 's' : ''} assigned to you`}
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'relative flex items-center transition-all duration-300 rounded-xl border bg-card',
              searchFocused
                ? 'w-full sm:w-80 border-primary/40 shadow-md shadow-primary/5'
                : 'w-full sm:w-64 border-border/60'
            )}
          >
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              placeholder="Search clients… ⌘K"
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
                  onClick={() => {
                    setSearch('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 p-1 rounded-md hover:bg-muted transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Count Badge */}
          {search && (
            <Badge
              variant="secondary"
              className="shrink-0 tabular-nums font-medium"
            >
              {filtered.length}
            </Badge>
          )}

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5 rounded-xl">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{sortLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => setSortKey('name')}
                className={cn(sortKey === 'name' && 'text-primary font-medium')}
              >
                <SortAsc className="h-4 w-4 mr-2" /> Name
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortKey('date')}
                className={cn(sortKey === 'date' && 'text-primary font-medium')}
              >
                <Clock className="h-4 w-4 mr-2" /> Date Assigned
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortKey('status')}
                className={cn(sortKey === 'status' && 'text-primary font-medium')}
              >
                <UserCheck className="h-4 w-4 mr-2" /> Status
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cards List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ClientCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Illustrated Empty State */
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
                : `No clients match "${search}". Try a different search term.`}
            </p>
            {search && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch('')}
                className="mt-4 gap-1.5"
              >
                <X className="h-3.5 w-3.5" /> Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((r: any, idx: number) => {
              const name = r.client?.primary_contact_name || '—';
              const perms = r.permissions || {};
              const grantedTables = Object.entries(perms).filter(
                ([_, p]: any) => p?.view
              ).length;
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
                    className="group flex items-center gap-4 border border-border/50 rounded-xl p-4 hover:border-primary/20 hover:bg-primary/[0.02] hover:shadow-md hover:shadow-primary/5 transition-all duration-200 cursor-pointer"
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {name}
                        </span>
                        {r.client?.secondary_contact_name && (
                          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                            & {r.client.secondary_contact_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.client?.primary_contact_email || ''}
                        {r.client?.primary_contact_phone &&
                          ` · ${r.client.primary_contact_phone}`}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] capitalize px-1.5 py-0"
                        >
                          {status}
                        </Badge>
                        <PermissionBar granted={grantedTables} total={totalTables} />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openClientPortal(r.client_id, true);
                        }}
                        disabled={isBusy}
                        title="Open this client's portal in a new tab (read-only)"
                        className="gap-1.5 rounded-lg text-xs hidden sm:flex"
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
