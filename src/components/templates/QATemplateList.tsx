import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { downloadFile, removeFiles } from '@/lib/storage/signedStorage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Trash2, 
  Download, 
  Calendar,
  CheckCircle,
  Circle,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface QATemplate {
  id: string;
  name: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export function QATemplateList() {
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['qa-export-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_structure_templates')
        .select('*')
        .eq('template_type', 'qa_export')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as QATemplate[];
    },
  });

  const handleToggleActive = async (template: QATemplate) => {
    setActivatingId(template.id);
    try {
      if (!template.is_active) {
        // Deactivate all other qa_export templates first
        await supabase
          .from('report_structure_templates')
          .update({ is_active: false })
          .eq('template_type', 'qa_export');
      }

      // Toggle the selected template
      const { error } = await supabase
        .from('report_structure_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;

      toast({
        title: template.is_active ? 'Template deactivated' : 'Template activated',
        description: template.is_active 
          ? 'The default template will be used for Q&A exports'
          : `"${template.name}" will now be used for Q&A exports`,
      });

      logActivityDirect({
        actionType: template.is_active ? 'template_deactivated' : 'template_activated',
        entityType: 'template',
        entityId: template.id,
        entityName: template.name,
        metadata: { template_type: 'qa_export' },
      });

      queryClient.invalidateQueries({ queryKey: ['qa-export-templates'] });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update template status',
        variant: 'destructive',
      });
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (template: QATemplate) => {
    try {
      // Delete from storage
      const { error: storageError } = await removeFiles('report-templates', [template.file_path]);

      if (storageError) {
        console.warn('Storage delete warning:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('report_structure_templates')
        .delete()
        .eq('id', template.id);

      if (dbError) throw dbError;

      toast({
        title: 'Template deleted',
        description: `"${template.name}" has been removed`,
      });

      logActivityDirect({
        actionType: 'template_deleted',
        entityType: 'template',
        entityId: template.id,
        entityName: template.name,
        metadata: { template_type: 'qa_export' },
      });

      queryClient.invalidateQueries({ queryKey: ['qa-export-templates'] });
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete template',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (template: QATemplate) => {
    try {
      const { data, error } = await downloadFile('report-templates', template.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = template.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Downloaded',
        description: `"${template.file_name}" downloaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download template',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Q&A Export Templates</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Upload a PDF template to customize how Q&A conversations are exported. 
            The default hardcoded template will be used until you upload and activate a custom one.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeTemplate = templates.find(t => t.is_active);

  return (
    <div className="space-y-4">
      {/* Active template indicator */}
      {activeTemplate ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <CheckCircle className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">
            Active template: <span className="text-primary">{activeTemplate.name}</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            No active template - using default styling for Q&A exports
          </span>
        </div>
      )}

      {/* Template list */}
      <div className="space-y-3">
        {templates.map((template) => (
          <Card 
            key={template.id} 
            className={template.is_active ? 'border-primary/50 bg-primary/5' : ''}
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold truncate">{template.name}</h4>
                      {template.is_active && (
                        <Badge variant="default" className="shrink-0">Active</Badge>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {template.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {template.file_name}
                      </span>
                      {template.file_size && (
                        <span>{(template.file_size / 1024).toFixed(1)} KB</span>
                      )}
                      {template.created_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(template.created_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Active toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`active-${template.id}`}
                      checked={template.is_active ?? false}
                      onCheckedChange={() => handleToggleActive(template)}
                      disabled={activatingId === template.id}
                    />
                    <Label 
                      htmlFor={`active-${template.id}`} 
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      {template.is_active ? 'Active' : 'Inactive'}
                    </Label>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(template)}
                      title="Download template"
                    >
                      <Download className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Delete template"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{template.name}"? 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(template)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
