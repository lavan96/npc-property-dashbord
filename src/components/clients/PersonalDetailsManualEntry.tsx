import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit, User, Users, MapPin, IdCard, Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationsContext';

interface PersonalDetailsManualEntryProps {
  clientId: string;
  clientData?: {
    primary_first_name: string;
    primary_middle_name: string | null;
    primary_surname: string;
    primary_mobile: string | null;
    primary_email: string | null;
    primary_gender: string | null;
    primary_dob: string | null;
    secondary_first_name: string | null;
    secondary_middle_name: string | null;
    secondary_surname: string | null;
    secondary_mobile: string | null;
    secondary_email: string | null;
    secondary_gender: string | null;
    secondary_dob: string | null;
    current_address: string | null;
    country: string | null;
    living_situation: string | null;
    residential_status: string | null;
    marital_status: string | null;
    dependents_count: number | null;
  };
  onComplete: () => void;
}

interface FormData {
  // Primary Contact
  primary_first_name: string;
  primary_middle_name: string;
  primary_surname: string;
  primary_mobile: string;
  primary_email: string;
  primary_gender: string;
  primary_dob: string;
  // Secondary Contact
  secondary_first_name: string;
  secondary_middle_name: string;
  secondary_surname: string;
  secondary_mobile: string;
  secondary_email: string;
  secondary_gender: string;
  secondary_dob: string;
  // Address
  current_address: string;
  country: string;
  living_situation: string;
  // ID
  residential_status: string;
  // Family Relations
  marital_status: string;
  dependents_count: number;
}

const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const livingSituationOptions = [
  { value: 'renting', label: 'Renting' },
  { value: 'living_with_parents', label: 'Living with Parents' },
  { value: 'home_with_mortgage', label: 'Home with Mortgage' },
  { value: 'home_owned_outright', label: 'Home Owned Outright' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'other', label: 'Other' },
];

const residentialStatusOptions = [
  { value: 'citizen', label: 'Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident' },
  { value: 'temporary_visa', label: 'Temporary Visa' },
  { value: 'other', label: 'Other' },
];

const maritalStatusOptions = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'defacto', label: 'De Facto' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
];

export function PersonalDetailsManualEntry({ clientId, clientData, onComplete }: PersonalDetailsManualEntryProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  
  const [formData, setFormData] = useState<FormData>({
    primary_first_name: '',
    primary_middle_name: '',
    primary_surname: '',
    primary_mobile: '',
    primary_email: '',
    primary_gender: '',
    primary_dob: '',
    secondary_first_name: '',
    secondary_middle_name: '',
    secondary_surname: '',
    secondary_mobile: '',
    secondary_email: '',
    secondary_gender: '',
    secondary_dob: '',
    current_address: '',
    country: 'Australia',
    living_situation: '',
    residential_status: '',
    marital_status: '',
    dependents_count: 0,
  });

  // Populate form with existing client data when sheet opens
  useEffect(() => {
    if (open && clientData) {
      setFormData({
        primary_first_name: clientData.primary_first_name || '',
        primary_middle_name: clientData.primary_middle_name || '',
        primary_surname: clientData.primary_surname || '',
        primary_mobile: clientData.primary_mobile || '',
        primary_email: clientData.primary_email || '',
        primary_gender: clientData.primary_gender || '',
        primary_dob: clientData.primary_dob || '',
        secondary_first_name: clientData.secondary_first_name || '',
        secondary_middle_name: clientData.secondary_middle_name || '',
        secondary_surname: clientData.secondary_surname || '',
        secondary_mobile: clientData.secondary_mobile || '',
        secondary_email: clientData.secondary_email || '',
        secondary_gender: clientData.secondary_gender || '',
        secondary_dob: clientData.secondary_dob || '',
        current_address: clientData.current_address || '',
        country: clientData.country || 'Australia',
        living_situation: clientData.living_situation || '',
        residential_status: clientData.residential_status || '',
        marital_status: clientData.marital_status || '',
        dependents_count: clientData.dependents_count || 0,
      });
    }
  }, [open, clientData]);

  const updateField = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateClientMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('clients')
        .update({
          primary_first_name: formData.primary_first_name,
          primary_middle_name: formData.primary_middle_name || null,
          primary_surname: formData.primary_surname,
          primary_mobile: formData.primary_mobile || null,
          primary_email: formData.primary_email || null,
          primary_gender: formData.primary_gender || null,
          primary_dob: formData.primary_dob || null,
          secondary_first_name: formData.secondary_first_name || null,
          secondary_middle_name: formData.secondary_middle_name || null,
          secondary_surname: formData.secondary_surname || null,
          secondary_mobile: formData.secondary_mobile || null,
          secondary_email: formData.secondary_email || null,
          secondary_gender: formData.secondary_gender || null,
          secondary_dob: formData.secondary_dob || null,
          current_address: formData.current_address || null,
          country: formData.country || null,
          living_situation: formData.living_situation || null,
          residential_status: formData.residential_status || null,
          marital_status: formData.marital_status || null,
          dependents_count: formData.dependents_count || null,
        })
        .eq('id', clientId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-details', clientId] });
      toast.success('Personal details updated successfully');
      
      addNotification({
        type: 'client_updated',
        title: 'Client Updated',
        message: `Personal details updated for ${formData.primary_first_name} ${formData.primary_surname}`,
        entityId: clientId
      });
      
      setOpen(false);
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to update personal details: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.primary_first_name.trim() || !formData.primary_surname.trim()) {
      toast.error('Primary contact name is required');
      return;
    }
    updateClientMutation.mutate();
  };

  const ContactFields = ({ prefix, title }: { prefix: 'primary' | 'secondary'; title: string }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">First Name {prefix === 'primary' && '*'}</Label>
            <Input
              value={formData[`${prefix}_first_name`]}
              onChange={(e) => updateField(`${prefix}_first_name`, e.target.value)}
              placeholder="John"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Middle Name</Label>
            <Input
              value={formData[`${prefix}_middle_name`]}
              onChange={(e) => updateField(`${prefix}_middle_name`, e.target.value)}
              placeholder=""
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Surname {prefix === 'primary' && '*'}</Label>
            <Input
              value={formData[`${prefix}_surname`]}
              onChange={(e) => updateField(`${prefix}_surname`, e.target.value)}
              placeholder="Smith"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Mobile</Label>
            <Input
              type="tel"
              value={formData[`${prefix}_mobile`]}
              onChange={(e) => updateField(`${prefix}_mobile`, e.target.value)}
              placeholder="0400 000 000"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={formData[`${prefix}_email`]}
              onChange={(e) => updateField(`${prefix}_email`, e.target.value)}
              placeholder="email@example.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Gender</Label>
            <Select
              value={formData[`${prefix}_gender`]}
              onValueChange={(v) => updateField(`${prefix}_gender`, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {genderOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Date of Birth</Label>
            <Input
              type="date"
              value={formData[`${prefix}_dob`]}
              onChange={(e) => updateField(`${prefix}_dob`, e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit Details
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Personal Details (All Applicants)
          </SheetTitle>
          <SheetDescription>
            Edit personal details matching Vownet template format
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <Tabs defaultValue="contacts" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="address">Address & ID</TabsTrigger>
              <TabsTrigger value="family">Family</TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="space-y-4 mt-4">
              <ContactFields prefix="primary" title="Primary Contact" />
              
              <Separator className="my-4" />
              
              <ContactFields prefix="secondary" title="Secondary Contact" />
            </TabsContent>

            <TabsContent value="address" className="space-y-4 mt-4">
              {/* Address Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Current Address</Label>
                    <Input
                      value={formData.current_address}
                      onChange={(e) => updateField('current_address', e.target.value)}
                      placeholder="123 Main Street, Sydney NSW 2000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Country</Label>
                      <Input
                        value={formData.country}
                        onChange={(e) => updateField('country', e.target.value)}
                        placeholder="Australia"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Living Situation</Label>
                      <Select
                        value={formData.living_situation}
                        onValueChange={(v) => updateField('living_situation', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select situation" />
                        </SelectTrigger>
                        <SelectContent>
                          {livingSituationOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ID Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <IdCard className="h-4 w-4" />
                    ID
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-xs">Residential Status</Label>
                    <Select
                      value={formData.residential_status}
                      onValueChange={(v) => updateField('residential_status', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {residentialStatusOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="family" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Family Relations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Marital Status</Label>
                      <Select
                        value={formData.marital_status}
                        onValueChange={(v) => updateField('marital_status', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {maritalStatusOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Number of Dependents (under 18)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.dependents_count || ''}
                        onChange={(e) => updateField('dependents_count', parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        <SheetFooter className="pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={updateClientMutation.isPending}
          >
            {updateClientMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
