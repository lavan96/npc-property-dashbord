import { useState, useEffect } from 'react';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings2, Trash2, Play, Pause, AlertTriangle, Zap, History, RefreshCw, Eye, XCircle } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { SwitchConfigModal } from '@/components/automation/SwitchConfigModal';
import { GenerationLogModal } from '@/components/automation/GenerationLogModal';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { DashboardThemeFrame } from '@/components/layout/DashboardThemeFrame';

interface AutoReportSwitch {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  priority: number;
  criteria: SwitchCriteria;
  created_at: string;
  updated_at: string;
}

// Helper to cast Json to SwitchCriteria
const parseCriteria = (criteria: unknown): SwitchCriteria => {
  if (typeof criteria === 'object' && criteria !== null) {
    return criteria as SwitchCriteria;
  }
  return {};
};

export interface SwitchCriteria {
  propertyTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  bedsMin?: number | null;
  bedsMax?: number | null;
  bathsMin?: number | null;
  bathsMax?: number | null;
  states?: string[];
  categories?: string[];
  confidenceMin?: number | null;
  hasPrice?: boolean | null;
  sourceHosts?: string[];
}

const Automation = () => {
  const { canEdit, canDelete } = useModulePermissions('automation');
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [switches, setSwitches] = useState<AutoReportSwitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterLoading, setMasterLoading] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingSwitch, setEditingSwitch] = useState<AutoReportSwitch | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ total: number; generated: number; lastSync?: string } | null>(null);

  useEffect(() => {
    fetchMasterSettings();
    fetchSwitches();
    fetchSyncStats();
  }, []);

  const fetchSyncStats = async () => {
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'getSyncStats'
    });
    
    if (!error && data?.success) {
      setSyncStats(data.stats);
    }
  };

  const runSync = async (dryRun: boolean = false) => {
    setSyncing(true);
    try {
      const response = await invokeSecureFunction('auto-report-sync', {
        maxRecords: 50, dryRun
      });
      
      if (response.error) throw response.error;
      
      const result = response.data;
      
      if (dryRun) {
        const matches = result.results?.filter((r: any) => r.status === 'generated').length || 0;
        toast.success(`Dry run complete: ${matches} listing(s) would be processed`);
      } else {
        toast.success(`Sync complete: ${result.summary?.generated || 0} report(s) generated`);
        fetchSyncStats();
      }
    } catch (error) {
      toast.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const clearQueue = async () => {
    setClearing(true);
    try {
      // Delete reports that are stuck in processing, pending, or failed status via edge function
      const { data, error } = await invokeSecureFunction('manage-automation-settings', {
        operation: 'clearStuckReports'
      });

      if (error || !data?.success) throw new Error(data?.error || error?.message);

      const count = data?.length || 0;
      toast.success(`Cleared ${count} report(s) from queue`);
      fetchSyncStats();
      
      logActivityDirect({
        actionType: 'report_deleted',
        entityType: 'investment_report',
        entityName: `Cleared ${count} stuck reports`,
        metadata: { statuses: ['processing', 'pending', 'failed'], count }
      });
    } catch (error) {
      toast.error(`Failed to clear queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearing(false);
    }
  };

  const fetchMasterSettings = async () => {
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'getMasterSettings'
    });
    
    if (!error && data?.success) {
      setMasterEnabled(data.settings?.is_enabled || false);
    }
  };

  const fetchSwitches = async () => {
    setLoading(true);
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'getSwitches'
    });
    
    if (error || !data?.success) {
      toast.error('Failed to load switches');
    } else {
      setSwitches((data.switches || []).map((d: any) => ({
        ...d,
        criteria: parseCriteria(d.criteria)
      })));
    }
    setLoading(false);
  };

  const toggleMaster = async () => {
    setMasterLoading(true);
    const newValue = !masterEnabled;
    
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'updateMasterSettings',
      data: { is_enabled: newValue }
    });
    
    if (error || !data?.success) {
      toast.error('Failed to update master switch');
    } else {
      setMasterEnabled(newValue);
      toast.success(newValue ? 'Auto-generation enabled' : 'Auto-generation disabled');
      logActivityDirect({
        actionType: 'automation_master_toggle_changed',
        entityType: 'automation_switch',
        entityName: 'Master Switch',
        metadata: { enabled: newValue }
      });
    }
    setMasterLoading(false);
  };

  const toggleSwitch = async (switchItem: AutoReportSwitch) => {
    const newValue = !switchItem.is_enabled;
    
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'updateSwitch',
      switchId: switchItem.id,
      data: { is_enabled: newValue }
    });
    
    if (error || !data?.success) {
      toast.error('Failed to update switch');
    } else {
      setSwitches(prev => prev.map(s => 
        s.id === switchItem.id ? { ...s, is_enabled: newValue } : s
      ));
      toast.success(`Switch "${switchItem.name}" ${newValue ? 'enabled' : 'disabled'}`);
      logActivityDirect({
        actionType: newValue ? 'automation_switch_enabled' : 'automation_switch_disabled',
        entityType: 'automation_switch',
        entityId: switchItem.id,
        entityName: switchItem.name
      });
    }
  };

  const deleteSwitch = async (switchItem: AutoReportSwitch) => {
    if (!confirm(`Are you sure you want to delete "${switchItem.name}"?`)) return;
    
    const { data, error } = await invokeSecureFunction('manage-automation-settings', {
      operation: 'deleteSwitch',
      switchId: switchItem.id
    });
    
    if (error || !data?.success) {
      toast.error('Failed to delete switch');
    } else {
      setSwitches(prev => prev.filter(s => s.id !== switchItem.id));
      toast.success('Switch deleted');
      logActivityDirect({
        actionType: 'automation_switch_deleted',
        entityType: 'automation_switch',
        entityId: switchItem.id,
        entityName: switchItem.name
      });
    }
  };

  const openEditModal = (switchItem: AutoReportSwitch) => {
    setEditingSwitch(switchItem);
    setConfigModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingSwitch(null);
    setConfigModalOpen(true);
  };

  const handleSwitchSaved = () => {
    fetchSwitches();
    setConfigModalOpen(false);
    setEditingSwitch(null);
  };

  const getCriteriaCount = (criteria: SwitchCriteria): number => {
    let count = 0;
    if (criteria.propertyTypes?.length) count++;
    if (criteria.priceMin !== null && criteria.priceMin !== undefined) count++;
    if (criteria.priceMax !== null && criteria.priceMax !== undefined) count++;
    if (criteria.bedsMin !== null && criteria.bedsMin !== undefined) count++;
    if (criteria.bedsMax !== null && criteria.bedsMax !== undefined) count++;
    if (criteria.bathsMin !== null && criteria.bathsMin !== undefined) count++;
    if (criteria.bathsMax !== null && criteria.bathsMax !== undefined) count++;
    if (criteria.states?.length) count++;
    if (criteria.categories?.length) count++;
    if (criteria.confidenceMin !== null && criteria.confidenceMin !== undefined) count++;
    if (criteria.hasPrice !== null && criteria.hasPrice !== undefined) count++;
    if (criteria.sourceHosts?.length) count++;
    return count;
  };

  const enabledSwitchesCount = switches.filter(s => s.is_enabled).length;

  return (
    <>
      <DashboardThemeFrame
        variant="page"
        className="space-y-6 rounded-[2rem] bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_30%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)/0.92))] p-3 pb-8 text-foreground sm:p-5 lg:p-6"
      >
        {/* Header */}
        <DashboardThemeFrame
          as="header"
          variant="hero"
          className="flex min-w-0 flex-col gap-4 border-primary/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--card)/0.98),hsl(var(--background)/0.86)_54%,hsl(var(--muted)/0.34))] shadow-[0_22px_70px_rgba(15,23,42,0.10)] dark:shadow-black/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_14px_35px_hsl(var(--primary)/0.16)]">
              <Zap className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Auto-Generation Switchbot</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Configure automated investment report generation for incoming listings
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              onClick={() => setLogModalOpen(true)}
              size="sm"
              className="min-h-[44px] border-border/70 bg-background/80 shadow-sm transition-all hover:border-primary/35 hover:bg-primary/10 hover:text-foreground focus-visible:ring-primary/45 sm:size-default"
            >
              <History className="h-4 w-4 mr-2" />
              View Log
            </Button>
          </div>
        </DashboardThemeFrame>

        {/* Airtable Sync Controls */}
        <Card className="overflow-hidden rounded-2xl border border-blue-500/25 bg-[linear-gradient(135deg,hsl(var(--info)/0.08),hsl(var(--card)/0.92))] shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:shadow-black/20">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20 shrink-0">
                  <Zap className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Airtable Sync</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sync new listings from Airtable and auto-generate reports based on your switch criteria.
                  </p>
                  {syncStats && (
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      <Badge variant="outline">{syncStats.total} processed</Badge>
                      <Badge variant="secondary">{syncStats.generated} reports generated</Badge>
                      {syncStats.lastSync && (
                        <span className="text-muted-foreground">
                          Last: {new Date(syncStats.lastSync).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:shrink-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={clearing || !syncStats?.total}
                      className="text-destructive hover:text-destructive min-h-[44px] sm:min-h-0"
                    >
                      <XCircle className={`h-4 w-4 mr-1 ${clearing ? 'animate-spin' : ''}`} />
                      {clearing ? 'Clearing...' : 'Clear Queue'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="w-[95vw] sm:w-auto">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear Stuck Reports?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all reports with "processing", "pending", or "failed" status. 
                        Completed reports will NOT be affected. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearQueue} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Clear Queue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => runSync(true)}
                  disabled={syncing || !masterEnabled}
                  className="min-h-[44px] sm:min-h-0"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Dry Run
                </Button>
                <Button 
                  size="sm"
                  onClick={() => runSync(false)}
                  disabled={syncing || !masterEnabled}
                  className="min-h-[44px] sm:min-h-0"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Master Switch Card */}
        <Card className={masterEnabled ? 'overflow-hidden rounded-2xl border-green-500/40 bg-[linear-gradient(135deg,hsl(var(--success)/0.10),hsl(var(--card)/0.94))] shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:shadow-black/20' : 'overflow-hidden rounded-2xl border-border/70 bg-card/90 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-white/10 dark:shadow-black/20'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${masterEnabled ? 'bg-green-500/20' : 'bg-muted'}`}>
                  <Zap className={`h-5 w-5 ${masterEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <CardTitle className="text-xl">Master Switch</CardTitle>
                  <CardDescription>
                    {masterEnabled 
                      ? `Active with ${enabledSwitchesCount} enabled switch${enabledSwitchesCount !== 1 ? 'es' : ''}`
                      : 'All auto-generation is currently disabled'
                    }
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${masterEnabled ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {masterEnabled ? 'ON' : 'OFF'}
                </span>
                <Switch 
                  checked={masterEnabled} 
                  onCheckedChange={toggleMaster}
                  disabled={masterLoading}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>
            </div>
          </CardHeader>
          {!masterEnabled && switches.some(s => s.is_enabled) && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-amber-500 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>You have enabled switches but the master switch is off. No reports will be auto-generated.</span>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Switches Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold">Filter Switches</h2>
            {canEdit && (
              <Button onClick={openCreateModal} size="sm" className="sm:size-default min-h-[44px] sm:min-h-0">
                <Plus className="h-4 w-4 mr-2" />
                Create Switch
              </Button>
            )}
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading switches...
              </CardContent>
            </Card>
          ) : switches.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <Settings2 className="h-12 w-12 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium">No switches configured</p>
                    <p className="text-sm text-muted-foreground">
                      Create your first switch to start auto-generating reports
                    </p>
                  </div>
                  {canEdit && (
                    <Button onClick={openCreateModal} className="mt-2">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Switch
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {switches.map((switchItem) => (
                <Card 
                  key={switchItem.id} 
                  className={switchItem.is_enabled ? 'border-primary/30' : 'border-muted'}
                >
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <Switch
                          checked={switchItem.is_enabled}
                          onCheckedChange={() => toggleSwitch(switchItem)}
                          disabled={!masterEnabled || !canEdit}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{switchItem.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {getCriteriaCount(switchItem.criteria)} criteria
                            </Badge>
                            {switchItem.is_enabled ? (
                              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                                <Play className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                <Pause className="h-3 w-3 mr-1" />
                                Paused
                              </Badge>
                            )}
                          </div>
                          {switchItem.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {switchItem.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {canEdit && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditModal(switchItem)}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => deleteSwitch(switchItem)}
                            className="text-destructive hover:text-destructive min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardThemeFrame>

      <SwitchConfigModal
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
        editingSwitch={editingSwitch}
        onSaved={handleSwitchSaved}
        existingSwitches={switches}
      />

      <GenerationLogModal
        open={logModalOpen}
        onOpenChange={setLogModalOpen}
      />
    </>
  );
};

export default Automation;
