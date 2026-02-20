import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react';

interface GenerationLogEntry {
  id: string;
  listing_id: string;
  listing_address: string;
  switch_id: string | null;
  switch_name: string | null;
  report_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface GenerationLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GenerationLogModal = ({ open, onOpenChange }: GenerationLogModalProps) => {
  const [logs, setLogs] = useState<GenerationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open]);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('auto_report_generation_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (!error) {
      setLogs(data || []);
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
      case 'processing':
        return (
          <Badge variant="outline" className="text-amber-500 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            {status === 'pending' ? 'Pending' : 'Processing'}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] w-[95vw] sm:w-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Auto-Generation Log
          </DialogTitle>
          <DialogDescription>
            History of automatically generated investment reports
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="font-medium">No generation logs yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Auto-generated reports will appear here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Address</TableHead>
                    <TableHead className="hidden sm:table-cell">Switch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[100px]">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="max-w-[180px] sm:max-w-[200px]">
                        <div className="truncate text-sm">{log.listing_address}</div>
                        <div className="sm:hidden mt-1">
                          {log.switch_name ? (
                            <Badge variant="outline" className="text-xs">{log.switch_name}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {log.switch_name ? (
                          <Badge variant="outline">{log.switch_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {getStatusBadge(log.status)}
                          {log.error_message && (
                            <p className="text-xs text-destructive truncate max-w-[150px] sm:max-w-[200px]">
                              {log.error_message}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
