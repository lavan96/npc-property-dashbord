import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileSpreadsheet, 
  Download,
  Trash2,
  Loader2,
  Upload,
  Calendar,
  CheckCircle2,
  FileUp
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationsContext';

interface ClientVownetFormsProps {
  clientId: string;
  clientName: string;
}

export function ClientVownetForms({ clientId, clientName }: ClientVownetFormsProps) {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // Fetch VowNet forms for this client
  const { data: vownetForms = [], isLoading } = useQuery({
    queryKey: ['client-vownet-forms', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_files')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_vownet_form', true)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      
      const filePath = `${clientId}/${Date.now()}_${file.name}`;
      
      // Upload to vownet-forms bucket
      const { error: uploadError } = await supabase.storage
        .from('vownet-forms')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Record in client_files table
      const { error: dbError } = await supabase
        .from('client_files')
        .insert({
          client_id: clientId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          category: 'vownet',
          document_type: 'vownet_form',
          is_vownet_form: true,
          uploaded_by: user?.id
        });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-vownet-forms', clientId] });
      toast.success('VowNet form uploaded successfully');
      addNotification({
        type: 'vownet_form_uploaded',
        title: 'VowNet Form Uploaded',
        message: `New VowNet form uploaded for ${clientName}`,
        entityId: clientId
      });
    },
    onError: (error: any) => {
      toast.error('Failed to upload VowNet form: ' + error.message);
    },
    onSettled: () => {
      setUploading(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (file: { id: string; file_path: string }) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('vownet-forms')
        .remove([file.file_path]);

      if (storageError) console.warn('Storage delete failed:', storageError);

      // Delete record
      const { error: dbError } = await supabase
        .from('client_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-vownet-forms', clientId] });
      toast.success('VowNet form deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete file: ' + error.message);
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
      'application/octet-stream': ['.xlsx', '.xls', '.xlsm', '.xlsb'],
      'text/csv': ['.csv']
    },
    disabled: uploading
  });

  const downloadFile = async (file: { file_path: string; file_name: string }) => {
    const { data, error } = await supabase.storage
      .from('vownet-forms')
      .download(file.file_path);

    if (error) {
      toast.error('Failed to download file');
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
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
            Upload VowNet Form
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                <p className="text-sm text-muted-foreground">Uploading VowNet form...</p>
              </div>
            ) : isDragActive ? (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-primary" />
                <p className="text-sm text-primary">Drop VowNet form here</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Drag & drop VowNet form or click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports Excel (.xlsx, .xls, .xlsm) and CSV files (Max 10MB)
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Forms List */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Uploaded VowNet Forms ({vownetForms.length})
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vownetForms.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No VowNet forms uploaded yet</p>
              <p className="text-xs mt-1">Upload a VowNet form to get started</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-4">
              {vownetForms.map((file) => (
                <Card key={file.id} className="group">
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.file_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          VowNet Form
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(file.uploaded_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        onClick={() => deleteMutation.mutate(file)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
