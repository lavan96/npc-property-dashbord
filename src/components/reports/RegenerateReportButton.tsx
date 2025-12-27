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

      // Update status to processing
      const { error: updateError } = await supabase
        .from('investment_reports')
        .update({ status: 'processing' })
        .eq('id', reportId);

      if (updateError) {
        throw updateError;
      }

      // Call the edge function to regenerate the report
      const { data, error } = await supabase.functions.invoke('generate-investment-report', {
        body: {
          reportId,
          propertyAddress,
          propertyDetails: null // Will fetch fresh data
        }
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to regenerate report');
      }

      toast.success('Report regenerated successfully', {
        description: 'The latest version is now available with updated data and calculations.'
      });

      // Log report regeneration activity
      logActivity({
        actionType: 'report_regenerated',
        entityType: 'investment_report',
        entityId: reportId,
        entityName: propertyAddress
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
                This will create a new version of the report with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Latest property data from all sources</li>
                <li>Updated financial calculations</li>
                <li>Current market analysis</li>
                <li>Refreshed validation checks</li>
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
