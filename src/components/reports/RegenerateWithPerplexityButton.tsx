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
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useActivityLogger } from '@/hooks/useActivityLogger';

interface RegenerateWithPerplexityButtonProps {
  reportId: string;
  propertyAddress: string;
  onRegenerated?: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function RegenerateWithPerplexityButton({
  reportId,
  propertyAddress,
  onRegenerated,
  variant = 'outline',
  size = 'sm',
  className = ''
}: RegenerateWithPerplexityButtonProps) {
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

      // Fetch the full report with manual overrides via secure function
      const { data: reportData, error: fetchError } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: {
          select: 'report_content, manual_overrides, financial_calculations'
        }
      });

      if (fetchError || !reportData?.report) {
        throw new Error(fetchError?.message || 'Failed to fetch report');
      }

      const report = reportData.report;

      if (!report?.report_content) {
        throw new Error('Report content not found');
      }

      // Note: The database trigger handles version archiving automatically
      // when status transitions to 'processing'. No need to manually bump version here.

      toast.info('Processing with Perplexity AI...', {
        description: 'Updating qualitative analysis with manual overrides...'
      });

      // Call the regenerate-report-qualitative edge function
      const { data, error } = await invokeSecureFunction('regenerate-report-qualitative', {
        reportId,
        manualOverrides: report.manual_overrides || {},
        currentReportContent: report.report_content,
        propertyAddress,
        financialCalculations: report.financial_calculations || {}
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to regenerate report');
      }

      // Update status back to completed via secure function
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { status: 'completed' }
      });

      // Fetch updated version info from database (trigger bumped it) via secure function
      const { data: updatedReportData } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: {
          select: 'current_version'
        }
      });
      
      const newVersion = updatedReportData?.report?.current_version || 'new';

      toast.success('Report regenerated successfully', {
        description: `Version ${newVersion} created with updated qualitative analysis reflecting your manual overrides.`
      });

      // Log activity - newVersion now declared before this
      logActivity({
        actionType: 'report_regenerated',
        entityType: 'investment_report',
        entityId: reportId,
        entityName: propertyAddress,
        metadata: {
          regenerationType: 'perplexity_qualitative',
          version: newVersion,
          hasManualOverrides: Object.keys(report.manual_overrides || {}).length > 0
        }
      });

      // Callback to refresh the parent component
      if (onRegenerated) {
        onRegenerated();
      }

    } catch (error: any) {
      console.error('Error regenerating report with Perplexity:', error);
      toast.error('Failed to regenerate report', {
        description: error.message || 'Please try again later'
      });

      // Revert status to completed on error via secure function
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { status: 'completed' }
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
        className={`${className}`}
        onClick={() => setShowConfirm(true)}
        disabled={regenerating}
        style={variant === 'default' ? { 
          background: 'linear-gradient(135deg, #1A1A2E 0%, #20B2AA 100%)',
        } : undefined}
      >
        {regenerating ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Regenerating...
          </>
        ) : (
          <>
            <Sparkles className="mr-1 h-3 w-3" />
            Perplexity
          </>
        )}
      </Button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-500" />
              Regenerate with Perplexity AI?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will use Perplexity AI to regenerate the qualitative analysis sections of your report with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All your manual overrides injected as context</li>
                <li>Updated narrative to reflect adjusted figures</li>
                <li>Revised recommendations based on new calculations</li>
                <li>Aligned risk assessments with current data</li>
              </ul>
              <p className="pt-2 font-medium">
                A new version will be created and can be rolled back if needed.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRegenerate}
              className="text-white border-0"
              style={{ 
                background: 'linear-gradient(135deg, #1A1A2E 0%, #20B2AA 100%)',
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Regenerate with Perplexity
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
