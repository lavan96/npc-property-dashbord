import { useState } from 'react';
import { useAgencyAgreements, useAgreementMutations, AgencyAgreement } from '@/hooks/useAgencyAgreements';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
import { invokeSecureFunction } from '@/lib/secureInvoke';
import GammaTemplateManager from '@/components/agreements/GammaTemplateManager';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ComponentType<any> }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: Clock },
  generated: { label: 'Generated', variant: 'outline', icon: FileSignature },
  sent: { label: 'Sent', variant: 'default', icon: Send },
  delivered: { label: 'Delivered', variant: 'default', icon: CheckCircle2 },
  viewed: { label: 'Viewed', variant: 'default', icon: Eye },
  signed: { label: 'Signed', variant: 'default', icon: CheckCircle2 },
  declined: { label: 'Declined', variant: 'destructive', icon: AlertTriangle },
  voided: { label: 'Voided', variant: 'destructive', icon: Ban },
  expired: { label: 'Expired', variant: 'secondary', icon: Clock },
};

export default function Agreements() {
  const { data: agreements = [], isLoading } = useAgencyAgreements();
  const { checkStatus, voidAgreement, sendViaDocuSign } = useAgreementMutations();
  const [searchTerm, setSearchTerm] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const navigate = useNavigate();

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
    const { html, pdf_url } = await fetchAgreementPreview(agreement.id);
    
    if (pdf_url) {
      // Download PDF directly
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
      toast.dismiss('download-agreement');
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
    toast.success('Agreement downloaded', { id: 'download-agreement' });
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
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <FileSignature className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Agency Agreements</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            Manage and track Buyer's Agent Agreements sent via DocuSign.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Agreements</p>
            <p className="text-2xl font-bold">{agreements.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="text-2xl font-bold text-foreground">{totalSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Awaiting Signature</p>
            <p className="text-2xl font-bold text-foreground">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Signed</p>
            <p className="text-2xl font-bold text-emerald-600">{totalSigned}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">All Agreements</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAgreements.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {searchTerm ? 'No agreements match your search.' : 'No agreements sent yet. Open a client and click "Send Agreement" to get started.'}
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
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
                    <TableRow key={agreement.id}>
                      <TableCell className="font-medium">
                        <button
                          className="hover:underline text-left"
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
                      <TableCell>{renderStatusBadge(agreement.status)}</TableCell>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewAgreement(agreement)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Agreement
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadAgreement(agreement)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download Agreement
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewClient(agreement.client_id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Client
                            </DropdownMenuItem>
                            {agreement.status === 'generated' && (
                              <DropdownMenuItem onClick={() => handleSendViaDocuSign(agreement)}>
                                <Send className="h-4 w-4 mr-2" />
                                Send via DocuSign
                              </DropdownMenuItem>
                            )}
                            {agreement.docusign_envelope_id && (
                              <DropdownMenuItem onClick={() => handleRefreshStatus(agreement.id)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh Status
                              </DropdownMenuItem>
                            )}
                            {['sent', 'delivered', 'viewed'].includes(agreement.status) && (
                              <DropdownMenuItem
                                className="text-destructive"
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
        </CardContent>
      </Card>

      {/* Agreement Preview Dialog */}
      <Dialog open={!!previewHtml || isPreviewLoading} onOpenChange={(open) => { if (!open) { setPreviewHtml(null); setPreviewTitle(''); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {isPreviewLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewHtml ? (
            <div className="flex-1 overflow-auto border rounded-md">
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
    </div>
  );
}
