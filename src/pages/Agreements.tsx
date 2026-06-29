import { useState } from 'react';
import { useAgencyAgreements, useAgreementMutations, AgencyAgreement } from '@/hooks/useAgencyAgreements';
import { CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlattenPdfMenuItem } from '@/components/common/FlattenPdfMenuItem';
import { fetchPdfBlob } from '@/lib/pdf/downloadPdf';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { FileSignature, Search, RefreshCw, MoreHorizontal, Eye, XCircle, Download, Loader2, Send, CheckCircle2, Clock, AlertTriangle, Ban, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import GammaTemplateManager from '@/components/agreements/GammaTemplateManager';
import { PrepareForSigningModal, type SigningRecipient } from '@/components/agreements/PrepareForSigningModal';
import { EnvelopeStatusDialog, DocuSignStatusBadge } from '@/components/agreements/EnvelopeStatusDialog';
import { supabase } from '@/integrations/supabase/client';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; icon: React.ComponentType<any> }> = {
  pending_pdf: { label: 'Processing PDF', variant: 'warning', icon: Clock },
  generating: { label: 'Generating', variant: 'warning', icon: Loader2 },
  generated: { label: 'Generated', variant: 'outline', icon: FileSignature },
  sent: { label: 'Sent', variant: 'default', icon: Send },
  delivered: { label: 'Delivered', variant: 'default', icon: CheckCircle2 },
  viewed: { label: 'Viewed', variant: 'default', icon: Eye },
  signed: { label: 'Signed', variant: 'success', icon: CheckCircle2 },
  declined: { label: 'Declined', variant: 'destructive', icon: AlertTriangle },
  voided: { label: 'Voided', variant: 'destructive', icon: Ban },
  expired: { label: 'Expired', variant: 'secondary', icon: Clock },
};

export default function Agreements() {
  const { data: agreements = [], isLoading } = useAgencyAgreements();
  const { checkStatus, voidAgreement, sendViaDocuSign, retryPdf } = useAgreementMutations();
  const [searchTerm, setSearchTerm] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [signingAgreement, setSigningAgreement] = useState<AgencyAgreement | null>(null);
  const [signingPdfUrl, setSigningPdfUrl] = useState<string>('');
  const [statusAgreement, setStatusAgreement] = useState<AgencyAgreement | null>(null);
  const navigate = useNavigate();
  const { canEdit: canEditAgreements } = useModulePermissions('agreements');

  const openPrepareForSigning = async (a: AgencyAgreement) => {
    if (!a.pdf_storage_path) { toast.error('PDF not ready yet'); return; }
    const { data, error } = await supabase.storage.from('agency-agreements').createSignedUrl(a.pdf_storage_path, 600);
    if (error || !data?.signedUrl) { toast.error(`Failed to load PDF: ${error?.message}`); return; }
    const existingRecipients: SigningRecipient[] = Array.isArray((a as any).signing_recipients) && (a as any).signing_recipients.length
      ? (a as any).signing_recipients
      : [
          { id: 'buyer', name: a.buyer_names, email: a.buyer_email || '', roleLabel: 'Primary Buyer', routingOrder: 1 },
          ...(a.secondary_buyer_name ? [{ id: 'buyer2', name: a.secondary_buyer_name, email: (a as any).secondary_buyer_email || a.buyer_email || '', roleLabel: 'Secondary Buyer', routingOrder: 1 }] : []),
        ];
    setSigningPdfUrl(data.signedUrl);
    setSigningAgreement({ ...a, signing_recipients: existingRecipients } as any);
  };

  const filteredAgreements = agreements.filter((a) =>
    a.buyer_names.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSent = agreements.filter(a => ['sent', 'delivered', 'viewed', 'signed'].includes(a.status)).length;
  const totalSigned = agreements.filter(a => a.status === 'signed').length;
  const pending = agreements.filter(a => ['sent', 'delivered', 'viewed'].includes(a.status)).length;

  const fetchAgreementPreview = async (agreementId: string): Promise<{ html: string | null; pdf_url: string | null }> => {
    const { data, error } = await invokeSecureFunction<{ html: string; pdf_url?: string; gamma_url?: string }>('manage-agency-agreements', {
      action: 'preview',
      agreement_id: agreementId,
    });
    if (error || !data) {
      toast.error('Failed to load agreement: ' + (error?.message || 'Unknown error'));
      return { html: null, pdf_url: null };
    }
    return { html: data.html || null, pdf_url: data.pdf_url || null };
  };

  const handleViewAgreement = async (agreement: AgencyAgreement) => {
    setIsPreviewLoading(true);
    setPreviewTitle(`Agreement — ${agreement.buyer_names}`);
    setPreviewHtml(null);
    const { html, pdf_url } = await fetchAgreementPreview(agreement.id);
    if (pdf_url) {
      // Show PDF in iframe
      setPreviewHtml(`__PDF__${pdf_url}`);
    } else if (html) {
      setPreviewHtml(html);
    } else {
      setPreviewTitle('');
    }
    setIsPreviewLoading(false);
  };

  const handleDownloadAgreement = async (agreement: AgencyAgreement) => {
    toast.loading('Preparing download...', { id: 'download-agreement' });
    let { html, pdf_url } = await fetchAgreementPreview(agreement.id);
    
    // If no PDF, attempt a retry (deferred generation may have completed)
    if (!pdf_url && !agreement.pdf_storage_path) {
      toast.loading('PDF not ready yet, retrying...', { id: 'download-agreement' });
      try {
        const retryResult = await retryPdf.mutateAsync(agreement.id);
        if (retryResult?.pdf_url) {
          pdf_url = retryResult.pdf_url;
        }
      } catch {
        // Retry failed, will fall back to HTML
      }
    }

    if (pdf_url) {
      try {
        const res = await fetch(pdf_url);
        if (!res.ok) throw new Error('Failed to fetch PDF');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Agreement_${agreement.buyer_names.replace(/\s+/g, '_')}_${format(new Date(agreement.agreement_date), 'yyyy-MM-dd')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded', { id: 'download-agreement' });
      } catch {
        toast.error('Failed to download PDF', { id: 'download-agreement' });
      }
      return;
    }

    if (!html) {
      toast.error('Agreement PDF is still being generated. Please try again in a minute.', { id: 'download-agreement' });
      return;
    }
    // Fallback: Download as HTML file
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Agreement_${agreement.buyer_names.replace(/\s+/g, '_')}_${format(new Date(agreement.agreement_date), 'yyyy-MM-dd')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Agreement downloaded (HTML fallback)', { id: 'download-agreement' });
  };

  const handleRefreshStatus = async (id: string) => {
    try {
      await checkStatus.mutateAsync(id);
      toast.success('Status refreshed');
    } catch {
      // handled by mutation
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Reason for voiding this agreement:');
    if (!reason) return;
    await voidAgreement.mutateAsync({ agreementId: id, reason });
  };

  const handleViewClient = (clientId: string) => {
    navigate(`/clients?clientId=${clientId}`);
  };

  const handleSendViaDocuSign = async (agreement: AgencyAgreement) => {
    if (!confirm(`Send agreement for ${agreement.buyer_names} via DocuSign?`)) return;
    try {
      await sendViaDocuSign.mutateAsync(agreement.id);
    } catch {
      // handled by mutation
    }
  };

  const renderStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.generated;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1 border-border/50 bg-background/60 shadow-sm dark:bg-slate-950/50">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <DashboardThemeFrame
      as="main"
      variant="page"
      className="space-y-7 px-3 py-4 text-foreground sm:px-6 sm:py-7 lg:px-8"
    >
      <DashboardThemeFrame
        as="header"
        variant="hero"
        className="isolate flex flex-col gap-5 border-primary/20 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.9)_52%,hsl(var(--muted)/0.45))] shadow-[0_20px_60px_rgba(15,23,42,0.10)] shadow-primary/5 before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/45 before:to-transparent dark:bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.20),transparent_36%),linear-gradient(135deg,hsl(var(--card)/0.88),hsl(var(--background)/0.76)_52%,hsl(var(--muted)/0.18))] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary shadow-inner shadow-primary/20">
            <FileSignature className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Agency agreements</p>
            <h1 className="text-xl font-bold tracking-tight sm:text-3xl">DocuSign agreement centre</h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Manage generated agreements, signing status, audit trails, and buyer follow-up.
            </p>
          </div>
        </div>
        <div className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary shadow-sm shadow-primary/10">
          {pending} awaiting signature
        </div>
      </DashboardThemeFrame>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Agreement KPI summary">
        {[
          { label: 'Total Agreements', value: agreements.length, tone: 'primary' },
          { label: 'Sent', value: totalSent, tone: 'foreground' },
          { label: 'Awaiting Signature', value: pending, tone: 'warning' },
          { label: 'Signed', value: totalSigned, tone: 'success' },
        ].map((stat) => (
          <DashboardThemeFrame key={stat.label} variant="premiumCard" className="relative p-4 after:absolute after:inset-x-4 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/30 after:to-transparent sm:p-5">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p
              className={cn(
                'mt-2 text-2xl font-bold tracking-tight',
                stat.tone === 'primary' && 'text-primary',
                stat.tone === 'warning' && 'text-[hsl(var(--warning))]',
                stat.tone === 'success' && 'text-[hsl(var(--success))]',
                stat.tone === 'foreground' && 'text-foreground'
              )}
            >
              {stat.value}
            </p>
          </DashboardThemeFrame>
        ))}
      </section>

      <DashboardThemeFrame
        as="section"
        variant="section"
        className="border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.92),hsl(var(--card)/0.74))] p-0 shadow-[0_22px_70px_rgba(15,23,42,0.09)] ring-1 ring-white/45 dark:border-white/10 dark:bg-slate-950/45 dark:ring-white/10"
      >
        <div className="flex flex-col gap-4 border-b border-border/60 bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
              <CardTitle className="text-base">All Agreements</CardTitle>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Search, review, download, and manage envelope status.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-xl border-border/70 bg-background/85 pl-9 shadow-sm transition-all focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 dark:bg-slate-950/55"
            />
          </div>
        </div>
        <div className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredAgreements.length === 0 ? (
            <div className="mx-4 my-5 rounded-2xl border border-dashed border-border/70 bg-muted/25 px-4 py-12 text-center text-sm text-muted-foreground">
              {searchTerm ? 'No agreements match your search.' : 'No agreements sent yet. Open a client and click "Send Agreement" to get started.'}
            </div>
          ) : (
            <ScrollArea className="max-h-[560px] [scrollbar-color:hsl(var(--primary)/0.35)_transparent] [scrollbar-width:thin]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/55 backdrop-blur dark:bg-slate-900/80">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Buyer</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Sent</TableHead>
                    <TableHead className="hidden lg:table-cell">Signed</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgreements.map((agreement) => (
                    <TableRow key={agreement.id} className="group border-border/55 transition-colors hover:bg-primary/5">
                      <TableCell className="font-medium">
                        <button
                          className="text-left text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          onClick={() => handleViewClient(agreement.client_id)}
                        >
                          {agreement.buyer_names}
                        </button>
                        {agreement.secondary_buyer_name && (
                          <span className="block text-xs text-muted-foreground">
                            & {agreement.secondary_buyer_name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {agreement.buyer_email || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {renderStatusBadge(agreement.status)}
                          {agreement.docusign_envelope_id && agreement.docusign_status && (
                            <DocuSignStatusBadge status={agreement.docusign_status} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {format(new Date(agreement.agreement_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {agreement.docusign_sent_at
                          ? format(new Date(agreement.docusign_sent_at), 'dd MMM yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {agreement.docusign_signed_at
                          ? format(new Date(agreement.docusign_signed_at), 'dd MMM yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/50">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-border/70 bg-popover/95 shadow-xl shadow-black/10 backdrop-blur">
                            <DropdownMenuItem onClick={() => handleViewAgreement(agreement)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Agreement
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadAgreement(agreement)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download Agreement
                            </DropdownMenuItem>
                            <FlattenPdfMenuItem
                              getPdfBlob={async () => {
                                const { pdf_url } = await fetchAgreementPreview(agreement.id);
                                if (!pdf_url) throw new Error('Agreement PDF not yet generated');
                                return fetchPdfBlob(pdf_url);
                              }}
                              filename={`Agreement_${agreement.buyer_names.replace(/\s+/g, '_')}_${format(new Date(agreement.agreement_date), 'yyyy-MM-dd')}.pdf`}
                            />
                            <DropdownMenuItem onClick={() => handleViewClient(agreement.client_id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Client
                            </DropdownMenuItem>
                            {canEditAgreements && agreement.status === 'generated' && (
                              <>
                                <DropdownMenuItem onClick={() => openPrepareForSigning(agreement)}>
                                  <FileSignature className="h-4 w-4 mr-2" />
                                  Prepare for Signing
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSendViaDocuSign(agreement)}>
                                  <Send className="h-4 w-4 mr-2" />
                                  Send via DocuSign (legacy anchors)
                                </DropdownMenuItem>
                              </>
                            )}
                            {agreement.docusign_envelope_id && (
                              <>
                                <DropdownMenuItem onClick={() => setStatusAgreement(agreement)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Envelope Status &amp; Audit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRefreshStatus(agreement.id)}>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Refresh Status
                                </DropdownMenuItem>
                              </>
                            )}
                            {canEditAgreements && ['sent', 'delivered', 'viewed'].includes(agreement.status) && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleVoid(agreement.id)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Void Agreement
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </DashboardThemeFrame>

      <GammaTemplateManager />

      {/* Agreement Preview Dialog */}
      <Dialog open={!!previewHtml || isPreviewLoading} onOpenChange={(open) => { if (!open) { setPreviewHtml(null); setPreviewTitle(''); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border-border/70 bg-card text-card-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {isPreviewLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : previewHtml ? (
            <div className="flex-1 overflow-auto rounded-xl border border-border/70 bg-background">
              {previewHtml.startsWith('__PDF__') ? (
                <iframe
                  src={previewHtml.replace('__PDF__', '')}
                  className="w-full min-h-[70vh] border-0"
                  title="Agreement Preview"
                />
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[70vh] border-0"
                  title="Agreement Preview"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {signingAgreement && (
        <PrepareForSigningModal
          open={!!signingAgreement}
          onOpenChange={(v) => { if (!v) setSigningAgreement(null); }}
          scope="agreement"
          recordId={signingAgreement.id}
          title={signingAgreement.buyer_names}
          pdfUrl={signingPdfUrl}
          initialRecipients={(signingAgreement as any).signing_recipients || []}
          initialLayout={(signingAgreement as any).signing_layout || []}
          onSent={() => setSigningAgreement(null)}
        />
      )}

      {statusAgreement && (
        <EnvelopeStatusDialog
          open={!!statusAgreement}
          onOpenChange={(v) => { if (!v) setStatusAgreement(null); }}
          scope="agreement"
          recordId={statusAgreement.id}
          title={`${statusAgreement.buyer_names} — Envelope`}
        />
      )}
    </DashboardThemeFrame>
  );
}
