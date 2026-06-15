/**
 * EnvelopeStatusDialog — DocuSign envelope status, signer progress, and audit trail.
 * Works for both agency_agreements and generated_documents.
 */
import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FlattenPdfIconButton } from '@/components/common/FlattenPdfIconButton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, RefreshCw, CheckCircle2, Clock, Mail, Eye, XCircle, AlertTriangle, FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { invokeSecureFunction } from '@/lib/secureInvoke';

interface Signer {
  name: string; email: string; status: string; routingOrder: string;
  sentAt?: string; deliveredAt?: string; signedAt?: string; declinedReason?: string;
}
interface AuditEvent { action: string; description: string; user: string; email: string; timestamp: string; }
interface Envelope {
  envelopeId: string; status: string; emailSubject?: string;
  sentDateTime?: string; statusChangedDateTime?: string; completedDateTime?: string;
  voidedDateTime?: string; voidedReason?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: 'agreement' | 'document';
  recordId: string;
  title?: string;
  onStatusRefreshed?: (mappedStatus: string) => void;
}

const STATUS_TONE: Record<string, { tone: string; icon: any; label: string }> = {
  sent: { tone: 'bg-blue-500/10 text-blue-700 border-blue-500/30', icon: Mail, label: 'Sent' },
  delivered: { tone: 'bg-purple-500/10 text-purple-700 border-purple-500/30', icon: Eye, label: 'Delivered' },
  completed: { tone: 'bg-green-500/10 text-green-700 border-green-500/30', icon: CheckCircle2, label: 'Completed' },
  signed: { tone: 'bg-green-500/10 text-green-700 border-green-500/30', icon: CheckCircle2, label: 'Signed' },
  declined: { tone: 'bg-red-500/10 text-red-700 border-red-500/30', icon: XCircle, label: 'Declined' },
  voided: { tone: 'bg-red-500/10 text-red-700 border-red-500/30', icon: AlertTriangle, label: 'Voided' },
  created: { tone: 'bg-muted text-muted-foreground border-border', icon: Clock, label: 'Created' },
  autoresponded: { tone: 'bg-amber-500/10 text-amber-700 border-amber-500/30', icon: AlertTriangle, label: 'Bounced' },
};

export function DocuSignStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const key = status.toLowerCase();
  const cfg = STATUS_TONE[key] || { tone: 'bg-muted text-muted-foreground border-border', icon: Clock, label: status };
  const Icon = cfg.icon;
  return (
    <Badge className={`text-[10px] border gap-1 ${cfg.tone} capitalize`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}
const StatusBadge = DocuSignStatusBadge;

function fmt(ts?: string) { return ts ? format(new Date(ts), 'dd MMM yy HH:mm') : '—'; }

export function EnvelopeStatusDialog({ open, onOpenChange, scope, recordId, title, onStatusRefreshed }: Props) {
  const [loading, setLoading] = useState(false);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadSigned = useCallback(async () => {
    setDownloading(true);
    try {
      const fn = scope === 'agreement' ? 'manage-agency-agreements' : 'manage-generated-documents';
      const payload = scope === 'agreement'
        ? { action: 'download_signed', agreement_id: recordId }
        : { action: 'download_signed', id: recordId };
      const { data, error: invErr } = await invokeSecureFunction<any>(fn, payload);
      if (invErr) throw new Error(invErr.message);
      if (!data?.success) throw new Error(data?.error || 'Download failed');
      const bin = atob(data.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename || 'signed.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Signed PDF downloaded');
    } catch (e: any) {
      toast.error(e.message);
    } finally { setDownloading(false); }
  }, [scope, recordId]);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const fn = scope === 'agreement' ? 'manage-agency-agreements' : 'manage-generated-documents';
      const payload = scope === 'agreement'
        ? { action: 'envelope_details', agreement_id: recordId }
        : { action: 'envelope_details', id: recordId };
      const { data, error: invErr } = await invokeSecureFunction<any>(fn, payload);
      if (invErr) throw new Error(invErr.message);
      if (!data?.success && data?.error) throw new Error(data.error);
      setEnvelope(data.envelope);
      setSigners(data.signers || []);
      setEvents(data.events || []);
      if (data.mapped_status) onStatusRefreshed?.(data.mapped_status);
    } catch (e: any) {
      setError(e.message); toast.error(e.message);
    } finally { setLoading(false); }
  }, [scope, recordId, onStatusRefreshed]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-8 flex-wrap">
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{title || 'Envelope Status'}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {envelope?.status === 'completed' && (
                <>
                  <Button size="sm" variant="default" onClick={downloadSigned} disabled={downloading} className="gap-1">
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download Signed PDF
                  </Button>
                  <FlattenPdfIconButton
                    getPdfBlob={async () => {
                      const fn = scope === 'agreement' ? 'manage-agency-agreements' : 'manage-generated-documents';
                      const payload = scope === 'agreement'
                        ? { action: 'download_signed', agreement_id: recordId }
                        : { action: 'download_signed', id: recordId };
                      const { data, error: invErr } = await invokeSecureFunction<any>(fn, payload);
                      if (invErr) throw new Error(invErr.message);
                      if (!data?.success) throw new Error(data?.error || 'Download failed');
                      const bin = atob(data.pdf_base64);
                      const bytes = new Uint8Array(bin.length);
                      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                      return new Blob([bytes], { type: 'application/pdf' });
                    }}
                    filename={title ? `${title.replace(/\s+/g, '_')}-signed.pdf` : 'signed.pdf'}
                    disabled={downloading}
                  />
                </>
              )}
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="gap-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}

          {envelope && (
            <div className="space-y-1 rounded-md border p-3 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-sm font-semibold">Envelope</h4>
                <StatusBadge status={envelope.status} />
              </div>
              <p className="text-xs text-muted-foreground">{envelope.emailSubject}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                <span className="text-muted-foreground">Sent</span><span>{fmt(envelope.sentDateTime)}</span>
                <span className="text-muted-foreground">Last update</span><span>{fmt(envelope.statusChangedDateTime)}</span>
                {envelope.completedDateTime && (<><span className="text-muted-foreground">Completed</span><span>{fmt(envelope.completedDateTime)}</span></>)}
                {envelope.voidedDateTime && (<><span className="text-muted-foreground">Voided</span><span>{fmt(envelope.voidedDateTime)}</span></>)}
                {envelope.voidedReason && (<><span className="text-muted-foreground">Void reason</span><span>{envelope.voidedReason}</span></>)}
                <span className="text-muted-foreground">Envelope ID</span><span className="font-mono text-[10px] truncate">{envelope.envelopeId}</span>
              </div>
            </div>
          )}

          <h4 className="text-sm font-semibold mb-2">Signers ({signers.length})</h4>
          {signers.length === 0 ? (
            <p className="text-xs text-muted-foreground mb-4">No signers found.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {signers.map((s, i) => (
                <div key={i} className="rounded-md border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-muted-foreground">{s.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Order {s.routingOrder}</span>
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground pt-1">
                    <span>Sent: {fmt(s.sentAt)}</span>
                    <span>Delivered: {fmt(s.deliveredAt)}</span>
                    <span>Signed: {fmt(s.signedAt)}</span>
                  </div>
                  {s.declinedReason && <p className="text-destructive">Declined: {s.declinedReason}</p>}
                </div>
              ))}
            </div>
          )}

          <Separator className="my-3" />

          <h4 className="text-sm font-semibold mb-2">Audit Trail ({events.length})</h4>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {events.slice().reverse().map((ev, i) => (
                <div key={i} className="flex gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground shrink-0 w-32">{fmt(ev.timestamp)}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{ev.action}</span>
                    {ev.description && ev.description !== ev.action && <span className="text-muted-foreground"> — {ev.description}</span>}
                    {(ev.user || ev.email) && <div className="text-muted-foreground truncate">{ev.user}{ev.email ? ` <${ev.email}>` : ''}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && !envelope && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
