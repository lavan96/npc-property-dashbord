import { useState, useEffect, useRef } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Upload, Download, Trash2, FileText, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { SyncConflictDetailsPopover } from '@/components/sync/SyncConflictDetailsPopover';
import { SyncStatusBadge } from '@/components/sync/SyncStatusBadge';
import { getActorLabel, getConflictReason, getSurfaceLabel, getVersionNumber } from '@/lib/syncDisplay';

interface DocumentRecord {
  id: string;
  client_id: string;
  category: string;
  original_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  description: string | null;
  visible_to_client: boolean;
  uploader_type: string;
  created_at: string;
  sync_status?: string | null;
  source_surface?: string | null;
  source_actor_name?: string | null;
  version_number?: number | null;
  version_group_id?: string | null;
  supersedes_entity_id?: string | null;
  conflict_reason?: string | null;
  source_details?: Record<string, unknown> | null;
  last_sync_error?: string | null;
}

interface Permission {
  view?: boolean;
  edit?: boolean;
  delete?: boolean;
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'payslip', label: 'Payslip' },
  { value: 'tax_return', label: 'Tax Return' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'identification', label: 'ID / Verification' },
  { value: 'rates_notice', label: 'Rates Notice' },
  { value: 'contract', label: 'Contract' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'super_statement', label: 'Super Statement' },
  { value: 'loan_statement', label: 'Loan Statement' },
  { value: 'other', label: 'Other' },
];

function categoryLabel(c: string) {
  return CATEGORY_OPTIONS.find(o => o.value === c)?.label || c;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface DocumentVaultPanelProps {
  clientId: string;
}

export function DocumentVaultPanel({ clientId }: DocumentVaultPanelProps) {
  const { invokeFinanceFunction } = useFinancePortalAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [permission, setPermission] = useState<Permission>({ view: true, edit: true, delete: false });
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadVisibleToClient, setUploadVisibleToClient] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    const { data, error } = await invokeFinanceFunction('finance-portal-documents', {
      operation: 'list_documents',
      client_id: clientId,
    });
    if (error) {
      toast.error(error.message || 'Failed to load documents');
    } else if (data?.success) {
      setDocuments(data.records || []);
      if (data.permission) setPermission(data.permission);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (clientId) void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadCategory('other');
    setUploadDescription('');
    setUploadVisibleToClient(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select a file');
      return;
    }
    setUploading(true);
    try {
      // 1. Request signed upload URL
      const { data, error } = await invokeFinanceFunction('finance-portal-documents', {
        operation: 'request_upload',
        client_id: clientId,
        filename: uploadFile.name,
        mime_type: uploadFile.type || 'application/octet-stream',
        file_size: uploadFile.size,
        category: uploadCategory,
        description: uploadDescription || null,
        visible_to_client: uploadVisibleToClient,
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to start upload');
      }

      // 2. PUT file to signed URL
      const putRes = await fetch(data.upload.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' },
        body: uploadFile,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      // 3. Confirm upload — fans out notifications to other assignees
      try {
        await invokeFinanceFunction('finance-portal-documents', {
          operation: 'confirm_upload',
          client_id: clientId,
          document_id: data.document.id,
        });
      } catch {
        // Non-fatal: upload itself succeeded; notification can be retried later.
      }

      toast.success('Document uploaded');
      setUploadOpen(false);
      resetUploadForm();
      void loadDocuments();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRecord) => {
    const { data, error } = await invokeFinanceFunction('finance-portal-documents', {
      operation: 'get_download_url',
      client_id: clientId,
      document_id: doc.id,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to get download link');
      return;
    }
    window.open(data.url, '_blank');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await invokeFinanceFunction('finance-portal-documents', {
      operation: 'delete_document',
      client_id: clientId,
      document_id: deleteTarget.id,
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to delete');
    } else {
      toast.success('Document deleted');
      void loadDocuments();
    }
    setDeleteTarget(null);
  };

  const handleToggleVisibility = async (doc: DocumentRecord) => {
    const { data, error } = await invokeFinanceFunction('finance-portal-documents', {
      operation: 'update_document',
      client_id: clientId,
      document_id: doc.id,
      payload: { visible_to_client: !doc.visible_to_client },
    });
    if (error || !data?.success) {
      toast.error(data?.error || error?.message || 'Failed to update');
    } else {
      void loadDocuments();
    }
  };

  const filtered = filterCategory === 'all'
    ? documents
    : documents.filter(d => d.category === filterCategory);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Vault
          </CardTitle>
          <CardDescription>
            Securely share payslips, IDs, statements and other documents.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORY_OPTIONS.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {permission.edit && (
            <Button onClick={() => setUploadOpen(true)} size="sm">
              <Upload className="h-4 w-4 mr-2" /> Upload
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No documents{filterCategory !== 'all' ? ' in this category' : ''} yet.</p>
            {permission.edit && filterCategory === 'all' && (
              <Button variant="link" onClick={() => setUploadOpen(true)} className="mt-2">
                Upload the first document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{doc.original_filename}</p>
                    <Badge variant="secondary" className="text-xs">
                      {categoryLabel(doc.category)}
                    </Badge>
                    <SyncStatusBadge status={doc.sync_status} />
                    {doc.source_surface && <Badge variant="outline" className="text-xs">{getSurfaceLabel(doc.source_surface)}</Badge>}
                    {doc.visible_to_client && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Eye className="h-3 w-3" /> Visible to client
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(doc.file_size)} • {format(new Date(doc.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {getActorLabel(doc) && <span>By {getActorLabel(doc)}</span>}
                    {getVersionNumber(doc) ? <span>v{getVersionNumber(doc)}</span> : null}
                    {getConflictReason(doc) ? <span className="text-warning">{getConflictReason(doc)}</span> : null}
                    <SyncConflictDetailsPopover record={doc} />
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {permission.edit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleVisibility(doc)}
                      title={doc.visible_to_client ? 'Hide from client' : 'Show to client'}
                    >
                      {doc.visible_to_client
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Download">
                    <Download className="h-4 w-4" />
                  </Button>
                  {permission.delete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(doc)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) resetUploadForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Files are stored securely. Maximum size 25 MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                ref={fileInputRef}
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              {uploadFile && (
                <p className="text-xs text-muted-foreground">
                  {uploadFile.name} • {formatBytes(uploadFile.size)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory} disabled={uploading}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={2}
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                disabled={uploading}
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-md border">
              <div>
                <Label htmlFor="vis" className="text-sm">Visible to client</Label>
                <p className="text-xs text-muted-foreground">
                  Allow the client to see this in their portal.
                </p>
              </div>
              <Switch
                id="vis"
                checked={uploadVisibleToClient}
                onCheckedChange={setUploadVisibleToClient}
                disabled={uploading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile}>
              {uploading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                : <><Upload className="h-4 w-4 mr-2" /> Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.original_filename}</span> will be removed permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
