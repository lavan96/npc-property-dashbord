import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateUploader } from '@/components/templates/TemplateUploader';
import { TemplateList } from '@/components/templates/TemplateList';
import { BrandingManager } from '@/components/templates/BrandingManager';
import { GlobalReportSettings } from '@/components/templates/GlobalReportSettings';
import { QATemplateUploader } from '@/components/templates/QATemplateUploader';
import { QATemplateList } from '@/components/templates/QATemplateList';
import { FileText, Palette, Brain, BarChart3, TrendingUp, Building2, Settings, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
type ReportFormat = 
  | 'investment_compass' 
  | 'investment_executive' 
  | 'investment_snapshot'
  | 'comparison_specific'
  | 'comparison_cashflow'
  | 'individual_cashflow';

interface ReportFormatConfig {
  id: ReportFormat;
  label: string;
  description: string;
  category: 'investment' | 'comparison' | 'cash_flow';
  tier?: 'compass' | 'executive' | 'snapshot';
  icon: React.ElementType;
}

const REPORT_FORMATS: ReportFormatConfig[] = [
  {
    id: 'investment_compass',
    label: 'Investor Compass',
    description: 'Comprehensive investment analysis report',
    category: 'investment',
    tier: 'compass',
    icon: Building2,
  },
  {
    id: 'investment_executive',
    label: 'Executive Brief',
    description: 'Condensed executive summary report',
    category: 'investment',
    tier: 'executive',
    icon: FileText,
  },
  {
    id: 'investment_snapshot',
    label: 'Snapshot',
    description: 'Quick property snapshot overview',
    category: 'investment',
    tier: 'snapshot',
    icon: FileText,
  },
  {
    id: 'comparison_specific',
    label: 'Specific Property Comparison',
    description: 'Side-by-side property comparison analysis',
    category: 'comparison',
    icon: BarChart3,
  },
  {
    id: 'comparison_cashflow',
    label: '10 Year Cash Flow Comparison',
    description: 'Multi-property cash flow projection comparison',
    category: 'comparison',
    icon: TrendingUp,
  },
  {
    id: 'individual_cashflow',
    label: 'Individual 10 Year Cash Flow',
    description: 'Single property detailed cash flow analysis',
    category: 'cash_flow',
    icon: TrendingUp,
  },
];

export default function Templates() {
  const [activeTab, setActiveTab] = useState('report-formats');
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat | null>(null);

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

  const filterTemplatesByFormat = (format: ReportFormatConfig) => {
    return templates?.filter(t => {
      // Match by category and tier if applicable
      if (format.tier) {
        return t.report_category === format.category && t.report_tier === format.tier;
      }
      // For comparison and cash_flow, match by category
      return t.report_category === format.category;
    }) || [];
  };

  const getTemplateCountByFormat = (format: ReportFormatConfig) => {
    return filterTemplatesByFormat(format).length;
  };

  const groupedFormats = {
    investment: REPORT_FORMATS.filter(f => f.category === 'investment'),
    comparison: REPORT_FORMATS.filter(f => f.category === 'comparison'),
    cash_flow: REPORT_FORMATS.filter(f => f.category === 'cash_flow'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Management</h1>
        <p className="text-muted-foreground">
          Manage report templates, PDF layouts, and client branding profiles
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="report-formats" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Report Formats
          </TabsTrigger>
          <TabsTrigger value="ai-structure" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Structure
          </TabsTrigger>
          <TabsTrigger value="pdf-layout" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            PDF Layouts
          </TabsTrigger>
          <TabsTrigger value="qa-export" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Q&A Export
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Client Branding
          </TabsTrigger>
          <TabsTrigger value="global-settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Global Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report-formats" className="space-y-6">
          {/* Investment Reports Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Investment Reports
              </CardTitle>
              <CardDescription>
                Templates for individual property investment analysis reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {groupedFormats.investment.map((format) => {
                  const Icon = format.icon;
                  const count = getTemplateCountByFormat(format);
                  const isSelected = selectedFormat === format.id;
                  
                  return (
                    <Card 
                      key={format.id}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : ''
                      }`}
                      onClick={() => setSelectedFormat(isSelected ? null : format.id)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{format.label}</h3>
                              <p className="text-sm text-muted-foreground">{format.description}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Comparison Analysis Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Comparison Analysis
              </CardTitle>
              <CardDescription>
                Templates for comparing multiple properties side-by-side
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {groupedFormats.comparison.map((format) => {
                  const Icon = format.icon;
                  const count = getTemplateCountByFormat(format);
                  const isSelected = selectedFormat === format.id;
                  
                  return (
                    <Card 
                      key={format.id}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : ''
                      }`}
                      onClick={() => setSelectedFormat(isSelected ? null : format.id)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{format.label}</h3>
                              <p className="text-sm text-muted-foreground">{format.description}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Individual Cash Flow Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Individual Cash Flow Analysis
              </CardTitle>
              <CardDescription>
                Templates for detailed single property cash flow projections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {groupedFormats.cash_flow.map((format) => {
                  const Icon = format.icon;
                  const count = getTemplateCountByFormat(format);
                  const isSelected = selectedFormat === format.id;
                  
                  return (
                    <Card 
                      key={format.id}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : ''
                      }`}
                      onClick={() => setSelectedFormat(isSelected ? null : format.id)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{format.label}</h3>
                              <p className="text-sm text-muted-foreground">{format.description}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Format Details */}
          {selectedFormat && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {REPORT_FORMATS.find(f => f.id === selectedFormat)?.label} Templates
                </CardTitle>
                <CardDescription>
                  Upload and manage templates for this report format
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <TemplateUploader 
                  templateType="ai_structure" 
                  defaultCategory={REPORT_FORMATS.find(f => f.id === selectedFormat)?.category}
                  defaultTier={REPORT_FORMATS.find(f => f.id === selectedFormat)?.tier}
                />
                <TemplateList 
                  templates={filterTemplatesByFormat(REPORT_FORMATS.find(f => f.id === selectedFormat)!)} 
                  isLoading={templatesLoading}
                  templateType="ai_structure"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

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

        <TabsContent value="qa-export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Q&A Export Templates
              </CardTitle>
              <CardDescription>
                Upload PDF templates to customize how Report Q&A conversations are exported.
                The active template defines the cover page design, fonts, colors, headers, and footers
                for PDF exports from the Q&A agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <QATemplateUploader />
              <QATemplateList />
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

        <TabsContent value="global-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Global Report Settings</CardTitle>
              <CardDescription>
                Configure contact details and professional disclaimer that will be applied across all generated reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GlobalReportSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
