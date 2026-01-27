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
import { Sparkles, Loader2 } from 'lucide-react';
import { useActivityLogger } from '@/hooks/useActivityLogger';
import { useChunkedRegeneration } from '@/hooks/useChunkedRegeneration';

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
  const { logActivity } = useActivityLogger();
  
  const { 
    isRegenerating, 
    currentSection, 
    totalSections, 
    regenerate 
  } = useChunkedRegeneration();

  const handleRegenerate = async () => {
    setShowConfirm(false);

    await regenerate({
      reportId,
      propertyAddress,
      onComplete: () => {
        logActivity({
          actionType: 'report_regenerated',
          entityType: 'investment_report',
          entityId: reportId,
          entityName: propertyAddress,
          metadata: { regenerationType: 'perplexity_qualitative_chunked' }
        });
        onRegenerated?.();
      }
    });
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`${className}`}
        onClick={() => setShowConfirm(true)}
        disabled={isRegenerating}
        style={variant === 'default' ? { 
          background: 'linear-gradient(135deg, #1A1A2E 0%, #20B2AA 100%)',
        } : undefined}
      >
        {isRegenerating ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {currentSection}/{totalSections}
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
