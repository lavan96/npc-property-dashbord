import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Save, Eye, MapPin, Calendar, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content: string;
  created_at: string;
}

interface InvestmentReportEditorProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InvestmentReportEditor({ report, isOpen, onClose }: InvestmentReportEditorProps) {
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('edit');
  const { toast } = useToast();

  useEffect(() => {
    if (report) {
      setEditedContent(report.report_content);
      setHasChanges(false);
    }
  }, [report]);

  if (!report) return null;

  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(value !== report.report_content);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      toast({
        title: "No changes to save",
        description: "The report content hasn't been modified.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('investment_reports')
        .update({ 
          report_content: editedContent,
          updated_at: new Date().toISOString()
        })
        .eq('id', report.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Report saved successfully",
        description: "Your changes have been saved to the database.",
      });
      
      setHasChanges(false);
      
      // Update the original report object
      Object.assign(report, { report_content: editedContent });
      
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        title: "Failed to save report",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm("You have unsaved changes. Are you sure you want to close without saving?")) {
        setEditedContent(report.report_content);
        setHasChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Format the report content for preview
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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Edit Investment Report
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {report.property_address}
            <span>•</span>
            <Calendar className="h-3 w-3" />
            {format(new Date(report.created_at), 'PPp')}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {hasChanges && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You have unsaved changes. Don't forget to save before closing.
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Edit Content
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="flex-1 overflow-hidden mt-0">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Report Content Editor</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Edit the investment analysis report. Use markdown formatting for headings (# and ##) and bullet points (-).
                  </p>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0">
                  <Textarea
                    value={editedContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Enter your investment analysis report content..."
                    className="w-full h-full min-h-[500px] resize-none border-0 rounded-none focus:ring-0 p-6 font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Report Preview
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Preview how your edited report will appear to viewers.
                  </p>
                </CardHeader>
                <Separator />
                <CardContent className="flex-1 overflow-hidden p-0">
                  <ScrollArea className="h-full p-6">
                    <div className="prose prose-sm max-w-none">
                      {formatReportContent(editedContent)}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasChanges ? (
              <Badge variant="outline" className="text-orange-600 border-orange-200">
                <AlertCircle className="h-3 w-3 mr-1" />
                Unsaved changes
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-600 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                All changes saved
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {editedContent.length} characters
            </span>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || isSaving}
              className="min-w-[100px]"
            >
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Saving...
                </div>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}