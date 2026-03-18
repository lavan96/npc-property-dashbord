import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';

interface AddClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddClientModal({ open, onOpenChange }: AddClientModalProps) {
  const queryClient = useQueryClient();
  const [syncToGHL, setSyncToGHL] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [formData, setFormData] = useState({
    primary_first_name: '',
    primary_surname: '',
    primary_email: '',
    primary_mobile: '',
    secondary_first_name: '',
    secondary_surname: '',
    current_address: '',
  });

  // Fetch GHL pipeline stages for the dropdown
  const { data: pipelineStages } = useQuery({
    queryKey: ['ghl-pipeline-stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ghl_pipeline_stages')
        .select('id, ghl_id, name, position, pipeline_id, ghl_pipelines!inner(name, ghl_id)')
        .order('position', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async () => {
      const clientData = {
        primary_first_name: formData.primary_first_name.trim(),
        primary_surname: formData.primary_surname.trim(),
        primary_email: formData.primary_email.trim() || null,
        primary_mobile: formData.primary_mobile.trim() || null,
        secondary_first_name: formData.secondary_first_name.trim() || null,
        secondary_surname: formData.secondary_surname.trim() || null,
        current_address: formData.current_address.trim() || null,
        ghl_sync_status: syncToGHL ? 'pending' : null,
        total_portfolio_value: 0,
        total_debt: 0,
        net_monthly_cash_flow: 0,
      };

      let newClient: any = null;

      // Use secure Edge Function with HttpOnly cookie auth
      try {
        const { data, error } = await invokeSecureFunction('manage-client-data', {
          operation: 'create',
          table: 'clients',
          clientId: '',
          data: clientData,
        });
        
        if (!error && data?.success) {
          newClient = data.result;
        }
      } catch (err) {
        console.warn('Edge function failed, falling back to direct query:', err);
      }
      
      // Fallback to direct query if Edge Function failed
      if (!newClient) {
        const { data, error } = await supabase
          .from('clients')
          .insert(clientData)
          .select()
          .single();

        if (error) throw error;
        newClient = data;
      }

      // Sync to GHL if enabled
      if (syncToGHL && newClient) {
        const syncPayload: any = { clientId: newClient.id };
        
        // If a pipeline stage was selected, include it for opportunity creation
        if (selectedStageId) {
          const stage = pipelineStages?.find((s: any) => s.id === selectedStageId);
          if (stage) {
            syncPayload.pipelineStageGhlId = stage.ghl_id;
            syncPayload.pipelineGhlId = (stage as any).ghl_pipelines?.ghl_id;
          }
        }
        
        const { data: syncResult, error: syncError } = await invokeSecureFunction('sync-client-to-ghl', syncPayload);

        if (syncError) {
          console.error('GHL sync error:', syncError);
          toast.warning('Client created but failed to sync to GHL');
        } else if (syncResult?.success) {
          toast.success('Client created and synced to GoHighLevel');
          return newClient;
        }
      }

      return newClient;
    },
    onSuccess: (newClient: any) => {
      // Log activity
      logActivityDirect({
        actionType: 'client_created',
        entityType: 'client',
        entityId: newClient?.id,
        entityName: `${formData.primary_first_name} ${formData.primary_surname}`.trim(),
        metadata: { synced_to_ghl: syncToGHL }
      });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (!syncToGHL) {
        toast.success('Client created successfully');
      }
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Failed to create client: ' + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      primary_first_name: '',
      primary_surname: '',
      primary_email: '',
      primary_mobile: '',
      secondary_first_name: '',
      secondary_surname: '',
      current_address: '',
    });
    setSyncToGHL(true);
    setSelectedStageId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.primary_first_name.trim() || !formData.primary_surname.trim()) {
      toast.error('First name and surname are required');
      return;
    }
    createClientMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[500px] w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Client
          </DialogTitle>
          <DialogDescription>
            Create a new client record. Optionally sync to GoHighLevel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Primary Contact */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Primary Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="primary_first_name">First Name *</Label>
                <Input
                  id="primary_first_name"
                  value={formData.primary_first_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, primary_first_name: e.target.value }))}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="primary_surname">Surname *</Label>
                <Input
                  id="primary_surname"
                  value={formData.primary_surname}
                  onChange={(e) => setFormData(prev => ({ ...prev, primary_surname: e.target.value }))}
                  placeholder="Smith"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="primary_email">Email</Label>
                <Input
                  id="primary_email"
                  type="email"
                  value={formData.primary_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, primary_email: e.target.value }))}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="primary_mobile">Mobile</Label>
                <Input
                  id="primary_mobile"
                  value={formData.primary_mobile}
                  onChange={(e) => setFormData(prev => ({ ...prev, primary_mobile: e.target.value }))}
                  placeholder="0400 000 000"
                />
              </div>
            </div>
          </div>

          {/* Secondary Contact */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Secondary Contact (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="secondary_first_name">First Name</Label>
                <Input
                  id="secondary_first_name"
                  value={formData.secondary_first_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondary_first_name: e.target.value }))}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secondary_surname">Surname</Label>
                <Input
                  id="secondary_surname"
                  value={formData.secondary_surname}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondary_surname: e.target.value }))}
                  placeholder="Smith"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="current_address">Current Address</Label>
            <Input
              id="current_address"
              value={formData.current_address}
              onChange={(e) => setFormData(prev => ({ ...prev, current_address: e.target.value }))}
              placeholder="123 Main St, Sydney NSW 2000"
            />
          </div>

          {/* Sync Option */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="syncToGHL"
              checked={syncToGHL}
              onCheckedChange={(checked) => setSyncToGHL(checked as boolean)}
            />
            <Label htmlFor="syncToGHL" className="text-sm font-normal cursor-pointer">
              Sync to GoHighLevel after creating
            </Label>
          </div>

          {/* Pipeline Stage (optional, shown when GHL sync enabled) */}
          {syncToGHL && (
            <div className="space-y-1.5">
              <Label htmlFor="pipeline_stage">Pipeline Stage (Optional)</Label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a pipeline stage..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    // Group stages by pipeline
                    const grouped: Record<string, { pipelineName: string; stages: any[] }> = {};
                    (pipelineStages || []).forEach((s: any) => {
                      const pName = s.ghl_pipelines?.name || 'Unknown Pipeline';
                      if (!grouped[pName]) grouped[pName] = { pipelineName: pName, stages: [] };
                      grouped[pName].stages.push(s);
                    });
                    return Object.entries(grouped).map(([pName, group]) => (
                      <div key={pName}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{pName}</div>
                        {group.stages.map((stage: any) => (
                          <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                        ))}
                      </div>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createClientMutation.isPending}>
              {createClientMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Client
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}