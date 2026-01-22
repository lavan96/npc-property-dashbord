import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Plus, Briefcase, Loader2, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

interface EmploymentManualEntryProps {
  clientId: string;
  onComplete: () => void;
}

interface EmploymentFormData {
  id?: string;
  contact_type: 'primary' | 'secondary';
  is_current: boolean;
  employment_type: string;
  occupation_role: string;
  employer_name: string;
  start_date: string;
}

const employmentTypeOptions = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
  { value: 'self_employed', label: 'Self Employed' },
];

const defaultFormData: EmploymentFormData = {
  contact_type: 'primary',
  is_current: true,
  employment_type: 'permanent',
  occupation_role: '',
  employer_name: '',
  start_date: '',
};

import { invokeSecureFunction } from '@/lib/secureInvoke';

/**
 * Secure fetch for employment data using HttpOnly cookies
 */
async function fetchEmploymentSecure(clientId: string) {
  const { data, error } = await invokeSecureFunction('get-client-data', {
    clientId,
    include: { employment: true },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error('Failed to fetch employment');
  return data.data?.employment || [];
}

export function EmploymentManualEntry({ clientId, onComplete }: EmploymentManualEntryProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary'>('primary');
  const [formData, setFormData] = useState<EmploymentFormData>(defaultFormData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch existing employment records - always enabled to show summary outside sheet
  const { data: existingEmployment = [] } = useQuery({
    queryKey: ['client-employment', clientId],
    queryFn: () => fetchEmploymentSecure(clientId),
  });

  const primaryEmployment = existingEmployment.filter((e: any) => e.contact_type === 'primary' && e.is_current);
  const secondaryEmployment = existingEmployment.filter((e: any) => e.contact_type === 'secondary' && e.is_current);
  const previousEmployment = existingEmployment.filter((e: any) => !e.is_current);

  const updateField = (field: keyof EmploymentFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({ ...defaultFormData, contact_type: activeTab });
    setEditingId(null);
  };

  const startEdit = (employment: any) => {
    setFormData({
      id: employment.id,
      contact_type: employment.contact_type,
      is_current: employment.is_current ?? true,
      employment_type: employment.employment_type || 'permanent',
      occupation_role: employment.occupation_role || '',
      employer_name: employment.employer_name || '',
      start_date: employment.start_date || '',
    });
    setEditingId(employment.id);
    setActiveTab(employment.contact_type);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        contact_type: formData.contact_type,
        is_current: formData.is_current,
        employment_type: formData.employment_type,
        occupation_role: formData.occupation_role,
        employer_name: formData.employer_name,
        start_date: formData.start_date || null,
      };

      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: editingId ? 'update' : 'create',
        table: 'client_employment',
        clientId,
        recordId: editingId || undefined,
        data: payload,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to save employment');
      
      return data.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-employment', clientId] });
      toast.success(editingId ? 'Employment updated' : 'Employment added');
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Failed to save employment: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'delete',
        table: 'client_employment',
        clientId,
        recordId: id,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to delete employment');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-employment', clientId] });
      toast.success('Employment deleted');
      if (editingId) resetForm();
    },
    onError: (error: any) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.employer_name.trim()) {
      toast.error('Employer name is required');
      return;
    }
    saveMutation.mutate();
  };

  const EmploymentCard = ({ employment, showContactType = false }: { employment: any; showContactType?: boolean }) => (
    <Card className="mb-2">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{employment.employer_name || 'Unknown Employer'}</span>
              {employment.is_current && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Current</span>
              )}
              {!employment.is_current && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Previous</span>
              )}
              {showContactType && (
                <span className="text-xs text-muted-foreground capitalize">({employment.contact_type})</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{employment.occupation_role}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {employment.employment_type} • Started: {employment.start_date || 'N/A'}
            </p>
          </div>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => startEdit(employment)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-destructive"
              onClick={() => deleteMutation.mutate(employment.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const EmploymentForm = () => (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {editingId ? 'Edit Employment' : 'Add New Employment'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Current Employer</Label>
          <Switch
            checked={formData.is_current}
            onCheckedChange={(v) => updateField('is_current', v)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Employment Type</Label>
          <Select
            value={formData.employment_type}
            onValueChange={(v) => updateField('employment_type', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {employmentTypeOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Occupation/Role</Label>
          <Input
            value={formData.occupation_role}
            onChange={(e) => updateField('occupation_role', e.target.value)}
            placeholder="Software Engineer"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Employer Name *</Label>
          <Input
            value={formData.employer_name}
            onChange={(e) => updateField('employer_name', e.target.value)}
            placeholder="Company Pty Ltd"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => updateField('start_date', e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-2">
          {editingId && (
            <Button variant="outline" onClick={resetForm} className="flex-1">
              Cancel
            </Button>
          )}
          <Button 
            onClick={handleSubmit} 
            disabled={saveMutation.isPending}
            className="flex-1"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingId ? 'Update' : 'Add'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Employment Summary Display */}
      {existingEmployment.length > 0 && (
        <div className="space-y-2">
          {existingEmployment.map((emp: any) => (
            <Card key={emp.id} className="mb-2">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{emp.employer_name || 'Unknown Employer'}</span>
                      {emp.is_current && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Current</span>
                      )}
                      <span className="text-xs text-muted-foreground capitalize">({emp.contact_type})</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{emp.occupation_role}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {emp.employment_type} • Started: {emp.start_date || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {existingEmployment.length === 0 && (
        <div className="text-center py-4 text-muted-foreground">
          <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No employment records</p>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {existingEmployment.length > 0 ? 'Edit Employment' : 'Add Employment'}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Employment Details
            </SheetTitle>
            <SheetDescription>
              Manage employment records for primary and secondary contacts
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-180px)] pr-4 mt-4">
            <Tabs value={activeTab} onValueChange={(v) => {
              setActiveTab(v as 'primary' | 'secondary');
              setFormData(prev => ({ ...prev, contact_type: v as 'primary' | 'secondary' }));
              setEditingId(null);
            }}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="primary">Primary</TabsTrigger>
                <TabsTrigger value="secondary">Secondary</TabsTrigger>
                <TabsTrigger value="previous">Previous</TabsTrigger>
              </TabsList>

              <TabsContent value="primary" className="space-y-4 mt-4">
                {primaryEmployment.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Current Employment</Label>
                    {primaryEmployment.map((emp: any) => (
                      <EmploymentCard key={emp.id} employment={emp} />
                    ))}
                  </div>
                )}
                <EmploymentForm />
              </TabsContent>

              <TabsContent value="secondary" className="space-y-4 mt-4">
                {secondaryEmployment.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Current Employment</Label>
                    {secondaryEmployment.map((emp: any) => (
                      <EmploymentCard key={emp.id} employment={emp} />
                    ))}
                  </div>
                )}
                <EmploymentForm />
              </TabsContent>

              <TabsContent value="previous" className="space-y-4 mt-4">
                {previousEmployment.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Previous Employment Records</Label>
                    {previousEmployment.map((emp: any) => (
                      <EmploymentCard key={emp.id} employment={emp} showContactType />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No previous employment records</p>
                    <p className="text-xs mt-1">Toggle off "Current Employer" when adding to mark as previous</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <SheetFooter className="pt-4">
            <Button variant="outline" onClick={() => { setOpen(false); onComplete(); }}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
