import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings2, Trash2, Play, Pause, AlertTriangle, Zap, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SwitchConfigModal } from '@/components/automation/SwitchConfigModal';
import { GenerationLogModal } from '@/components/automation/GenerationLogModal';

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
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [switches, setSwitches] = useState<AutoReportSwitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterLoading, setMasterLoading] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [editingSwitch, setEditingSwitch] = useState<AutoReportSwitch | null>(null);

  useEffect(() => {
    fetchMasterSettings();
    fetchSwitches();
  }, []);

  const fetchMasterSettings = async () => {
    const { data, error } = await supabase
      .from('auto_report_master_settings')
      .select('*')
      .single();
    
    if (!error && data) {
      setMasterEnabled(data.is_enabled);
    }
  };

  const fetchSwitches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('auto_report_switches')
      .select('*')
      .order('priority', { ascending: false });
    
    if (error) {
      toast.error('Failed to load switches');
    } else {
      setSwitches((data || []).map(d => ({
        ...d,
        criteria: parseCriteria(d.criteria)
      })));
    }
    setLoading(false);
  };

  const toggleMaster = async () => {
    setMasterLoading(true);
    const newValue = !masterEnabled;
    
    const { error } = await supabase
      .from('auto_report_master_settings')
      .update({ is_enabled: newValue, updated_at: new Date().toISOString() })
      .eq('id', (await supabase.from('auto_report_master_settings').select('id').single()).data?.id);
    
    if (error) {
      toast.error('Failed to update master switch');
    } else {
      setMasterEnabled(newValue);
      toast.success(newValue ? 'Auto-generation enabled' : 'Auto-generation disabled');
    }
    setMasterLoading(false);
  };

  const toggleSwitch = async (switchItem: AutoReportSwitch) => {
    const newValue = !switchItem.is_enabled;
    
    const { error } = await supabase
      .from('auto_report_switches')
      .update({ is_enabled: newValue })
      .eq('id', switchItem.id);
    
    if (error) {
      toast.error('Failed to update switch');
    } else {
      setSwitches(prev => prev.map(s => 
        s.id === switchItem.id ? { ...s, is_enabled: newValue } : s
      ));
      toast.success(`Switch "${switchItem.name}" ${newValue ? 'enabled' : 'disabled'}`);
    }
  };

  const deleteSwitch = async (switchItem: AutoReportSwitch) => {
    if (!confirm(`Are you sure you want to delete "${switchItem.name}"?`)) return;
    
    const { error } = await supabase
      .from('auto_report_switches')
      .delete()
      .eq('id', switchItem.id);
    
    if (error) {
      toast.error('Failed to delete switch');
    } else {
      setSwitches(prev => prev.filter(s => s.id !== switchItem.id));
      toast.success('Switch deleted');
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Auto-Generation Switchbot</h1>
            <p className="text-muted-foreground mt-1">
              Configure automated investment report generation for incoming listings
            </p>
          </div>
          <Button variant="outline" onClick={() => setLogModalOpen(true)}>
            <History className="h-4 w-4 mr-2" />
            View Generation Log
          </Button>
        </div>

        {/* Master Switch Card */}
        <Card className={masterEnabled ? 'border-green-500/50 bg-green-500/5' : 'border-muted'}>
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
            <h2 className="text-xl font-semibold">Filter Switches</h2>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              Create Switch
            </Button>
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
                  <Button onClick={openCreateModal} className="mt-2">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Switch
                  </Button>
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={switchItem.is_enabled}
                          onCheckedChange={() => toggleSwitch(switchItem)}
                          disabled={!masterEnabled}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{switchItem.name}</span>
                            <Badge variant="outline" className="text-xs">
                              Priority: {switchItem.priority}
                            </Badge>
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
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditModal(switchItem)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteSwitch(switchItem)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

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
