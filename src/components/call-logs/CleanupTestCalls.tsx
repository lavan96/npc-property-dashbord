import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Trash2, Loader2, Plus, X, Settings2 } from 'lucide-react';

// Default test phone numbers
const DEFAULT_TEST_NUMBERS = [
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
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [testNumbers, setTestNumbers] = useState<string[]>(DEFAULT_TEST_NUMBERS);
  const [newNumber, setNewNumber] = useState('');

  const handleAddNumber = () => {
    const trimmedNumber = newNumber.trim();
    if (!trimmedNumber) return;
    
    // Basic validation - should start with + and contain digits
    if (!/^\+?[\d\s-]+$/.test(trimmedNumber)) {
      toast({
        title: 'Invalid Number',
        description: 'Please enter a valid phone number',
        variant: 'destructive',
      });
      return;
    }

    // Normalize the number (remove spaces and dashes)
    const normalizedNumber = trimmedNumber.replace(/[\s-]/g, '');
    
    if (testNumbers.includes(normalizedNumber)) {
      toast({
        title: 'Duplicate Number',
        description: 'This number is already in the list',
        variant: 'destructive',
      });
      return;
    }

    setTestNumbers([...testNumbers, normalizedNumber]);
    setNewNumber('');
  };

  const handleRemoveNumber = (numberToRemove: string) => {
    setTestNumbers(testNumbers.filter(n => n !== numberToRemove));
  };

  const handleCleanup = async () => {
    if (testNumbers.length === 0) {
      toast({
        title: 'No Numbers Selected',
        description: 'Please add at least one test number to clean up',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { deletedCount, error } = await cleanupTestCalls(testNumbers);

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
    <div className="flex items-center gap-2">
      {/* Manage Numbers Popover */}
      <Popover open={isManageOpen} onOpenChange={setIsManageOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">Test Numbers ({testNumbers.length})</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Test Phone Numbers</h4>
              <p className="text-xs text-muted-foreground">
                Calls from these numbers will be removed when flushing test calls.
              </p>
            </div>
            
            {/* Add new number */}
            <div className="flex gap-2">
              <Input
                placeholder="+61400000000"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddNumber()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddNumber} disabled={!newNumber.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Number list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {testNumbers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No test numbers configured
                </p>
              ) : (
                testNumbers.map((number) => (
                  <div
                    key={number}
                    className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2"
                  >
                    <span className="font-mono text-sm">{number}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveNumber(number)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Reset to defaults */}
            {JSON.stringify(testNumbers.sort()) !== JSON.stringify(DEFAULT_TEST_NUMBERS.sort()) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setTestNumbers(DEFAULT_TEST_NUMBERS)}
              >
                Reset to defaults
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Flush Button with Confirmation */}
      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 text-destructive hover:text-destructive"
            disabled={testNumbers.length === 0}
          >
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
              <ul className="list-disc list-inside space-y-1 text-foreground/80 font-mono text-sm max-h-32 overflow-y-auto">
                {testNumbers.map((number) => (
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
    </div>
  );
};
