import { useState, useCallback } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalDocumentsData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  FileText, Search, Loader2, FolderOpen, Download, Upload,
  File, Image, FileSpreadsheet, FileIcon, Plus, X, CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType?: string | null) {
  if (!fileType) return <File className="h-5 w-5" />;
  if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
  if (fileType.includes('image')) return <Image className="h-5 w-5 text-blue-500" />;
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv')) return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  return <FileIcon className="h-5 w-5 text-muted-foreground" />;
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'identification': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'financial': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    'property': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    'legal': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'report': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    'general': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return colors[category?.toLowerCase()] || colors.general;
}

const UPLOAD_CATEGORIES = [
  { value: 'identification', label: 'Identification' },
  { value: 'financial', label: 'Financial' },
  { value: 'property', label: 'Property' },
  { value: 'legal', label: 'Legal' },
  { value: 'general', label: 'General' },
];

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";
const PORTAL_SESSION_KEY = 'portal_session_token';

function getSessionToken(): string | null {
  try { return sessionStorage.getItem(PORTAL_SESSION_KEY) || localStorage.getItem(PORTAL_SESSION_KEY); }
  catch { try { return localStorage.getItem(PORTAL_SESSION_KEY); } catch { return null; } }
}

export default function PortalDocuments() {
  const { user } = usePortalAuth();
  const { data, isLoading, error } = usePortalDocumentsData();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const files = data?.files || [];
  const categories = [...new Set(files.map((f: any) => f.category))].sort();

  const filtered = files.filter((f: any) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return f.file_name?.toLowerCase().includes(s) || f.description?.toLowerCase().includes(s) || f.category?.toLowerCase().includes(s);
    }
    return true;
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadFiles(prev => [...prev, ...acceptedFiles].slice(0, 5));
    setUploadSuccess(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 10 * 1024 * 1024, // 10MB
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
  });

  const removeUploadFile = (idx: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!uploadFiles.length || !user?.client_id) return;
    setUploading(true);

    try {
      const sessionToken = getSessionToken();
      for (const file of uploadFiles) {
        const filePath = `${user.client_id}/portal-uploads/${Date.now()}-${file.name}`;

        // Upload via edge function
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_path', filePath);
        formData.append('category', uploadCategory);
        formData.append('portal_session_token', sessionToken || '');

        const response = await fetch(`${SUPABASE_URL}/functions/v1/portal-upload-file`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            ...(sessionToken ? { 'x-portal-session-token': sessionToken } : {}),
          },
          credentials: 'omit',
          body: formData,
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }
      }

      setUploadSuccess(true);
      setUploadFiles([]);
      queryClient.invalidateQueries({ queryKey: ['portal-client-data'] });
      toast.success(`${uploadFiles.length} file(s) uploaded successfully`);
      setTimeout(() => {
        setUploadOpen(false);
        setUploadSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: any) => {
    try {
      setDownloadingId(file.id);
      const { data: blob, error } = await supabase.storage
        .from('client-files')
        .download(file.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error:', err);
      toast.error('Unable to download file. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground mt-1">Your uploaded documents and files</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md">
              <Upload className="h-4 w-4" />
              Upload Files
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Upload Documents
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, images, Word, Excel (max 10MB each, up to 5 files)
                </p>
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      {getFileIcon(file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeUploadFile(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {uploadSuccess ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Files uploaded successfully!</p>
                </div>
              ) : (
                <Button
                  onClick={handleUpload}
                  disabled={uploadFiles.length === 0 || uploading}
                  className="w-full gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? 'Uploading...' : `Upload ${uploadFiles.length} file(s)`}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c: string) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Documents List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search || categoryFilter !== 'all' ? 'No documents match your filters.' : 'No documents uploaded yet.'}
            </p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              Upload your first document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((file: any) => (
                <div key={file.id} className="px-5 py-4 hover:bg-muted/30 transition-colors flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-muted shrink-0">
                    {getFileIcon(file.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-xs ${getCategoryColor(file.category)}`}>{file.category}</Badge>
                      {file.document_type && <span className="text-xs text-muted-foreground capitalize">{file.document_type.replace(/_/g, ' ')}</span>}
                      <span className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</span>
                    </div>
                    {file.description && <p className="text-xs text-muted-foreground mt-1 truncate">{file.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      {file.uploaded_at ? format(new Date(file.uploaded_at), 'dd MMM yyyy') : '—'}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(file)} disabled={downloadingId === file.id} className="gap-1.5">
                      {downloadingId === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
