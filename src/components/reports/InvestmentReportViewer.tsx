import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { Download, Edit, MapPin, Calendar, FileText, TrendingUp, Link, AlertCircle, Settings, ChevronDown, Edit3 } from 'lucide-react';
import { InvestmentReportEditor } from './InvestmentReportEditor';
import { ClientPDFGenerator } from './ClientPDFGenerator';

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content: string;
  sources_content?: string | null;
  created_at: string;
  status?: string;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
}

interface InvestmentReportViewerProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
  onReportUpdate?: () => void;
  onOpenOverride?: () => void;
}

export function InvestmentReportViewer({ report, isOpen, onClose, onReportUpdate, onOpenOverride }: InvestmentReportViewerProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [showOverrides, setShowOverrides] = useState(true);

  if (!report) return null;

  const hasOverrides = report.manual_overrides && Object.keys(report.manual_overrides).length > 0;
  const isRegenerating = report.status === 'processing';

  // Field name mapping for display
  const fieldDisplayNames: Record<string, string> = {
    'purchase_price': 'Purchase Price',
    'land_price': 'Land Price',
    'build_price': 'Build Price',
    'deposit_value': 'Deposit Value',
    'loan_to_value_ratio': 'Loan to Value Ratio',
    'interest_rate': 'Interest Rate',
    'capital_growth': 'Capital Growth',
    'weekly_rent': 'Weekly Rent',
    'stamp_duty': 'Stamp Duty',
    'body_corporate': 'Body Corporate/Strata Fees',
    'council_rates': 'Council Rate Charges',
    'water_rates': 'Water Rate Charges',
    'solicitor_fees': 'Solicitor Fees',
    'insurance': 'Building & Landlord Insurance',
    'property_management': 'Property Management Fees',
    'repairs_maintenance': 'Repairs & Maintenance',
    'letting_fees': 'Letting Fees',
  };

  const getOverriddenFields = () => {
    if (!hasOverrides) return [];
    return Object.keys(report.manual_overrides).map(key => ({
      key,
      displayName: fieldDisplayNames[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: report.manual_overrides[key]
    }));
  };

  const overriddenFields = getOverriddenFields();

  const handleDownload = () => {
    let content = report.report_content;
    
    // Include sources if toggle is enabled and sources exist
    if (includeSources && report.sources_content) {
      content += report.sources_content;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investment-report-${report.property_address.replace(/[^a-zA-Z0-9]/g, '-')}-${format(new Date(report.created_at), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEdit = () => {
    setEditorOpen(true);
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
    onReportUpdate?.();
  };

  // Custom markdown components for better styling
  const markdownComponents = {
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground border-b pb-2">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-xl font-semibold mt-6 mb-3 text-primary">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">
        {children}
      </h3>
    ),
    p: ({ children }: any) => (
      <p className="mb-4 leading-relaxed text-foreground">
        {children}
      </p>
    ),
    ul: ({ children }: any) => (
      <ul className="mb-4 space-y-2 list-disc list-inside">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="mb-4 space-y-2 list-decimal list-inside">
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className="text-foreground leading-relaxed pl-2">
        {children}
      </li>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-6">
        <table className="min-w-full border-collapse border border-border">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-muted">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody>
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="border-b border-border">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-border px-4 py-2 text-foreground">
        {children}
      </td>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-foreground">
        {children}
      </strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-muted-foreground">
        {children}
      </em>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    code: ({ children }: any) => (
      <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    pre: ({ children }: any) => (
      <pre className="bg-muted p-4 rounded-lg my-4 overflow-x-auto">
        {children}
      </pre>
    ),
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Investment Analysis Report
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Report Header */}
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {report.property_address}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Generated on {format(new Date(report.created_at), 'PPpp')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <FileText className="h-3 w-3 mr-1" />
                      Investment Report
                    </Badge>
                    {hasOverrides && (
                      <Badge variant="default" className="bg-primary">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Contains Manual Overrides
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Manual Overrides Indicator */}
            {hasOverrides && (
              <Collapsible open={showOverrides} onOpenChange={setShowOverrides}>
                <Card className="flex-shrink-0 border-warning bg-warning/5">
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Edit3 className="h-4 w-4 text-warning" />
                          <span className="font-semibold text-warning">
                            {overriddenFields.length} Field{overriddenFields.length !== 1 ? 's' : ''} Manually Overridden
                          </span>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-warning transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {overriddenFields.map(field => (
                          <Badge 
                            key={field.key} 
                            variant="warning" 
                            className="text-xs font-normal"
                          >
                            {field.displayName}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        These values were manually corrected and differ from the original API data.
                      </p>
                    </CollapsibleContent>
                  </CardHeader>
                </Card>
              </Collapsible>
            )}

            {/* Report Content */}
            <Card className="flex-1 overflow-hidden flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Analysis Report
                    {isRegenerating && (
                      <Badge variant="secondary" className="ml-2 animate-pulse">
                        Regenerating...
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    {report.sources_content && (
                      <div className="flex items-center gap-2">
                        <Link className="h-3 w-3" />
                        <span className="text-sm text-muted-foreground">Include sources in download</span>
                        <Switch
                          checked={includeSources}
                          onCheckedChange={setIncludeSources}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleEdit}>
                        <Edit className="h-3 w-3 mr-1" />
                        Edit Report
                      </Button>
                      <Button variant="secondary" size="sm" onClick={onOpenOverride}>
                        <Settings className="h-3 w-3 mr-1" />
                        Override Data
                      </Button>
                      <Button variant="default" size="sm" onClick={handleDownload}>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <Separator className="flex-shrink-0" />
              <CardContent className="p-0 flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                  <ClientPDFGenerator report={report} />
                </div>
                <ScrollArea className="flex-1 min-h-0 p-6">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {report.report_content}
                    </ReactMarkdown>
                    
                    {/* Show sources if they exist */}
                    {report.sources_content && (
                      <div className="mt-8 border-t pt-6">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {report.sources_content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <InvestmentReportEditor
        report={report}
        isOpen={editorOpen}
        onClose={handleEditorClose}
      />
    </>
  );
}