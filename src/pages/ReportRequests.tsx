import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { smartCapitalize } from '@/lib/nameUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import {
  Search, Loader2, Clock, ArrowRight, CheckCircle2, XCircle,
  BarChart3, PiggyBank, Building2, User, Send, Calendar,
  MessageSquare, Filter, Inbox, Mail, Phone, MapPin
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const requestTypeConfig: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
  portfolio_review: { label: 'Portfolio Review', icon: BarChart3, color: 'border border-emerald-300/25 bg-gradient-to-br from-emerald-400/20 via-emerald-500/10 to-teal-500/10 text-emerald-200 ring-1 ring-emerald-300/20' },
  borrowing_capacity: { label: 'Borrowing Capacity', icon: PiggyBank, color: 'border border-amber-300/25 bg-gradient-to-br from-amber-300/20 via-amber-500/10 to-orange-500/10 text-amber-200 ring-1 ring-amber-300/20' },
  investment_property: { label: 'Investment Property', icon: Building2, color: 'border border-blue-300/25 bg-gradient-to-br from-blue-400/20 via-blue-500/10 to-indigo-500/10 text-blue-200 ring-1 ring-blue-300/20' },
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string; badgeVariant: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-300', badgeVariant: 'border-amber-300/35 bg-amber-400/10 text-amber-100 shadow-amber-950/20' },
  in_progress: { label: 'In Progress', icon: ArrowRight, color: 'text-blue-300', badgeVariant: 'border-blue-300/35 bg-blue-400/10 text-blue-100 shadow-blue-950/20' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-300', badgeVariant: 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100 shadow-emerald-950/20' },
  declined: { label: 'Declined', icon: XCircle, color: 'text-red-300', badgeVariant: 'border-red-300/35 bg-red-400/10 text-red-100 shadow-red-950/20' },
};

const statusCardConfig: Record<string, { glow: string; iconWrap: string; edge: string; count: string; active: string }> = {
  pending: {
    glow: 'hover:shadow-[0_18px_48px_rgba(245,158,11,0.22)]',
    iconWrap: 'border-amber-300/25 bg-amber-300/10 text-amber-200 group-hover:bg-amber-300/20',
    edge: 'from-amber-300/0 via-amber-300/80 to-amber-300/0',
    count: 'text-amber-50',
    active: 'border-amber-300/55 ring-2 ring-amber-300/20 shadow-[0_18px_48px_rgba(245,158,11,0.2)]',
  },
  in_progress: {
    glow: 'hover:shadow-[0_18px_48px_rgba(59,130,246,0.22)]',
    iconWrap: 'border-blue-300/25 bg-blue-400/10 text-blue-200 group-hover:bg-blue-400/20',
    edge: 'from-blue-300/0 via-blue-300/80 to-amber-200/30',
    count: 'text-blue-50',
    active: 'border-blue-300/55 ring-2 ring-blue-300/20 shadow-[0_18px_48px_rgba(59,130,246,0.2)]',
  },
  completed: {
    glow: 'hover:shadow-[0_18px_48px_rgba(16,185,129,0.2)]',
    iconWrap: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200 group-hover:bg-emerald-400/20',
    edge: 'from-emerald-300/0 via-emerald-300/80 to-teal-200/30',
    count: 'text-emerald-50',
    active: 'border-emerald-300/55 ring-2 ring-emerald-300/20 shadow-[0_18px_48px_rgba(16,185,129,0.18)]',
  },
  declined: {
    glow: 'hover:shadow-[0_18px_48px_rgba(248,113,113,0.18)]',
    iconWrap: 'border-red-300/25 bg-red-400/10 text-red-200 group-hover:bg-red-400/20',
    edge: 'from-red-300/0 via-red-300/70 to-red-300/0',
    count: 'text-red-50',
    active: 'border-red-300/50 ring-2 ring-red-300/20 shadow-[0_18px_48px_rgba(248,113,113,0.16)]',
  },
};

interface ReportRequest {
  id: string;
  client_id: string;
  request_type: string;
  status: string;
  property_address: string | null;
  client_property_id: string | null;
  notes: string | null;
  admin_notes: string | null;
  assigned_to: string | null;
  fulfilled_report_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined from client lookup
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
}

export default function ReportRequests() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit: canEditRequests } = useModulePermissions('reports');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<ReportRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data: requestsData, isLoading, error } = useQuery({
    queryKey: ['report-requests-admin'],
    queryFn: async () => {
      // Fetch all report requests
      const { data, error } = await invokeSecureFunction<{ success: boolean; data: any[] }>('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'client_portal_report_requests',
          select: '*',
          orderBy: 'created_at',
          orderAsc: false,
          limit: 200,
        },
      });
      if (error) throw error;
      const requests = (data as any)?.records || (data as any)?.data || [];

      // Fetch client names for all unique client_ids — fetch them individually to avoid 500-limit issue
      const clientIds = [...new Set(requests.map((r: any) => r.client_id).filter(Boolean))];
      const clientMap: Record<string, { name: string; email: string | null; phone: string | null; address: string | null }> = {};
      
      if (clientIds.length > 0) {
        // Fetch each client by ID directly to avoid pagination limits
        const clientFetches = clientIds.map(async (cid: string) => {
          try {
            const { data: clientData } = await invokeSecureFunction('get-client-data', {
              clientId: cid,
              include: { properties: false, employment: false, income: false, expenses: false, assets: false, liabilities: false, deals: false, files: false, reminders: false, notes: false },
            });
            const c = (clientData as any)?.client;
            if (c) {
              const name = smartCapitalize(`${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim());
              clientMap[cid] = {
                name: name || 'Unnamed Client',
                email: c.primary_email || null,
                phone: c.primary_mobile || null,
                address: c.primary_current_address || null,
              };
            }
          } catch (e) {
            console.error(`Failed to fetch client ${cid}:`, e);
          }
        });
        await Promise.all(clientFetches);
      }
      
      return requests.map((r: any) => ({
        ...r,
        client_name: clientMap[r.client_id]?.name || 'Unknown Client',
        client_email: clientMap[r.client_id]?.email || null,
        client_phone: clientMap[r.client_id]?.phone || null,
        client_address: clientMap[r.client_id]?.address || null,
      }));
    },
    staleTime: 15000,
  });

  const requests = requestsData || [];

  // Auto-open a highlighted request from notification deep link
  const highlightId = searchParams.get('highlight');
  useEffect(() => {
    if (highlightId && requests.length > 0) {
      const target = requests.find((r: ReportRequest) => r.id === highlightId);
      if (target) {
        setSelectedRequest(target);
        setAdminNotes(target.admin_notes || '');
        // Clear the highlight param so refresh doesn't re-open
        searchParams.delete('highlight');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [highlightId, requests]);

  const filtered = requests.filter((r: ReportRequest) => {
    const matchesSearch = !search ||
      r.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.property_address?.toLowerCase().includes(search.toLowerCase()) ||
      r.notes?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesType = typeFilter === 'all' || r.request_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const counts = {
    pending: requests.filter((r: ReportRequest) => r.status === 'pending').length,
    in_progress: requests.filter((r: ReportRequest) => r.status === 'in_progress').length,
    completed: requests.filter((r: ReportRequest) => r.status === 'completed').length,
    declined: requests.filter((r: ReportRequest) => r.status === 'declined').length,
  };

  const handleStatusUpdate = async (requestId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'update',
        table: 'client_portal_report_requests',
        recordId: requestId,
        data: {
          status: newStatus,
          admin_notes: adminNotes.trim() || null,
        },
      });
      if (error) throw error;
      toast.success(`Request marked as ${newStatus.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['report-requests-admin'] });
      setSelectedRequest(null);
      setAdminNotes('');
    } catch (err: any) {
      toast.error('Failed to update: ' + (err.message || 'Unknown error'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505] p-4 shadow-2xl shadow-black/40 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.18),transparent_32%),radial-gradient(circle_at_85%_12%,rgba(59,130,246,0.12),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(24,24,27,0.94),rgba(9,9,11,0.88))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur sm:p-7">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200 shadow-inner shadow-amber-950/20">
                <Send className="h-3.5 w-3.5" />
                Portal Operations
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">Client Report Requests</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300/85 sm:text-base">Manage incoming report requests from portal clients</p>
            </div>
            <div className="rounded-2xl border border-amber-300/15 bg-black/25 px-4 py-3 text-sm text-zinc-400 shadow-inner shadow-black/30">
              <span className="text-2xl font-semibold tabular-nums text-amber-200">{requests.length}</span>
              <span className="ml-2">total requests</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(['pending', 'in_progress', 'completed', 'declined'] as const).map((status) => {
            const conf = statusConfig[status];
            const tile = statusCardConfig[status];
            const Icon = conf.icon;
            return (
              <Card
                key={status}
                className={cn(
                  'group relative cursor-pointer overflow-hidden border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.94),rgba(9,9,11,0.86))] shadow-lg shadow-black/25 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/35',
                  tile.glow,
                  statusFilter === status && tile.active
                )}
                onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              >
                <CardContent className="relative flex min-h-[132px] flex-col justify-between p-4 sm:p-5">
                  <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-70 transition-opacity group-hover:opacity-100', tile.edge)} />
                  <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/5 blur-2xl transition-opacity group-hover:opacity-80" />
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">{conf.label}</p>
                    <div className={cn('rounded-2xl border p-2.5 shadow-inner transition-all duration-300 group-hover:scale-105', tile.iconWrap)}>
                      <Icon className={cn('h-5 w-5', conf.color)} />
                    </div>
                  </div>
                  <div>
                    <p className={cn('text-4xl font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-5xl', tile.count)}>{counts[status]}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={cn('h-full w-10 rounded-full bg-gradient-to-r transition-all duration-300 group-hover:w-16', tile.edge)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(24,24,27,0.86),rgba(9,9,11,0.78))] p-3 shadow-xl shadow-black/25 backdrop-blur sm:p-4">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="group/search relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within/search:text-amber-200" />
              <Input
                placeholder="Search by client, property, or notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 rounded-2xl border-white/10 bg-black/45 pl-11 pr-4 text-sm text-zinc-100 shadow-inner shadow-black/30 placeholder:text-zinc-500 transition-all duration-200 hover:border-white/20 hover:bg-black/55 focus-visible:border-amber-300/55 focus-visible:ring-2 focus-visible:ring-amber-300/20"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger
                className={cn(
                  'h-12 w-full rounded-2xl border-white/10 bg-black/45 px-4 text-sm font-medium text-zinc-100 shadow-inner shadow-black/30 transition-all duration-200 hover:border-white/20 hover:bg-black/55 focus:border-amber-300/55 focus:ring-2 focus:ring-amber-300/20 lg:w-60',
                  typeFilter !== 'all' && 'border-amber-300/35 bg-amber-300/10 text-amber-100'
                )}
              >
                <Filter className="mr-2 h-3.5 w-3.5 text-amber-200" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="overflow-hidden rounded-2xl border-white/10 bg-zinc-950/95 p-1 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl">
                <SelectItem className="rounded-xl font-medium focus:bg-amber-300/10 focus:text-amber-100" value="all">All Types</SelectItem>
                <SelectItem className="rounded-xl focus:bg-amber-300/10 focus:text-amber-100" value="portfolio_review">Portfolio Review</SelectItem>
                <SelectItem className="rounded-xl focus:bg-amber-300/10 focus:text-amber-100" value="borrowing_capacity">Borrowing Capacity</SelectItem>
                <SelectItem className="rounded-xl focus:bg-amber-300/10 focus:text-amber-100" value="investment_property">Investment Property</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Request List */}
        {isLoading ? (
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(24,24,27,0.82),rgba(9,9,11,0.78))] p-4 shadow-xl shadow-black/25">
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-black/25 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-amber-200" />
            </div>
          </div>
        ) : error ? (
          <Card className="overflow-hidden border-red-400/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.24),rgba(9,9,11,0.84))] shadow-xl shadow-black/25">
            <CardContent className="py-12 text-center">
              <XCircle className="mx-auto mb-3 h-12 w-12 text-red-300/70" />
              <p className="font-medium text-red-100">Unable to load report requests.</p>
              <p className="mt-1 text-sm text-red-200/70">{(error as Error).message || 'Please try again shortly.'}</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="overflow-hidden border-white/10 bg-[linear-gradient(135deg,rgba(24,24,27,0.82),rgba(9,9,11,0.78))] shadow-xl shadow-black/25">
            <CardContent className="py-14 text-center">
              <Inbox className="mx-auto mb-3 h-12 w-12 text-amber-200/40" />
              <p className="text-zinc-400">
                {requests.length === 0 ? 'No report requests yet.' : 'No requests match your filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(24,24,27,0.82),rgba(9,9,11,0.78))] p-3 shadow-xl shadow-black/25 sm:p-4">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/30 to-transparent" />
            <div className="space-y-3 sm:space-y-4">
              {filtered.map((req: ReportRequest) => {
                const typeConf = requestTypeConfig[req.request_type] || requestTypeConfig.portfolio_review;
                const statConf = statusConfig[req.status] || statusConfig.pending;
                const TypeIcon = typeConf.icon;
                return (
                  <Card
                    key={req.id}
                    className="group cursor-pointer overflow-hidden border-white/10 bg-[linear-gradient(145deg,rgba(24,24,27,0.94),rgba(9,9,11,0.86))] shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-zinc-900/80 hover:shadow-[0_20px_52px_rgba(245,158,11,0.14)]"
                    onClick={() => { setSelectedRequest(req); setAdminNotes(req.admin_notes || ''); }}
                  >
                    <CardContent className="relative p-4 sm:p-5">
                      <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-amber-300/0 transition-colors duration-300 group-hover:bg-amber-300/80" />
                      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      <div className="flex items-start gap-4">
                        <div className={cn('shrink-0 rounded-2xl p-3.5 shadow-inner shadow-black/20 transition-transform duration-300 group-hover:scale-105', typeConf.color)}>
                          <TypeIcon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold tracking-tight text-white sm:text-base">{typeConf.label}</p>
                                <Badge variant="outline" className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm backdrop-blur', statConf.badgeVariant)}>
                                  {statConf.label}
                                </Badge>
                              </div>
                              <div className="grid gap-1.5 text-xs leading-5 text-zinc-400">
                                <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-amber-200/75" /><span className="capitalize font-medium text-zinc-100">{req.client_name}</span></div>
                                {req.client_email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-zinc-500" /><span className="break-all">{req.client_email}</span></div>}
                                {req.client_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-zinc-500" /><span>{req.client_phone}</span></div>}
                                {req.property_address && <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-zinc-500" /><span>{req.property_address}</span></div>}
                                {req.notes && <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-zinc-300"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/60" /><span className="line-clamp-2">{req.notes}</span></div>}
                              </div>
                            </div>
                            <div className="shrink-0 self-start rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-left shadow-inner shadow-black/25 sm:text-right">
                              <p className="text-xs font-medium tabular-nums text-zinc-200">{format(new Date(req.created_at), 'dd MMM yyyy')}</p>
                              <p className="mt-0.5 text-[10px] text-zinc-500">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail / Action Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="max-h-[min(calc(100vh-2rem),760px)] overflow-y-auto border-amber-300/25 bg-[linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.96))] p-0 text-zinc-100 shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:max-w-xl sm:rounded-3xl [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:border [&>button]:border-white/10 [&>button]:bg-black/35 [&>button]:text-zinc-300 [&>button]:opacity-100 [&>button]:shadow-inner [&>button]:shadow-black/30 [&>button]:transition-all [&>button:hover]:border-amber-300/40 [&>button:hover]:bg-amber-300/10 [&>button:hover]:text-amber-100 [&>button:focus-visible]:ring-amber-300/40">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
          <DialogHeader className="border-b border-white/10 bg-white/[0.02] px-6 pb-5 pt-6 text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-[-0.02em] text-white">
              <span className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-2 text-amber-200 shadow-inner shadow-black/20">
                <Send className="h-4 w-4" />
              </span>
              Report Request Details
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm leading-6 text-zinc-400">Review and manage this client report request.</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">

          {selectedRequest && (() => {
            const typeConf = requestTypeConfig[selectedRequest.request_type] || requestTypeConfig.portfolio_review;
            const statConf = statusConfig[selectedRequest.status] || statusConfig.pending;
            const TypeIcon = typeConf.icon;
            return (
              <div className="space-y-4">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className={cn('rounded-2xl p-3 shadow-inner shadow-black/20', typeConf.color)}><TypeIcon className="h-5 w-5" /></div>
                    <div>
                      <p className="text-sm font-semibold text-white">{typeConf.label}</p>
                      <Badge variant="outline" className={cn('mt-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm backdrop-blur', statConf.badgeVariant)}>{statConf.label}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-amber-200/70" /><span className="text-zinc-400">Client:</span><span className="font-medium capitalize text-white">{selectedRequest.client_name}</span></div>
                    {selectedRequest.client_email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Email:</span><span className="font-medium text-white">{selectedRequest.client_email}</span></div>}
                    {selectedRequest.client_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Phone:</span><span className="font-medium text-white">{selectedRequest.client_phone}</span></div>}
                    {selectedRequest.client_address && <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Address:</span><span className="font-medium text-white">{selectedRequest.client_address}</span></div>}
                    <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Requested:</span><span className="font-medium text-white">{format(new Date(selectedRequest.created_at), 'dd MMM yyyy, HH:mm')}</span></div>
                    {selectedRequest.property_address && <div className="flex items-start gap-2"><Building2 className="mt-0.5 h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Property:</span><span className="font-medium text-white">{selectedRequest.property_address}</span></div>}
                    {selectedRequest.notes && <div className="flex items-start gap-2"><MessageSquare className="mt-0.5 h-3.5 w-3.5 text-zinc-500" /><span className="text-zinc-400">Client notes:</span><span className="text-white">{selectedRequest.notes}</span></div>}
                  </div>
                </div>

                {/* Admin Notes */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-zinc-200">Admin Notes</Label>
                  <Textarea
                    placeholder="Add internal notes or a response to the client..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    className="rounded-2xl border-white/10 bg-black/40 text-zinc-100 placeholder:text-zinc-600 transition-all focus-visible:border-amber-300/50 focus-visible:ring-amber-300/20"
                  />
                </div>

                {/* Status Selector */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-zinc-200">Update Status</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['pending', 'in_progress', 'completed', 'declined'] as const).map((status) => {
                      const conf = statusConfig[status];
                      const Icon = conf.icon;
                      const isActive = selectedRequest.status === status;
                      return (
                        <Button
                          key={status}
                          size="sm"
                          variant={isActive ? 'default' : 'outline'}
                          disabled={updatingStatus || isActive}
                          onClick={() => handleStatusUpdate(selectedRequest.id, status)}
                          className={cn(
                            'rounded-full border-white/10 px-3 text-xs font-medium transition-all hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100',
                            isActive && conf.badgeVariant,
                            isActive && 'pointer-events-none shadow-sm'
                          )}
                        >
                          {updatingStatus ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}
                          {conf.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}