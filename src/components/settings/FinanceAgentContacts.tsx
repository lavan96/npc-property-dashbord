import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building2, Mail, Plus, Pencil, Trash2, Star, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface FinanceContact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  is_default: boolean;
  is_active: boolean;
  contact_type: string;
  notes: string | null;
  created_at: string;
}

interface ContactFormData {
  name: string;
  email: string;
  company: string;
  contact_type: 'internal' | 'external';
  notes: string;
  is_default: boolean;
}

const defaultFormData: ContactFormData = {
  name: '',
  email: '',
  company: '',
  contact_type: 'external',
  notes: '',
  is_default: false,
};

export function FinanceAgentContacts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<FinanceContact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(defaultFormData);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['finance-agent-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_agent_contacts')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      
      if (error) throw error;
      return data as FinanceContact[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const { error } = await supabase
        .from('finance_agent_contacts')
        .insert({
          ...data,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-agent-contacts'] });
      toast.success('Finance contact added');
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error('Failed to add contact: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContactFormData }) => {
      const { error } = await supabase
        .from('finance_agent_contacts')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-agent-contacts'] });
      toast.success('Finance contact updated');
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error('Failed to update contact: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('finance_agent_contacts')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-agent-contacts'] });
      toast.success('Finance contact removed');
    },
    onError: (error: any) => {
      toast.error('Failed to remove contact: ' + error.message);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      // First, unset all defaults
      await supabase
        .from('finance_agent_contacts')
        .update({ is_default: false })
        .eq('is_default', true);
      
      // Set the new default
      const { error } = await supabase
        .from('finance_agent_contacts')
        .update({ is_default: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-agent-contacts'] });
      toast.success('Default contact updated');
    },
    onError: (error: any) => {
      toast.error('Failed to set default: ' + error.message);
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingContact(null);
    setFormData(defaultFormData);
  };

  const handleOpenEdit = (contact: FinanceContact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email,
      company: contact.company || '',
      contact_type: contact.contact_type as 'internal' | 'external',
      notes: contact.notes || '',
      is_default: contact.is_default,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Finance Agent Contacts
            </CardTitle>
            <CardDescription>
              Manage recipients for "Quick Send to Finance" feature
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setFormData(defaultFormData)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingContact ? 'Edit Finance Contact' : 'Add Finance Contact'}
                </DialogTitle>
                <DialogDescription>
                  {editingContact 
                    ? 'Update the finance agent contact details'
                    : 'Add a new finance agent to receive Vownet forms'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                      placeholder="Finance Corp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_type">Contact Type</Label>
                    <Select
                      value={formData.contact_type}
                      onValueChange={(value: 'internal' | 'external') => 
                        setFormData(prev => ({ ...prev, contact_type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="external">External</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes about this contact..."
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_default"
                    checked={formData.is_default}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({ ...prev, is_default: checked }))
                    }
                  />
                  <Label htmlFor="is_default">Set as default recipient</Label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingContact ? 'Update' : 'Add'} Contact
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No finance contacts configured yet.</p>
            <p className="text-sm">Add contacts to enable "Quick Send to Finance" feature.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {contact.name}
                      {contact.is_default && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {contact.company ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {contact.company}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contact.contact_type === 'internal' ? 'secondary' : 'outline'}>
                      {contact.contact_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!contact.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDefaultMutation.mutate(contact.id)}
                          title="Set as default"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(contact)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(contact.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
