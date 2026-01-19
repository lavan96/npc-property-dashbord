import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Download,
  Mail,
  Send,
  Plus,
  Building2,
  PieChart,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { VownetPDFGenerator, type VownetPDFData } from './VownetPDFGenerator';
import { PortfolioAnalysisPDFGenerator } from './PortfolioAnalysisPDFGenerator';
import { PropertyReportGenerator } from './PropertyReportGenerator';
import { toast } from 'sonner';

interface ClientReportsTabProps {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  fullClient: any;
  properties: any[];
  employment: any[];
  income: any[];
  assets: any[];
  liabilities: any[];
  onEmailClick: (blob: Blob, fileName: string) => void;
  onOpenEmailCompose: () => void;
}

interface GeneratedReport {
  id: string;
  type: 'vownet' | 'portfolio' | 'property' | 'investment';
  name: string;
  generatedAt: string;
  status: 'completed' | 'pending' | 'failed';
  fileUrl?: string;
  propertyAddress?: string;
}

export function ClientReportsTab({
  clientId,
  clientName,
  clientEmail,
  fullClient,
  properties,
  employment,
  income,
  assets,
  liabilities,
  onEmailClick,
  onOpenEmailCompose,
}: ClientReportsTabProps) {
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);

  // Fetch client files that are reports (Vownet forms, etc.)
  const { data: reportFiles = [] } = useQuery({
    queryKey: ['client-report-files', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_files')
        .select('*')
        .eq('client_id', clientId)
        .or('is_vownet_form.eq.true,report_type.neq.null')
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch investment reports linked to client properties
  const propertyIds = properties.map((p) => p.id);
  const { data: investmentReports = [] } = useQuery({
    queryKey: ['client-investment-reports', clientId, propertyIds],
    queryFn: async () => {
      if (propertyIds.length === 0) return [];
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, status, created_at, client_property_id')
        .eq('is_client_report', true)
        .in('client_property_id', propertyIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Note: Portfolio analyses are stored as files in client_files with report_type='portfolio'
  // The cash_flow_analyses table is for comparison analyses, not client-specific reports

  // Combine all reports into a unified list
  const allReports: GeneratedReport[] = [
    // Vownet forms from files
    ...reportFiles
      .filter((f: any) => f.is_vownet_form)
      .map((f: any) => ({
        id: f.id,
        type: 'vownet' as const,
        name: f.file_name || 'Vownet Form',
        generatedAt: f.uploaded_at,
        status: 'completed' as const,
        fileUrl: f.file_path,
      })),
    // Other report types from files
    ...reportFiles
      .filter((f: any) => f.report_type && !f.is_vownet_form)
      .map((f: any) => ({
        id: f.id,
        type: f.report_type as 'portfolio' | 'property' | 'investment',
        name: f.file_name || `${f.report_type} Report`,
        generatedAt: f.uploaded_at,
        status: 'completed' as const,
        fileUrl: f.file_path,
        propertyAddress: f.description,
      })),
    // Investment reports from investment_reports table
    ...investmentReports.map((r: any) => ({
      id: r.id,
      type: 'investment' as const,
      name: `Investment Report - ${r.property_address}`,
      generatedAt: r.created_at,
      status: (r.status === 'completed' ? 'completed' : r.status === 'failed' ? 'failed' : 'pending') as 'completed' | 'pending' | 'failed',
      propertyAddress: r.property_address,
    })),
  ];

  const getReportIcon = (type: string) => {
    switch (type) {
      case 'vownet':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'portfolio':
        return <PieChart className="h-4 w-4" />;
      case 'property':
      case 'investment':
        return <Building2 className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getReportBadgeVariant = (type: string) => {
    switch (type) {
      case 'vownet':
        return 'default';
      case 'portfolio':
        return 'secondary';
      case 'property':
      case 'investment':
        return 'outline';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('investment-reports')
        .download(fileUrl);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Report downloaded');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download report');
    }
  };

  return (
    <div className="space-y-6">
      {/* Generate Report Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate New Report
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {/* Vownet Form */}
            {fullClient && (
              <VownetPDFGenerator
                data={{
                  client: fullClient,
                  properties,
                  employment,
                  income,
                  assets,
                  liabilities,
                }}
                clientName={clientName}
                onEmailClick={onEmailClick}
              />
            )}

            {/* Portfolio Analysis */}
            {properties.length > 0 && (
              <PortfolioAnalysisPDFGenerator
                clientId={clientId}
                clientName={clientName}
              />
            )}

            {/* Individual Property Reports Dropdown */}
            {properties.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Building2 className="h-4 w-4 mr-2" />
                    Property Report
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>Select Property</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {properties.map((property) => (
                    <DropdownMenuItem
                      key={property.id}
                      onClick={() => setSelectedProperty(property.id)}
                      className="flex items-start gap-2 py-2"
                    >
                      <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[200px]">
                          {property.address}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {property.property_type === 'investment' ? 'Investment' : 'Owner Occupied'}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Quick Email Button */}
            <Button variant="outline" size="sm" onClick={onOpenEmailCompose}>
              <Mail className="h-4 w-4 mr-2" />
              Email Client
            </Button>
          </div>

          {/* Selected Property Report Generator */}
          {selectedProperty && (() => {
            const selectedProp = properties.find(p => p.id === selectedProperty);
            if (!selectedProp) return null;
            return (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedProp.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PropertyReportGenerator
                    property={selectedProp}
                    clientName={clientName}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProperty(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Report History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Report History
            {allReports.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {allReports.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No reports generated yet</p>
              <p className="text-xs mt-1">Use the buttons above to generate client reports</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allReports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-md bg-muted flex-shrink-0">
                      {getReportIcon(report.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{report.name}</span>
                        <Badge variant={getReportBadgeVariant(report.type)} className="text-xs flex-shrink-0">
                          {report.type.charAt(0).toUpperCase() + report.type.slice(1)}
                        </Badge>
                        {getStatusIcon(report.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span className="flex-shrink-0">{format(new Date(report.generatedAt), 'dd MMM yyyy, HH:mm')}</span>
                        {report.propertyAddress && (
                          <>
                            <span>•</span>
                            <span className="truncate">{report.propertyAddress}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Investment reports from investment_reports table - open in viewer */}
                    {report.type === 'investment' && !report.fileUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          // Open in investment report view page
                          window.open(`/investment-report/${report.id}`, '_blank');
                        }}
                        title="View Report"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {report.fileUrl && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownloadFile(report.fileUrl!, report.name)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            // Open in new tab
                            window.open(
                              `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/investment-reports/${report.fileUrl}`,
                              '_blank'
                            );
                          }}
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Send Section */}
      {allReports.length > 0 && clientEmail && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Send className="h-4 w-4" />
              Quick Send
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Send reports directly to {clientName} at {clientEmail}
            </p>
            <Button size="sm" onClick={onOpenEmailCompose}>
              <Mail className="h-4 w-4 mr-2" />
              Compose Email with Reports
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
