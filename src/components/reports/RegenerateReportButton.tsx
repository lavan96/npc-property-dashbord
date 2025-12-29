import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface RegenerateReportButtonProps {
  reportId: string;
  propertyAddress: string;
  onRegenerated?: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function RegenerateReportButton({
  reportId,
  propertyAddress,
  onRegenerated,
  variant = 'outline',
  size = 'sm',
  className = ''
}: RegenerateReportButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { logActivity } = useActivityLogger();

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      setShowConfirm(false);

      toast.info('Regenerating report...', {
        description: 'Fetching report data and manual overrides...'
      });

      // Fetch the full report with manual overrides
      const { data: report, error: fetchError } = await supabase
        .from('investment_reports')
        .select('report_content, manual_overrides, financial_calculations, current_version')
        .eq('id', reportId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      if (!report?.report_content) {
        throw new Error('Report content not found');
      }

      const newVersion = (report.current_version || 1) + 1;

      // Update version and set status to processing
      const { error: updateVersionError } = await supabase
        .from('investment_reports')
        .update({ 
          current_version: newVersion,
          status: 'processing'
        })
        .eq('id', reportId);

      if (updateVersionError) {
        throw updateVersionError;
      }

      toast.info('Processing with Perplexity AI...', {
        description: 'Updating qualitative analysis with manual overrides...'
      });

      // Call the regenerate-report-qualitative edge function
      const { data, error } = await supabase.functions.invoke('regenerate-report-qualitative', {
        body: {
          reportId,
          manualOverrides: report.manual_overrides || {},
          currentReportContent: report.report_content,
          propertyAddress,
          financialCalculations: report.financial_calculations || {}
        }
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to regenerate report');
      }

      // Update status back to completed
      await supabase
        .from('investment_reports')
        .update({ status: 'completed' })
        .eq('id', reportId);

      toast.success('Report regenerated successfully', {
        description: `Version ${newVersion} created with updated qualitative analysis.`
      });

      // Log report regeneration activity
      logActivity({
        actionType: 'report_regenerated',
        entityType: 'investment_report',
        entityId: reportId,
        entityName: propertyAddress,
        metadata: {
          version: newVersion,
          hasManualOverrides: Object.keys(report.manual_overrides || {}).length > 0
        }
      });

      // Callback to refresh the parent component
      if (onRegenerated) {
        onRegenerated();
      }

    } catch (error: any) {
      console.error('Error regenerating report:', error);
      toast.error('Failed to regenerate report', {
        description: error.message || 'Please try again later'
      });

      // Revert status to completed on error
      await supabase
        .from('investment_reports')
        .update({ status: 'completed' })
        .eq('id', reportId);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setShowConfirm(true)}
        disabled={regenerating}
      >
        {regenerating ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Regenerating...
          </>
        ) : (
          <>
            <RefreshCw className="mr-1 h-3 w-3" />
            Regenerate
          </>
        )}
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Report?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will use Perplexity AI to create a new version of the report with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All manual overrides injected as context</li>
                <li>Updated qualitative analysis reflecting your changes</li>
                <li>Revised recommendations and risk assessments</li>
              </ul>
              <p className="pt-2 font-medium">
                The previous version will be archived for comparison.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
