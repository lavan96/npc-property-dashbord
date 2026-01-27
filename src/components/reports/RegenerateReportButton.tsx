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
import { RefreshCw, Loader2 } from 'lucide-react';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useChunkedRegeneration } from '@/hooks/useChunkedRegeneration';

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
  const { logActivity } = useActivityLogger();
  const { addNotification } = useNotifications();
  
  const { 
    isRegenerating, 
    currentSection, 
    totalSections, 
    regenerate 
  } = useChunkedRegeneration();

  const handleRegenerate = async () => {
    setShowConfirm(false);

    addNotification({
      type: 'report_regeneration_started',
      title: 'Report Regeneration Started',
      message: `Regenerating report for ${propertyAddress} (chunked mode)...`,
      entityId: reportId
    });

    await regenerate({
      reportId,
      propertyAddress,
      onProgress: (section, total) => {
        console.log(`[RegenerateReportButton] Progress: ${section}/${total}`);
      },
      onComplete: () => {
        logActivity({
          actionType: 'report_regenerated',
          entityType: 'investment_report',
          entityId: reportId,
          entityName: propertyAddress,
          metadata: { regenerationType: 'chunked' }
        });
        onRegenerated?.();
      },
      onError: (error) => {
        console.error('[RegenerateReportButton] Error:', error);
      }
    });
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setShowConfirm(true)}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {currentSection}/{totalSections}
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
