import { useState } from 'react';
import { usePortalDocumentsData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, Search, Loader2, FolderOpen, Download,
  File, Image, FileSpreadsheet, FileIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  return colors[category.toLowerCase()] || colors.general;
}

export default function PortalDocuments() {
  const { data, isLoading, error } = usePortalDocumentsData();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground mt-1">Your uploaded documents and files</p>
      </div>

      {/* Filters */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
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
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((file: any) => (
                <div
                  key={file.id}
                  className="px-5 py-4 hover:bg-muted/30 transition-colors flex items-center gap-4"
                >
                  <div className="p-2.5 rounded-xl bg-muted shrink-0">
                    {getFileIcon(file.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-xs ${getCategoryColor(file.category)}`}>
                        {file.category}
                      </Badge>
                      {file.document_type && (
                        <span className="text-xs text-muted-foreground capitalize">{file.document_type.replace(/_/g, ' ')}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</span>
                    </div>
                    {file.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{file.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      {file.uploaded_at ? format(new Date(file.uploaded_at), 'dd MMM yyyy') : '—'}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(file)}
                      disabled={downloadingId === file.id}
                      className="gap-1.5"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
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
