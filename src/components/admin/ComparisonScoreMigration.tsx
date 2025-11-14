import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Database, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function ComparisonScoreMigration() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    totalProcessed?: number;
    migrated?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);
  const { toast } = useToast();

  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('migrate-comparison-scores');

      if (error) {
        throw error;
      }

      setResult(data);

      if (data.success && data.migrated > 0) {
        toast({
          title: "Migration Complete",
          description: `Successfully migrated ${data.migrated} comparison(s) to new score format.`,
        });
      } else if (data.migrated === 0) {
        toast({
          title: "No Migration Needed",
          description: "All comparisons are already using the correct score format.",
        });
      }
    } catch (err) {
      console.error('Migration error:', err);
      toast({
        title: "Migration Failed",
        description: err instanceof Error ? err.message : "Failed to run migration",
        variant: "destructive",
      });
      setResult({
        success: false,
        errors: [err instanceof Error ? err.message : "Unknown error"]
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Comparison Score Migration
        </CardTitle>
        <CardDescription>
          Migrate legacy comparison scores from 0-10 scale to 0-100 scale
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This migration will normalize all comparison scores that appear to be on a 0-10 scale
            (scores less than 15) by multiplying them by 10. This is a one-time operation.
          </AlertDescription>
        </Alert>

        <Button 
          onClick={runMigration} 
          disabled={isRunning}
          className="w-full"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Migration...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Run Migration
            </>
          )}
        </Button>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              {result.success ? (
                <div className="space-y-1">
                  <p className="font-medium">Migration Results:</p>
                  <ul className="list-disc list-inside text-sm">
                    <li>Total Processed: {result.totalProcessed}</li>
                    <li>Migrated: {result.migrated}</li>
                    <li>Skipped (already correct): {result.skipped}</li>
                  </ul>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-destructive">Errors:</p>
                      <ul className="list-disc list-inside text-sm">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="font-medium">Migration Failed</p>
                  {result.errors && result.errors.length > 0 && (
                    <ul className="list-disc list-inside text-sm mt-1">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
