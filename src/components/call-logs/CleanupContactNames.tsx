import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UserCheck, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { logActivityDirect } from '@/hooks/useActivityLogger';

interface CleanupResult {
  id: string;
  status: string;
  name?: string;
}

interface CleanupResponse {
  success: boolean;
  message?: string;
  error?: string;
  processed: number;
  updated: number;
  skipped: number;
  hasMore: boolean;
  nextOffset: number | null;
  totalRecords: number;
  results: CleanupResult[];
}

export const CleanupContactNames: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runCleanup = async () => {
    setIsRunning(true);
    setProgress(0);
    setProcessedCount(0);
    setUpdatedCount(0);
    setCurrentBatch(0);
    setLogs([]);

    addLog('Starting contact name cleanup...');
    addLog(forceUpdate ? 'Mode: Force update all records' : 'Mode: Update only missing/empty names');

    let offset = 0;
    const batchSize = 50;
    let hasMore = true;
    let totalUpdated = 0;
    let totalProcessed = 0;

    try {
      while (hasMore) {
        setCurrentBatch(prev => prev + 1);
        addLog(`Processing batch ${Math.floor(offset / batchSize) + 1}...`);

        const { data, error } = await invokeSecureFunction<CleanupResponse>('cleanup-call-log-names', {
          batchSize,
          offset,
          forceUpdate,
        });

        if (error) {
          addLog(`Error: ${error.message}`);
          toast.error(`Cleanup failed: ${error.message}`);
          break;
        }

        if (!data?.success) {
          addLog(`Error: ${data?.error || 'Unknown error'}`);
          toast.error(`Cleanup failed: ${data?.error}`);
          break;
        }

        totalProcessed += data.processed;
        totalUpdated += data.updated;
        setProcessedCount(totalProcessed);
        setUpdatedCount(totalUpdated);
        setTotalRecords(data.totalRecords);

        // Calculate progress
        const progressPercent = data.totalRecords > 0 
          ? Math.round((totalProcessed / data.totalRecords) * 100) 
          : 100;
        setProgress(progressPercent);

        addLog(`Batch complete: ${data.updated} updated, ${data.skipped} skipped`);

        // Log some sample updates
        const updates = data.results?.filter(r => r.status === 'updated').slice(0, 3) || [];
        updates.forEach(u => {
          if (u.name) addLog(`  → Updated: ${u.name}`);
        });

        hasMore = data.hasMore;
        if (data.nextOffset !== null) {
          offset = data.nextOffset;
        } else {
          hasMore = false;
        }

        // Small delay between batches to prevent rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      addLog(`✓ Cleanup complete! Updated ${totalUpdated} of ${totalProcessed} records.`);
      toast.success(`Cleanup complete! Updated ${totalUpdated} contact names.`);

      // Log activity
      logActivityDirect({
        actionType: 'settings_updated',
        entityType: 'call_log',
        entityName: 'Contact Name Cleanup',
        metadata: { 
          action: 'cleanup_contact_names',
          totalProcessed, 
          totalUpdated,
          forceUpdate,
        }
      });

      // Trigger refresh if callback provided
      if (onComplete) {
        onComplete();
      }

    } catch (error: any) {
      addLog(`Error: ${error.message}`);
      toast.error(`Cleanup failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserCheck className="h-4 w-4" />
          Cleanup Names
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Cleanup Contact Names
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">What This Does</CardTitle>
              <CardDescription className="text-xs">
                Syncs contact names from GoHighLevel CRM
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1 list-disc list-inside">
                <li>Looks up each call's phone number in GHL</li>
                <li>Updates customer name with GHL contact's full name</li>
                <li>Links GHL contact ID for future reference</li>
                <li>Applies proper name capitalization (Mc, Mac, O', etc.)</li>
              </ul>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="force-update" className="text-sm font-medium">
                Force Update All
              </Label>
              <p className="text-xs text-muted-foreground">
                Re-sync all records, even those with existing names
              </p>
            </div>
            <Switch
              id="force-update"
              checked={forceUpdate}
              onCheckedChange={setForceUpdate}
              disabled={isRunning}
            />
          </div>

          {isRunning && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Processing batch {currentBatch}...</span>
                <span className="text-muted-foreground">
                  {processedCount} / {totalRecords || '?'} records
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {updatedCount} updated
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  {processedCount - updatedCount} skipped
                </Badge>
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Activity Log</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[150px] p-3">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log, i) => (
                      <div key={i} className="text-muted-foreground">
                        {log}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={runCleanup}
            disabled={isRunning}
            className="w-full gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Start Cleanup
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            This may take a few minutes for large datasets. Do not close this dialog.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
