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
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { useNotifications } from '@/contexts/NotificationsContext';

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
  const { addNotification } = useNotifications();

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      setShowConfirm(false);

      const toastId = toast.loading('Regenerating report...', {
        description: 'Fetching report data and manual overrides...'
      });

      // Fetch the full report with manual overrides via secure function
      const { data: reportData, error: fetchError } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: {
          select: 'report_content, manual_overrides, financial_calculations, current_version, status, last_completed_section'
        }
      });

      if (fetchError || !reportData?.report) {
        throw new Error(fetchError?.message || 'Failed to fetch report');
      }

      const report = reportData.report;

      if (!report?.report_content) {
        throw new Error('Report content not found');
      }

      // Check if this is a resume operation (report was interrupted)
      const isResume = report.status === 'failed' && (report.last_completed_section || 0) > 0;
      
      toast.loading(isResume ? 'Resuming regeneration...' : 'Processing with Perplexity AI...', {
        id: toastId,
        description: isResume 
          ? `Continuing from section ${(report.last_completed_section || 0) + 1}/12...`
          : 'Generating 12 sections with fresh qualitative analysis (this may take 3-5 minutes)...'
      });

      // Add "regeneration started" notification
      addNotification({
        type: 'report_regeneration_started',
        title: isResume ? 'Report Resuming' : 'Report Regeneration Started',
        message: isResume 
          ? `Resuming regeneration for ${propertyAddress} from section ${(report.last_completed_section || 0) + 1}...`
          : `Regenerating report for ${propertyAddress}...`,
        entityId: reportId
      });

      // Call the regenerate-report-qualitative edge function
      // Note: Status is set to 'processing' inside the edge function
      const { data, error } = await invokeSecureFunction('regenerate-report-qualitative', {
        reportId,
        manualOverrides: report.manual_overrides || {},
        currentReportContent: report.report_content,
        propertyAddress,
        financialCalculations: report.financial_calculations || {},
        continueFrom: isResume // Enable resume mode if report was interrupted
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to regenerate report');
      }

      // Fetch the new version number after successful regeneration via secure function
      const { data: updatedReportData } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: {
          select: 'current_version, status'
        }
      });

      const updatedReport = updatedReportData?.report;
      const newVersion = updatedReport?.current_version || (report.current_version || 1) + 1;

      toast.success('Report regenerated successfully', {
        id: toastId,
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

      // Revert status to failed on error via secure function
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { status: 'failed' }
      });
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
