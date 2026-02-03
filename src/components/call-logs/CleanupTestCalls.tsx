import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSecureCallLogs } from '@/hooks/useSecureCallLogs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Trash2, Loader2 } from 'lucide-react';

// Predefined test phone numbers
const TEST_PHONE_NUMBERS = [
  '+61433005110',
  '+61489084599',
];

interface CleanupTestCallsProps {
  onComplete?: () => void;
}

export const CleanupTestCalls = ({ onComplete }: CleanupTestCallsProps) => {
  const { toast } = useToast();
  const { cleanupTestCalls } = useSecureCallLogs();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const { deletedCount, error } = await cleanupTestCalls(TEST_PHONE_NUMBERS);

      if (error) {
        throw new Error(error.message || 'Failed to cleanup test calls');
      }

      toast({
        title: 'Test Calls Cleaned Up',
        description: `Successfully removed ${deletedCount} test call${deletedCount !== 1 ? 's' : ''} from the system.`,
      });

      setIsOpen(false);
      onComplete?.();
    } catch (error) {
      console.error('Error cleaning up test calls:', error);
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'Failed to cleanup test calls',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Flush Test Calls</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Flush Test Calls</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This will permanently delete all call logs from the following test phone numbers:
            </p>
            <ul className="list-disc list-inside space-y-1 text-foreground/80 font-mono text-sm">
              {TEST_PHONE_NUMBERS.map((number) => (
                <li key={number}>{number}</li>
              ))}
            </ul>
            <p className="text-destructive font-medium">
              This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanup}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Flush Test Calls
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
