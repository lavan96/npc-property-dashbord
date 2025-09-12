import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Download, Edit, MapPin, Calendar, FileText, TrendingUp } from 'lucide-react';
import { InvestmentReportEditor } from './InvestmentReportEditor';

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content: string;
  created_at: string;
}

interface InvestmentReportViewerProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
  onReportUpdate?: () => void;
}

export function InvestmentReportViewer({ report, isOpen, onClose, onReportUpdate }: InvestmentReportViewerProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  if (!report) return null;

  const handleDownload = () => {
    const blob = new Blob([report.report_content], { type: 'text/plain' });
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

  // Format the report content for better display
  const formatReportContent = (content: string) => {
    return content
      .split('\n')
      .map((line, index) => {
        // Check if line is a heading (starts with ##)
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="text-lg font-semibold mt-6 mb-3 text-primary">
              {line.replace('## ', '')}
            </h3>
          );
        }
        // Check if line is a subheading (starts with #)
        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="text-xl font-bold mt-8 mb-4">
              {line.replace('# ', '')}
            </h2>
          );
        }
        // Check if line starts with a bullet point
        if (line.startsWith('- ')) {
          return (
            <li key={index} className="ml-4 mb-1">
              {line.replace('- ', '')}
            </li>
          );
        }
        // Regular paragraph
        if (line.trim()) {
          return (
            <p key={index} className="mb-3 leading-relaxed">
              {line}
            </p>
          );
        }
        // Empty line
        return <div key={index} className="mb-2" />;
      });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
                  <Badge variant="secondary">
                    <FileText className="h-3 w-3 mr-1" />
                    Investment Report
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            {/* Report Content */}
            <Card className="flex-1 overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Analysis Report</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleEdit}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit Report
                    </Button>
                    <Button variant="default" size="sm" onClick={handleDownload}>
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full max-h-[500px] p-6">
                  <div className="prose prose-sm max-w-none">
                    {formatReportContent(report.report_content)}
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