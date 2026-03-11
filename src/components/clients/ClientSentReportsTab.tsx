import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  FileText, Loader2, Eye, EyeOff, Clock, Send, Plus, Trash2,
  BarChart3, PiggyBank, TrendingUp, FileBarChart, Inbox, CheckCircle2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ClientSentReportsTabProps {
  clientId: string;
  clientName: string;
}

const reportTypeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  investment: { label: 'Investment Report', icon: FileBarChart, color: 'bg-blue-500/10 text-blue-600' },
  portfolio: { label: 'Portfolio Review', icon: BarChart3, color: 'bg-emerald-500/10 text-emerald-600' },
  borrowing_capacity: { label: 'Borrowing Capacity', icon: PiggyBank, color: 'bg-amber-500/10 text-amber-600' },
  cash_flow: { label: 'Cash Flow Analysis', icon: TrendingUp, color: 'bg-purple-500/10 text-purple-600' },
};

function getReportConfig(type: string) {
  return reportTypeConfig[type] || { label: type, icon: FileText, color: 'bg-muted text-muted-foreground' };
}

export function ClientSentReportsTab({ clientId, clientName }: ClientSentReportsTabProps) {
  const queryClient = useQueryClient();
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [newReport, setNewReport] = useState({
    report_title: '',
    report_type: 'investment',
    report_tier: '',
    storage_path: '',
    notes: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['client-portal-reports', clientId],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'client_portal_reports',
          select: '*',
          filters: { client_id: clientId },
          orderBy: 'published_at',
          orderAsc: false,
        },
      });
      if (error) throw error;
      return data?.records || [];
    },
  });

  const reports = data || [];

  const handlePublish = async () => {
    if (!newReport.report_title.trim()) {
      toast.error('Report title is required');
      return;
    }

    setPublishing(true);
    try {
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_portal_reports',
        clientId,
        data: {
          report_title: newReport.report_title,
          report_type: newReport.report_type,
          report_tier: newReport.report_tier || null,
          storage_path: newReport.storage_path || null,
          notes: newReport.notes || null,
          published_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      toast.success('Report published to portal');
      setShowPublishDialog(false);
      setNewReport({ report_title: '', report_type: 'investment', report_tier: '', storage_path: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['client-portal-reports', clientId] });
    } catch (err: any) {
      toast.error('Failed to publish: ' + (err.message || 'Unknown error'));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    setDeleting(true);
    try {
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_portal_reports',
        clientId,
        recordId: reportToDelete.id,
      });
      if (error) throw error;
      toast.success('Report removed from client portal');
      setReportToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['client-portal-reports', clientId] });
    } catch (err: any) {
      toast.error('Failed to delete: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sent Reports</h3>
          <p className="text-xs text-muted-foreground">Reports published to {clientName}'s portal</p>
        </div>
        <Button size="sm" onClick={() => setShowPublishDialog(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Publish Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Send className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No reports have been sent to this client's portal yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report: any) => {
            const config = getReportConfig(report.report_type);
            const Icon = config.icon;
            return (
              <Card key={report.id}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.color} shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{report.report_title}</p>
                        {report.is_read ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                            Read
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <EyeOff className="h-2.5 w-2.5" />
                            Unread
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                        <span>•</span>
                        <Clock className="h-3 w-3" />
                        <span>{report.published_at ? formatDistanceToNow(new Date(report.published_at), { addSuffix: true }) : '—'}</span>
                      </div>
                      {report.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{report.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {report.published_at && format(new Date(report.published_at), 'dd MMM yyyy')}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setReportToDelete(report)}
                        title="Remove from portal"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!reportToDelete} onOpenChange={() => !deleting && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Report from Portal</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "<strong>{reportToDelete?.report_title}</strong>" from {clientName}'s portal. They will no longer be able to view or download it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Report to Portal</DialogTitle>
            <DialogDescription>This report will appear in {clientName}'s client portal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Report Title *</Label>
              <Input
                value={newReport.report_title}
                onChange={(e) => setNewReport(p => ({ ...p, report_title: e.target.value }))}
                placeholder="e.g., Investment Analysis - 123 Main St"
              />
            </div>
            <div>
              <Label>Report Type</Label>
              <Select value={newReport.report_type} onValueChange={(v) => setNewReport(p => ({ ...p, report_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="investment">Investment Report</SelectItem>
                  <SelectItem value="portfolio">Portfolio Review</SelectItem>
                  <SelectItem value="borrowing_capacity">Borrowing Capacity</SelectItem>
                  <SelectItem value="cash_flow">Cash Flow Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Storage Path (optional)</Label>
              <Input
                value={newReport.storage_path}
                onChange={(e) => setNewReport(p => ({ ...p, storage_path: e.target.value }))}
                placeholder="Path to PDF in storage bucket"
              />
            </div>
            <div>
              <Label>Note to Client (optional)</Label>
              <Textarea
                value={newReport.notes}
                onChange={(e) => setNewReport(p => ({ ...p, notes: e.target.value }))}
                placeholder="Brief message for the client..."
                rows={2}
              />
            </div>
            <Button onClick={handlePublish} disabled={publishing} className="w-full">
              {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Publish to Portal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
