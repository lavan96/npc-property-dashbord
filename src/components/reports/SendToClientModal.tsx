import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Search, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SendToClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportTitle: string;
  reportTier?: string;
  storagePath?: string | null;
  onGeneratePDF?: () => Promise<string | null>;
}

interface ClientOption {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  pipeline_status: string | null;
}

const tierLabels: Record<string, string> = {
  compass: "Investor's Compass",
  briefing: 'Executive Briefing',
  snapshot: 'Snapshot',
};

export function SendToClientModal({
  isOpen,
  onClose,
  reportId,
  reportTitle,
  reportTier,
  storagePath,
  onGeneratePDF,
}: SendToClientModalProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients-for-send'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction<{ success: boolean; clients: ClientOption[] }>('get-client-data', {
        listMode: true,
        listOptions: {
          select: 'id, primary_first_name, primary_surname, primary_email, pipeline_status',
          orderBy: 'primary_first_name',
          orderAsc: true,
        },
      });
      if (error) throw error;
      return data?.clients || [];
    },
    enabled: isOpen,
  });

  const filtered = clients.filter((c) => {
    const name = `${c.primary_first_name} ${c.primary_surname}`.toLowerCase();
    return name.includes(search.toLowerCase()) || (c.primary_email || '').toLowerCase().includes(search.toLowerCase());
  });

  const handleSend = async () => {
    if (!selectedClientId) {
      toast.error('Please select a client');
      return;
    }

    setSending(true);
    try {
      // If no PDF exists yet, generate it first
      let finalStoragePath = storagePath;
      if (!finalStoragePath && onGeneratePDF) {
        toast.info('Generating PDF before sending...');
        finalStoragePath = await onGeneratePDF();
        if (!finalStoragePath) {
          toast.error('PDF generation failed. Please try again.');
          setSending(false);
          return;
        }
      }

      if (!finalStoragePath) {
        toast.error('Unable to generate PDF. Please try downloading the PDF first.');
        setSending(false);
        return;
      }
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_portal_reports',
        clientId: selectedClientId,
        data: {
          report_title: reportTitle,
          report_type: 'investment',
          report_tier: reportTier || null,
          storage_path: finalStoragePath,
          source_report_id: reportId,
          notes: notes || null,
          published_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      setSent(true);
      toast.success('Report sent to client portal');

      setTimeout(() => {
        setSent(false);
        setSelectedClientId(null);
        setNotes('');
        setSearch('');
        onClose();
      }, 1500);
    } catch (err: any) {
      toast.error('Failed to send: ' + (err.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedClientId(null);
      setSearch('');
      setNotes('');
      setSent(false);
      onClose();
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send Report to Client
          </DialogTitle>
          <DialogDescription>
            Publish this {tierLabels[reportTier || ''] || 'investment'} report to a client's portal.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">Report sent successfully!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Report info */}
            <div className="rounded-md border bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium text-foreground truncate">{reportTitle}</p>
              <div className="flex gap-2">
                <Badge variant="secondary" className="text-xs">Investment Report</Badge>
                {reportTier && (
                  <Badge variant="outline" className="text-xs">{tierLabels[reportTier] || reportTier}</Badge>
                )}
              </div>
            </div>

            {/* PDF auto-generation notice */}
            {!storagePath && onGeneratePDF && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  The PDF will be automatically generated and uploaded when you send.
                </p>
              </div>
            )}

            {/* Client search */}
            <div className="space-y-2">
              <Label>Select Client</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-48 rounded-md border">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No clients found</p>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {filtered.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClientId(client.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors',
                          selectedClientId === client.id
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted'
                        )}
                      >
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {client.primary_first_name} {client.primary_surname}
                          </p>
                          {client.primary_email && (
                            <p className="text-xs text-muted-foreground truncate">{client.primary_email}</p>
                          )}
                        </div>
                        {selectedClientId === client.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Add a note for internal tracking..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending || !selectedClientId}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Send to {selectedClient ? selectedClient.primary_first_name : 'Client'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
