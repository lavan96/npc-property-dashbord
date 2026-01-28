import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Loader2, FileText, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { secureStorageUpload } from '@/hooks/useSecureStorage';

interface TemplateUploaderProps {
  templateType: 'ai_structure' | 'pdf_layout' | 'client_branding';
  defaultCategory?: 'investment' | 'comparison' | 'cash_flow';
  defaultTier?: 'compass' | 'executive' | 'snapshot';
}

export function TemplateUploader({ templateType, defaultCategory, defaultTier }: TemplateUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reportTier, setReportTier] = useState<string>(defaultTier || '');
  const [reportCategory, setReportCategory] = useState<string>(defaultCategory || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const getAcceptedFileTypes = () => {
    switch (templateType) {
      case 'ai_structure':
        // Include both extensions and MIME types for better cross-browser compatibility
        return '.pdf,.txt,.md,.json,text/plain,text/markdown,text/x-markdown,application/pdf,application/json';
      case 'pdf_layout':
        return '.html,.css,.json,text/html,text/css,application/json';
      case 'client_branding':
        return '.png,.jpg,.jpeg,.svg,.json,image/png,image/jpeg,image/svg+xml,application/json';
      default:
        return '*';
    }
  };

  const getMimeType = (file: File): string => {
    // Browser may return empty MIME type for some files (like .md)
    if (file.type) return file.type;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'md': 'text/markdown',
      'txt': 'text/plain',
      'pdf': 'application/pdf',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'svg': 'image/svg+xml',
    };
    return mimeMap[ext || ''] || 'application/octet-stream';
  };

  const handleUpload = async () => {
    if (!file || !name) {
      toast({
        title: 'Missing information',
        description: 'Please provide a name and select a file',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Generate storage path
      const fileExt = file.name.split('.').pop();
      const filePath = `${templateType}/${Date.now()}-${file.name}`;

      // Upload file to secure storage
      const uploadResult = await secureStorageUpload('report-templates', filePath, file, {
        contentType: getMimeType(file)
      });

      if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload failed');

      // Create database record - cast enums properly for Supabase
      const insertData = {
        name,
        description: description || null,
        template_type: templateType as 'ai_structure' | 'pdf_layout' | 'client_branding',
        report_tier: (reportTier && reportTier !== 'all' ? reportTier : null) as 'compass' | 'executive' | 'snapshot' | null,
        report_category: (reportCategory && reportCategory !== 'all' ? reportCategory : null) as 'investment' | 'comparison' | 'suburb_snapshot' | null,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: getMimeType(file),
        is_active: false,
        priority: 0,
      };

      const { data: template, error: dbError } = await supabase
        .from('report_structure_templates')
        .insert(insertData)
        .select()
        .single();

      if (dbError) throw dbError;

      // Log activity
      logActivityDirect({
        actionType: 'template_uploaded',
        entityType: 'template',
        entityId: template.id,
        entityName: name,
        metadata: {
          template_type: templateType,
          file_name: file.name,
          file_size: file.size,
          report_tier: reportTier || null,
          report_category: reportCategory || null,
        },
      });

      // If AI structure template, trigger parsing for RAG
      if (templateType === 'ai_structure') {
        setIsParsing(true);
        toast({
          title: 'Parsing template...',
          description: 'Extracting text and generating embeddings for RAG',
        });

        const { data: parseResult, error: parseError } = await invokeSecureFunction(
          'parse-template-document',
          {
            templateId: template.id,
            filePath,
            templateType,
            reportTier: reportTier || undefined,
            reportCategory: reportCategory || undefined,
          }
        );

        if (parseError) {
          console.error('Parse error:', parseError);
          toast({
            title: 'Parsing warning',
            description: 'Template uploaded but parsing failed. You can retry later.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Template ready',
            description: `Created ${parseResult.chunksCreated} embeddings for RAG retrieval`,
          });
        }
        setIsParsing(false);
      } else {
        toast({
          title: 'Template uploaded',
          description: 'Template has been saved successfully',
        });
      }

      // Reset form
      setFile(null);
      setName('');
      setDescription('');
      setReportTier('');
      setReportCategory('');

      // Refresh templates list
      queryClient.invalidateQueries({ queryKey: ['report-structure-templates'] });

    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload template',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-6 space-y-4">
        {/* Drag and drop zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${file ? 'bg-primary/5 border-primary' : ''}
          `}
        >
          <input
            type="file"
            accept={getAcceptedFileTypes()}
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <CheckCircle className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop or click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                Accepted: {getAcceptedFileTypes()}
              </p>
            </div>
          )}
        </div>

        {/* Template details */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Compass Report Structure v2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier">Report Tier</Label>
            <Select value={reportTier} onValueChange={setReportTier}>
              <SelectTrigger>
                <SelectValue placeholder="All tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="compass">Compass</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="snapshot">Snapshot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Report Category</Label>
            <Select value={reportCategory} onValueChange={setReportCategory}>
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="investment">Investment Report</SelectItem>
                <SelectItem value="comparison">Comparison Analysis</SelectItem>
                <SelectItem value="cash_flow">Cash Flow Analysis</SelectItem>
                <SelectItem value="suburb_snapshot">Suburb Snapshot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is used for..."
              rows={2}
            />
          </div>
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || !name || isUploading || isParsing}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : isParsing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing & Generating Embeddings...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Template
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
