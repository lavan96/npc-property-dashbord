import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileUp, 
  File, 
  FileText, 
  Image, 
  FileSpreadsheet,
  Download,
  Trash2,
  Loader2,
  Upload,
  Send
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsContext';
import { secureStorageUpload, secureStorageDownload, secureStorageDelete } from '@/hooks/useSecureStorage';

interface ClientFilesProps {
  clientId: string;
  onSendEmail?: (file: { id: string; file_name: string; file_path: string }) => void;
}

const fileCategories = [
  { value: 'general', label: 'General' },
  { value: 'contract', label: 'Contract' },
  { value: 'id', label: 'ID Document' },
  { value: 'financial', label: 'Financial' },
  { value: 'property', label: 'Property' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
];

const categoryColors: Record<string, string> = {
  general: 'bg-gray-500/10 text-gray-600',
  contract: 'bg-blue-500/10 text-blue-600',
  id: 'bg-purple-500/10 text-purple-600',
  financial: 'bg-green-500/10 text-green-600',
  property: 'bg-orange-500/10 text-orange-600',
  correspondence: 'bg-cyan-500/10 text-cyan-600',
  other: 'bg-slate-500/10 text-slate-600',
};

/**
 * Helper to get session token
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

/**
 * Secure fetch for files data with fallback
 */
async function fetchFilesSecure(clientId: string) {
  const sessionToken = getSessionToken();
  
  // Try secure Edge Function first
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('get-client-data', {
        body: {
          session_token: sessionToken,
          clientId,
          include: { files: true },
        },
      });

      if (!error && data?.success) {
        return data.data?.files || [];
      }
    } catch (err) {
      throw err;
    }
  }

  throw new Error('Not authenticated');
}

export function ClientFiles({ clientId, onSendEmail }: ClientFilesProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('general');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['client-files', clientId],
    queryFn: () => fetchFilesSecure(clientId),
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, category, description }: { file: File; category: string; description: string }) => {
      setUploading(true);
      
      // Upload to secure storage via Edge Function
      const fileName = `${clientId}/${Date.now()}_${file.name}`;
      
      const uploadResult = await secureStorageUpload('client-files', fileName, file, {
        contentType: file.type
      });

      if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload failed');

      const sessionToken = getSessionToken();
      const payload = {
        file_name: file.name,
        file_path: uploadResult.path || fileName,
        file_type: file.type,
        file_size: file.size,
        category,
        description: description || null,
      };

      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('manage-client-data', {
            body: {
              session_token: sessionToken,
              operation: 'create',
              table: 'client_files',
              clientId,
              data: payload,
            },
          });

          if (!error && data?.success) {
            return data.result;
          }
        } catch (err) {
          throw err;
        }
      }

      throw new Error('Not authenticated');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-files', clientId] });
      toast.success('File uploaded successfully');
      setDescription('');
    },
    onError: (error) => {
      toast.error('Failed to upload file: ' + error.message);
    },
    onSettled: () => {
      setUploading(false);
    }
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (file: { id: string; file_path: string }) => {
      // Delete from storage via secure Edge Function
      const deleteResult = await secureStorageDelete('client-files', file.file_path);

      if (!deleteResult.success) console.warn('Storage delete failed:', deleteResult.error);

      const sessionToken = getSessionToken();

      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('manage-client-data', {
            body: {
              session_token: sessionToken,
              operation: 'delete',
              table: 'client_files',
              clientId,
              recordId: file.id,
            },
          });

          if (!error && data?.success) {
            return;
          }
        } catch (err) {
          throw err;
        }
      }

      throw new Error('Not authenticated');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-files', clientId] });
      toast.success('File deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete file: ' + error.message);
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadFileMutation.mutate({
        file: acceptedFiles[0],
        category: selectedCategory,
        description
      });
    }
  }, [selectedCategory, description, uploadFileMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const downloadFile = async (file: { file_path: string; file_name: string }) => {
    const result = await secureStorageDownload('client-files', file.file_path);

    if (!result.success || !result.blob) {
      toast.error('Failed to download file: ' + (result.error || 'Unknown error'));
      return;
    }

    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return File;
    if (fileType.startsWith('image/')) return Image;
    if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv')) return FileSpreadsheet;
    if (fileType.includes('pdf') || fileType.includes('document')) return FileText;
    return File;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Upload File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {fileCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
              transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
              ${uploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : isDragActive ? (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-primary" />
                <p className="text-sm text-primary">Drop file here</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground">Max 10MB</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Files List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No files uploaded</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Files ({files.length})
          </h4>
          {files.map((file: any) => {
            const Icon = getFileIcon(file.file_type);
            
            return (
              <Card key={file.id} className="group">
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={categoryColors[file.category]}>
                        {file.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(file.uploaded_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    {file.description && (
                      <p className="text-xs text-muted-foreground mt-1">{file.description}</p>
                    )}
                  </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onSendEmail && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => {
                            onSendEmail(file);
                            addNotification({
                              type: 'client_file_shared',
                              title: 'File Shared',
                              message: `${file.file_name} shared via email`,
                              entityId: clientId
                            });
                          }}
                          title="Send via Email"
                        >
                          <Send className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => downloadFile(file)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => deleteFileMutation.mutate(file)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
