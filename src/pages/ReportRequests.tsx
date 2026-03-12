import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, Loader2, Clock, ArrowRight, CheckCircle2, XCircle,
  BarChart3, PiggyBank, Building2, User, Send, Calendar,
  MessageSquare, Filter, Inbox
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const requestTypeConfig: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
  portfolio_review: { label: 'Portfolio Review', icon: BarChart3, color: 'bg-emerald-500/10 text-emerald-600' },
  borrowing_capacity: { label: 'Borrowing Capacity', icon: PiggyBank, color: 'bg-amber-500/10 text-amber-600' },
  investment_property: { label: 'Investment Property', icon: Building2, color: 'bg-blue-500/10 text-blue-600' },
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string; badgeVariant: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-600', badgeVariant: 'bg-amber-500/10 text-amber-600 border-amber-200' },
  in_progress: { label: 'In Progress', icon: ArrowRight, color: 'text-blue-600', badgeVariant: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-600', badgeVariant: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  declined: { label: 'Declined', icon: XCircle, color: 'text-red-600', badgeVariant: 'bg-red-500/10 text-red-600 border-red-200' },
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
}

export default function ReportRequests() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<ReportRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data: requestsData, isLoading } = useQuery({
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
      const requests = data?.records || data?.data || [];

      // Fetch client names for all unique client_ids
      const clientIds = [...new Set(requests.map((r: any) => r.client_id))];
      if (clientIds.length > 0) {
        const { data: clientsData } = await invokeSecureFunction('get-client-data', {
          clientIds,
          include: { client: true },
        });
        const clientMap: Record<string, string> = {};
        if (clientsData?.clients) {
          for (const c of clientsData.clients) {
            clientMap[c.id] = `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim();
          }
        }
        return requests.map((r: any) => ({
          ...r,
          client_name: clientMap[r.client_id] || 'Unknown Client',
        }));
      }
      return requests;
    },
    staleTime: 15000,
  });

  const requests = requestsData || [];

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Report Requests</h1>
        <p className="text-muted-foreground mt-1">Manage incoming report requests from portal clients</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['pending', 'in_progress', 'completed', 'declined'] as const).map((status) => {
          const conf = statusConfig[status];
          const Icon = conf.icon;
          return (
            <Card
              key={status}
              className={cn('cursor-pointer transition-all hover:shadow-md', statusFilter === status && 'ring-2 ring-primary/20')}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{counts[status]}</p>
                    <p className="text-xs text-muted-foreground">{conf.label}</p>
                  </div>
                  <Icon className={cn('h-5 w-5', conf.color)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client, property, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="portfolio_review">Portfolio Review</SelectItem>
            <SelectItem value="borrowing_capacity">Borrowing Capacity</SelectItem>
            <SelectItem value="investment_property">Investment Property</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Request List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {requests.length === 0 ? 'No report requests yet.' : 'No requests match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req: ReportRequest) => {
            const typeConf = requestTypeConfig[req.request_type] || requestTypeConfig.portfolio_review;
            const statConf = statusConfig[req.status] || statusConfig.pending;
            const TypeIcon = typeConf.icon;
            return (
              <Card
                key={req.id}
                className="hover:shadow-md transition-all cursor-pointer"
                onClick={() => { setSelectedRequest(req); setAdminNotes(req.admin_notes || ''); }}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={cn('p-2.5 rounded-xl shrink-0', typeConf.color)}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{typeConf.label}</p>
                            <Badge variant="outline" className={cn('text-[10px]', statConf.badgeVariant)}>
                              {statConf.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>{req.client_name}</span>
                          </div>
                          {req.property_address && (
                            <p className="text-xs text-muted-foreground mt-1">📍 {req.property_address}</p>
                          )}
                          {req.notes && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">💬 {req.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.created_at), 'dd MMM yyyy')}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail / Action Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Report Request Details
            </DialogTitle>
            <DialogDescription>Review and manage this client report request.</DialogDescription>
          </DialogHeader>

          {selectedRequest && (() => {
            const typeConf = requestTypeConfig[selectedRequest.request_type] || requestTypeConfig.portfolio_review;
            const statConf = statusConfig[selectedRequest.status] || statusConfig.pending;
            const TypeIcon = typeConf.icon;
            return (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', typeConf.color)}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{typeConf.label}</p>
                      <Badge variant="outline" className={cn('text-[10px] mt-0.5', statConf.badgeVariant)}>
                        {statConf.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Client:</span>
                      <span className="font-medium text-foreground">{selectedRequest.client_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Requested:</span>
                      <span className="font-medium text-foreground">
                        {format(new Date(selectedRequest.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </div>
                    {selectedRequest.property_address && (
                      <div className="flex items-start gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                        <span className="text-muted-foreground">Property:</span>
                        <span className="font-medium text-foreground">{selectedRequest.property_address}</span>
                      </div>
                    )}
                    {selectedRequest.notes && (
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                        <span className="text-muted-foreground">Client notes:</span>
                        <span className="text-foreground">{selectedRequest.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Notes */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Admin Notes</Label>
                  <Textarea
                    placeholder="Add internal notes or a response to the client..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedRequest.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(selectedRequest.id, 'in_progress')}
                        disabled={updatingStatus}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {updatingStatus ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
                        Mark In Progress
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleStatusUpdate(selectedRequest.id, 'declined')}
                        disabled={updatingStatus}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Decline
                      </Button>
                    </>
                  )}
                  {selectedRequest.status === 'in_progress' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(selectedRequest.id, 'completed')}
                        disabled={updatingStatus}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {updatingStatus ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                        Mark Completed
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleStatusUpdate(selectedRequest.id, 'declined')}
                        disabled={updatingStatus}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Decline
                      </Button>
                    </>
                  )}
                  {(selectedRequest.status === 'completed' || selectedRequest.status === 'declined') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusUpdate(selectedRequest.id, 'pending')}
                      disabled={updatingStatus}
                    >
                      <Clock className="h-3.5 w-3.5 mr-1.5" />
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
