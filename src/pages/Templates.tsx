import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateUploader } from '@/components/templates/TemplateUploader';
import { TemplateList } from '@/components/templates/TemplateList';
import { BrandingManager } from '@/components/templates/BrandingManager';
import { FileText, Palette, Brain } from 'lucide-react';

export default function Templates() {
  const [activeTab, setActiveTab] = useState('ai-structure');
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['report-structure-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_structure_templates')
        .select('*')
        .order('priority', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch branding profiles
  const { data: brandingProfiles, isLoading: brandingLoading } = useQuery({
    queryKey: ['client-branding-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_branding_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const filterTemplatesByType = (type: string) => {
    return templates?.filter(t => t.template_type === type) || [];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Management</h1>
        <p className="text-muted-foreground">
          Manage AI structure templates, PDF layouts, and client branding profiles
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai-structure" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Structure
          </TabsTrigger>
          <TabsTrigger value="pdf-layout" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            PDF Layouts
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Client Branding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-structure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Structure Templates</CardTitle>
              <CardDescription>
                Reference documents that define report structure and content patterns for AI generation.
                These templates are parsed and stored as vector embeddings for RAG-based context injection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <TemplateUploader templateType="ai_structure" />
              <TemplateList 
                templates={filterTemplatesByType('ai_structure')} 
                isLoading={templatesLoading}
                templateType="ai_structure"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf-layout" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PDF Layout Templates</CardTitle>
              <CardDescription>
                HTML/CSS templates that control the visual layout and styling of generated PDF reports.
                Supports different layouts for investment reports, comparisons, and suburb snapshots.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <TemplateUploader templateType="pdf_layout" />
              <TemplateList 
                templates={filterTemplatesByType('pdf_layout')} 
                isLoading={templatesLoading}
                templateType="pdf_layout"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Branding Profiles</CardTitle>
              <CardDescription>
                Customize report branding with client-specific logos, colors, and styling.
                Each profile can be applied to generated reports for white-label delivery.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BrandingManager 
                profiles={brandingProfiles || []} 
                isLoading={brandingLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
