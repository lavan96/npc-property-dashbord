import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { FileText, Trash2, RefreshCw, Download, Eye, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Template {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  report_tier: string | null;
  report_category: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  is_active: boolean | null;
  priority: number | null;
  parsed_content: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface TemplateListProps {
  templates: Template[];
  isLoading: boolean;
  templateType: string;
}

export function TemplateList({ templates, isLoading, templateType }: TemplateListProps) {
  const [parsingId, setParsingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('report_structure_templates')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-structure-templates'] });
      toast({ title: 'Template status updated' });
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete template
  const deleteMutation = useMutation({
    mutationFn: async (template: Template) => {
      // Delete from storage
      await supabase.storage
        .from('report-templates')
        .remove([template.file_path]);

      // Delete document chunks (for AI templates)
      await supabase
        .from('document_chunks')
        .delete()
        .eq('document_name', `template:${template.id}`);

      // Delete from database
      const { error } = await supabase
        .from('report_structure_templates')
        .delete()
        .eq('id', template.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-structure-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: (error: any) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Re-parse template for RAG
  const handleReparse = async (template: Template) => {
    setParsingId(template.id);
    try {
      const { data, error } = await supabase.functions.invoke('parse-template-document', {
        body: {
          templateId: template.id,
          filePath: template.file_path,
          templateType: template.template_type,
          reportTier: template.report_tier,
          reportCategory: template.report_category,
        },
      });

      if (error) throw error;

      toast({
        title: 'Template re-parsed',
        description: `Created ${data.chunksCreated} embeddings`,
      });
      queryClient.invalidateQueries({ queryKey: ['report-structure-templates'] });
    } catch (error: any) {
      toast({
        title: 'Parse failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setParsingId(null);
    }
  };

  // Download template
  const handleDownload = async (template: Template) => {
    try {
      const { data, error } = await supabase.storage
        .from('report-templates')
        .download(template.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = template.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getTierBadge = (tier: string | null) => {
    if (!tier) return null;
    const colors: Record<string, string> = {
      compass: 'bg-blue-500/10 text-blue-500',
      executive: 'bg-purple-500/10 text-purple-500',
      snapshot: 'bg-green-500/10 text-green-500',
    };
    return (
      <Badge variant="outline" className={colors[tier] || ''}>
        {tier}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return null;
    const labels: Record<string, string> = {
      investment: 'Investment',
      comparison: 'Comparison',
      suburb_snapshot: 'Suburb',
    };
    return (
      <Badge variant="secondary">
        {labels[category] || category}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No templates uploaded yet</p>
        <p className="text-sm">Upload a template using the form above</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Template</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Parsed</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => (
          <TableRow key={template.id}>
            <TableCell>
              <div>
                <p className="font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.file_name}</p>
              </div>
            </TableCell>
            <TableCell>{getTierBadge(template.report_tier)}</TableCell>
            <TableCell>{getCategoryBadge(template.report_category)}</TableCell>
            <TableCell>
              <Switch
                checked={template.is_active || false}
                onCheckedChange={(checked) =>
                  toggleActiveMutation.mutate({ id: template.id, isActive: checked })
                }
              />
            </TableCell>
            <TableCell>
              {template.parsed_content ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500">
                  {(template.parsed_content.length / 1000).toFixed(1)}k chars
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
                  Not parsed
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {template.updated_at
                ? format(new Date(template.updated_at), 'MMM d, yyyy')
                : '-'}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {templateType === 'ai_structure' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleReparse(template)}
                    disabled={parsingId === template.id}
                    title="Re-parse for RAG"
                  >
                    {parsingId === template.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(template)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Template</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{template.name}"? This will also remove
                        all associated embeddings and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(template)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
