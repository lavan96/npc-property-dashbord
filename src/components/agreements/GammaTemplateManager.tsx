import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Star, StarOff, Loader2, X, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface PlaceholderMapping {
  placeholder: string;
  field: string;
  defaultValue?: string;
}

interface GammaTemplate {
  id: string;
  name: string;
  gamma_template_id: string;
  description: string | null;
  placeholder_mappings: PlaceholderMapping[];
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

const AVAILABLE_FIELDS = [
  { value: 'buyer_names', label: "Buyer's Name" },
  { value: 'buyer_address', label: 'Address' },
  { value: 'buyer_phone', label: 'Phone Number' },
  { value: 'buyer_email', label: 'Email' },
  { value: 'initial_commitment_fee', label: 'Initial Commitment Fee' },
  { value: 'secondary_buyer_name', label: 'Secondary Buyer Name' },
  { value: 'agreement_date', label: 'Agreement Date' },
  { value: 'notes', label: 'Notes' },
];

function useGammaTemplates() {
  return useQuery({
    queryKey: ['gamma-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gamma_agreement_templates' as any)
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as GammaTemplate[];
    },
  });
}

export default function GammaTemplateManager() {
  const queryClient = useQueryClient();
  const { data: templates = [], isLoading } = useGammaTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GammaTemplate | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [gammaId, setGammaId] = useState('');
  const [description, setDescription] = useState('');
  const [mappings, setMappings] = useState<PlaceholderMapping[]>([
    { placeholder: "[Buyer's Name]", field: 'buyer_names' },
    { placeholder: '[Address]', field: 'buyer_address' },
    { placeholder: '[Phone Number]', field: 'buyer_phone' },
    { placeholder: '[Email]', field: 'buyer_email' },
    { placeholder: '[Initial Commitment Fee]', field: 'initial_commitment_fee', defaultValue: '$1,500.00 + GST' },
  ]);

  const resetForm = () => {
    setName('');
    setGammaId('');
    setDescription('');
    setMappings([
      { placeholder: "[Buyer's Name]", field: 'buyer_names' },
      { placeholder: '[Address]', field: 'buyer_address' },
      { placeholder: '[Phone Number]', field: 'buyer_phone' },
      { placeholder: '[Email]', field: 'buyer_email' },
      { placeholder: '[Initial Commitment Fee]', field: 'initial_commitment_fee', defaultValue: '$1,500.00 + GST' },
    ]);
    setEditingTemplate(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (t: GammaTemplate) => {
    setEditingTemplate(t);
    setName(t.name);
    setGammaId(t.gamma_template_id);
    setDescription(t.description || '');
    setMappings(t.placeholder_mappings.length > 0 ? t.placeholder_mappings : [{ placeholder: '', field: '' }]);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        gamma_template_id: gammaId,
        description: description || null,
        placeholder_mappings: mappings.filter(m => m.placeholder && m.field),
      };
      if (editingTemplate) {
        const { error } = await supabase
          .from('gamma_agreement_templates' as any)
          .update(payload as any)
          .eq('id', editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('gamma_agreement_templates' as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamma-templates'] });
      toast.success(editingTemplate ? 'Template updated' : 'Template created');
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gamma_agreement_templates' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamma-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      // Unset all defaults first
      await supabase.from('gamma_agreement_templates' as any).update({ is_default: false } as any).neq('id', id);
      const { error } = await supabase.from('gamma_agreement_templates' as any).update({ is_default: true } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamma-templates'] });
      toast.success('Default template updated');
    },
  });

  const addMapping = () => setMappings([...mappings, { placeholder: '', field: '' }]);
  const removeMapping = (idx: number) => setMappings(mappings.filter((_, i) => i !== idx));
  const updateMapping = (idx: number, key: keyof PlaceholderMapping, value: string) => {
    const updated = [...mappings];
    updated[idx] = { ...updated[idx], [key]: value };
    setMappings(updated);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Gamma Templates</CardTitle>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Template
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No templates configured. Add a Gamma template to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Gamma ID</TableHead>
                <TableHead className="hidden sm:table-cell">Placeholders</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.name}
                    {t.is_default && (
                      <Badge variant="default" className="ml-2 text-xs">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs font-mono">
                    {t.gamma_template_id.substring(0, 20)}…
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {t.placeholder_mappings.length} mappings
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? 'outline' : 'secondary'}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDefaultMutation.mutate(t.id)} title="Set as default">
                        {t.is_default ? <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" /> : <StarOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                        if (confirm('Delete this template?')) deleteMutation.mutate(t.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Add Gamma Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Template Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Buyer's Agent Agreement v2" />
              </div>
              <div className="space-y-1.5">
                <Label>Gamma Template ID</Label>
                <Input value={gammaId} onChange={(e) => setGammaId(e.target.value)} placeholder="e.g. g_abc123xyz" className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this template..." rows={2} />
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Placeholder Mappings</Label>
                <Button variant="outline" size="sm" onClick={addMapping}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Map placeholders in your Gamma template (e.g. [Buyer's Name]) to agreement data fields.
              </p>
              <div className="space-y-2">
                {mappings.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={m.placeholder}
                      onChange={(e) => updateMapping(idx, 'placeholder', e.target.value)}
                      placeholder="[Placeholder]"
                      className="flex-1 text-sm"
                    />
                    <span className="text-muted-foreground text-xs">→</span>
                    <select
                      value={m.field}
                      onChange={(e) => updateMapping(idx, 'field', e.target.value)}
                      className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select field...</option>
                      {AVAILABLE_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <Input
                      value={m.defaultValue || ''}
                      onChange={(e) => updateMapping(idx, 'defaultValue', e.target.value)}
                      placeholder="Default"
                      className="w-32 text-sm"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeMapping(idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name || !gammaId || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
