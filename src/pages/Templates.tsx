import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateUploader } from '@/components/templates/TemplateUploader';
import { TemplateList } from '@/components/templates/TemplateList';
import { BrandingManager } from '@/components/templates/BrandingManager';
import { GlobalReportSettings } from '@/components/templates/GlobalReportSettings';
import { QATemplateUploader } from '@/components/templates/QATemplateUploader';
import { QATemplateList } from '@/components/templates/QATemplateList';
import { CashFlowTemplateUploader } from '@/components/templates/CashFlowTemplateUploader';
import { CashFlowTemplateList } from '@/components/templates/CashFlowTemplateList';
import { ReportFormatGroup } from '@/components/templates/ReportFormatGroup';
import { FileText, Palette, Brain, BarChart3, TrendingUp, Building2, Settings, MessageSquare, Calculator, MapPin, Hash, Map } from 'lucide-react';

type ReportFormat =
  | 'investment_compass' 
  | 'investment_executive' 
  | 'investment_snapshot'
  | 'suburb_compass'
  | 'suburb_executive'
  | 'suburb_snapshot'
  | 'postcode_compass'
  | 'postcode_executive'
  | 'postcode_snapshot'
  | 'statewide_compass'
  | 'statewide_executive'
  | 'statewide_snapshot'
  | 'comparison_specific'
  | 'comparison_cashflow'
  | 'individual_cashflow';

interface ReportFormatConfig {
  id: ReportFormat;
  label: string;
  description: string;
  category: 'investment' | 'suburb' | 'postcode' | 'statewide' | 'comparison' | 'cash_flow';
  tier?: 'compass' | 'executive' | 'snapshot';
  icon: React.ElementType;
}

const REPORT_FORMATS: ReportFormatConfig[] = [
  { id: 'investment_compass', label: 'Investor Compass', description: 'Comprehensive investment analysis report', category: 'investment', tier: 'compass', icon: Building2 },
  { id: 'investment_executive', label: 'Executive Brief', description: 'Condensed executive summary report', category: 'investment', tier: 'executive', icon: FileText },
  { id: 'investment_snapshot', label: 'Snapshot', description: 'Quick property snapshot overview', category: 'investment', tier: 'snapshot', icon: FileText },
  { id: 'suburb_compass', label: 'Suburb Compass', description: 'Comprehensive suburb-wide investment analysis', category: 'suburb', tier: 'compass', icon: MapPin },
  { id: 'suburb_executive', label: 'Suburb Executive Brief', description: 'Condensed suburb market summary', category: 'suburb', tier: 'executive', icon: FileText },
  { id: 'suburb_snapshot', label: 'Suburb Snapshot', description: 'Quick suburb overview', category: 'suburb', tier: 'snapshot', icon: FileText },
  { id: 'postcode_compass', label: 'Postcode Compass', description: 'Comprehensive postcode zone analysis', category: 'postcode', tier: 'compass', icon: Hash },
  { id: 'postcode_executive', label: 'Postcode Executive Brief', description: 'Condensed postcode market summary', category: 'postcode', tier: 'executive', icon: FileText },
  { id: 'postcode_snapshot', label: 'Postcode Snapshot', description: 'Quick postcode overview', category: 'postcode', tier: 'snapshot', icon: FileText },
  { id: 'statewide_compass', label: 'Statewide Compass', description: 'Comprehensive state-level market analysis', category: 'statewide', tier: 'compass', icon: Map },
  { id: 'statewide_executive', label: 'Statewide Executive Brief', description: 'Condensed state market summary', category: 'statewide', tier: 'executive', icon: FileText },
  { id: 'statewide_snapshot', label: 'Statewide Snapshot', description: 'Quick state overview', category: 'statewide', tier: 'snapshot', icon: FileText },
  { id: 'comparison_specific', label: 'Specific Property Comparison', description: 'Side-by-side property comparison analysis', category: 'comparison', icon: BarChart3 },
  { id: 'comparison_cashflow', label: '10 Year Cash Flow Comparison', description: 'Multi-property cash flow projection comparison', category: 'comparison', icon: TrendingUp },
  { id: 'individual_cashflow', label: 'Individual 10 Year Cash Flow', description: 'Single property detailed cash flow analysis', category: 'cash_flow', icon: TrendingUp },
];

const FORMAT_GROUPS = [
  { key: 'investment', title: 'Investment Reports', description: 'Templates for individual property investment analysis reports', icon: Building2, columns: 3 as const },
  { key: 'suburb', title: 'Suburb Analysis', description: 'Templates for suburb-wide market and investment analysis reports', icon: MapPin, columns: 3 as const },
  { key: 'postcode', title: 'Postcode / ZIP Code Analysis', description: 'Templates for postcode-zone market and investment analysis reports', icon: Hash, columns: 3 as const },
  { key: 'statewide', title: 'Statewide Analysis', description: 'Templates for state-level macro market and investment analysis reports', icon: Map, columns: 3 as const },
  { key: 'comparison', title: 'Comparison Analysis', description: 'Templates for comparing multiple properties side-by-side', icon: BarChart3, columns: 2 as const },
  { key: 'cash_flow', title: 'Individual Cash Flow Analysis', description: 'Templates for detailed single property cash flow projections', icon: TrendingUp, columns: 2 as const },
];

export default function Templates() {
  const [activeTab, setActiveTab] = useState('report-formats');
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat | null>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['report-structure-templates'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'report_structure_templates',
        listOptions: { orderBy: 'priority', orderAsc: false }
      });
      if (error) throw new Error(error.message);
      return data?.records || [];
    },
  });

  const { data: brandingProfiles, isLoading: brandingLoading } = useQuery({
    queryKey: ['client-branding-profiles'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'client_branding_profiles',
        listOptions: { orderBy: 'created_at', orderAsc: false }
      });
      if (error) throw new Error(error.message);
      return data?.records || [];
    },
  });

  const filterTemplatesByType = (type: string) => {
    return templates?.filter(t => t.template_type === type) || [];
  };

  const filterTemplatesByFormat = (format: ReportFormatConfig) => {
    return templates?.filter(t => {
      if (format.tier) {
        return t.report_category === format.category && t.report_tier === format.tier;
      }
      return t.report_category === format.category;
    }) || [];
  };

  const getTemplateCountByFormat = (format: { id: string }) => {
    const config = REPORT_FORMATS.find(f => f.id === format.id);
    if (!config) return 0;
    return filterTemplatesByFormat(config).length;
  };

  const selectedConfig = REPORT_FORMATS.find(f => f.id === selectedFormat);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Management</h1>
        <p className="text-muted-foreground">
          Manage report templates, PDF layouts, and client branding profiles
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-6">
            <TabsTrigger value="report-formats" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <Brain className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Formats
            </TabsTrigger>
            <TabsTrigger value="pdf-layout" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <FileText className="h-3.5 w-3.5 md:h-4 md:w-4" />
              PDF
            </TabsTrigger>
            <TabsTrigger value="qa-export" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <MessageSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Q&A
            </TabsTrigger>
            <TabsTrigger value="cashflow-export" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <Calculator className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Cash Flow
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <Palette className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="global-settings" className="flex items-center gap-1.5 text-xs md:text-sm whitespace-nowrap">
              <Settings className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="report-formats" className="space-y-6">
          {FORMAT_GROUPS.map((group) => (
            <ReportFormatGroup
              key={group.key}
              title={group.title}
              description={group.description}
              icon={group.icon}
              formats={REPORT_FORMATS.filter(f => f.category === group.key)}
              selectedFormat={selectedFormat}
              onSelectFormat={(id) => setSelectedFormat(id as ReportFormat | null)}
              getCount={getTemplateCountByFormat}
              columns={group.columns}
            />
          ))}

          {/* Selected Format Details — upload & list scoped to this format */}
          {selectedConfig && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedConfig.label} Templates</CardTitle>
                <CardDescription>
                  Upload and manage AI structure templates for this report format
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <TemplateUploader
                  templateType="ai_structure"
                  defaultCategory={selectedConfig.category}
                  defaultTier={selectedConfig.tier}
                />
                <TemplateList
                  templates={filterTemplatesByFormat(selectedConfig)}
                  isLoading={templatesLoading}
                  templateType="ai_structure"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pdf-layout" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PDF Layout Templates</CardTitle>
              <CardDescription>
                HTML/CSS templates that control the visual layout and styling of generated PDF reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <TemplateUploader templateType="pdf_layout" />
              <TemplateList templates={filterTemplatesByType('pdf_layout')} isLoading={templatesLoading} templateType="pdf_layout" />
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
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <QATemplateUploader />
              <QATemplateList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cashflow-export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                Cash Flow Export Templates
              </CardTitle>
              <CardDescription>
                Upload PDF templates to customize how 10-Year Cash Flow analyses are exported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <CashFlowTemplateUploader />
              <CashFlowTemplateList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Branding Profiles</CardTitle>
              <CardDescription>
                Customize report branding with client-specific logos, colors, and styling.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BrandingManager profiles={brandingProfiles || []} isLoading={brandingLoading} />
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
