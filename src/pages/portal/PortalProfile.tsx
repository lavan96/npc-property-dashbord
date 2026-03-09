import { useState, useEffect } from 'react';
import { usePortalProfileData, usePortalUpdateData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, User, Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const MARITAL_OPTIONS = ['Single', 'Married', 'De Facto', 'Divorced', 'Widowed', 'Separated'];
const LIVING_OPTIONS = ['Renting', 'Owner Occupied', 'Living with Parents', 'Boarding', 'Other'];
const RESIDENTIAL_OPTIONS = ['Australian Citizen', 'Permanent Resident', 'Temporary Visa', 'NZ Citizen', 'Other'];

interface FormData {
  [key: string]: any;
}

export default function PortalProfile() {
  const { data, isLoading, error } = usePortalProfileData();
  const updateMutation = usePortalUpdateData();
  const [formData, setFormData] = useState<FormData>({});
  const [hasChanges, setHasChanges] = useState(false);

  const client = data?.client;

  useEffect(() => {
    if (client) {
      setFormData({
        primary_first_name: client.primary_first_name || '',
        primary_middle_name: client.primary_middle_name || '',
        primary_surname: client.primary_surname || '',
        primary_email: client.primary_email || '',
        primary_mobile: client.primary_mobile || '',
        primary_dob: client.primary_dob || '',
        primary_gender: client.primary_gender || '',
        current_address: client.current_address || '',
        country: client.country || '',
        marital_status: client.marital_status || '',
        dependents_count: client.dependents_count ?? '',
        living_situation: client.living_situation || '',
        residential_status: client.residential_status || '',
        // Secondary
        secondary_first_name: client.secondary_first_name || '',
        secondary_middle_name: client.secondary_middle_name || '',
        secondary_surname: client.secondary_surname || '',
        secondary_email: client.secondary_email || '',
        secondary_mobile: client.secondary_mobile || '',
        secondary_dob: client.secondary_dob || '',
        secondary_gender: client.secondary_gender || '',
        secondary_current_address: client.secondary_current_address || '',
        secondary_country: client.secondary_country || '',
        secondary_living_situation: client.secondary_living_situation || '',
        secondary_residential_status: client.secondary_residential_status || '',
        secondary_same_address_as_primary: client.secondary_same_address_as_primary || false,
      });
      setHasChanges(false);
    }
  }, [client]);

  const updateField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        operation: 'update',
        table: 'clients',
        data: formData,
      });
      setHasChanges(false);
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    }
  };

  const hasSecondary = !!(formData.secondary_first_name || formData.secondary_surname);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load profile. Please try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground mt-1">View and update your personal details</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasChanges ? (
            <Save className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {updateMutation.isPending ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
        </Button>
      </div>

      {/* Primary Contact */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Primary Contact</CardTitle>
              <CardDescription>Your main contact information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input value={formData.primary_first_name} onChange={(e) => updateField('primary_first_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Middle Name</Label>
              <Input value={formData.primary_middle_name} onChange={(e) => updateField('primary_middle_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Surname</Label>
              <Input value={formData.primary_surname} onChange={(e) => updateField('primary_surname', e.target.value)} />
            </div>
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formData.primary_email} onChange={(e) => updateField('primary_email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <Input type="tel" value={formData.primary_mobile} onChange={(e) => updateField('primary_mobile', e.target.value)} />
            </div>
          </div>

          {/* Personal details row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={formData.primary_dob} onChange={(e) => updateField('primary_dob', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={formData.primary_gender} onValueChange={(v) => updateField('primary_gender', v)}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dependents</Label>
              <Input type="number" min="0" value={formData.dependents_count} onChange={(e) => updateField('dependents_count', e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>

          <Separator />

          {/* Address & living */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Address</Label>
              <Input value={formData.current_address} onChange={(e) => updateField('current_address', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={formData.country} onChange={(e) => updateField('country', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Marital Status</Label>
              <Select value={formData.marital_status} onValueChange={(v) => updateField('marital_status', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {MARITAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Living Situation</Label>
              <Select value={formData.living_situation} onValueChange={(v) => updateField('living_situation', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LIVING_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Residential Status</Label>
              <Select value={formData.residential_status} onValueChange={(v) => updateField('residential_status', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {RESIDENTIAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Contact */}
      {hasSecondary && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Secondary Contact</CardTitle>
                <CardDescription>Joint applicant details</CardDescription>
              </div>
              <Badge variant="secondary" className="ml-auto">Joint</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={formData.secondary_first_name} onChange={(e) => updateField('secondary_first_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Middle Name</Label>
                <Input value={formData.secondary_middle_name} onChange={(e) => updateField('secondary_middle_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Surname</Label>
                <Input value={formData.secondary_surname} onChange={(e) => updateField('secondary_surname', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={formData.secondary_email} onChange={(e) => updateField('secondary_email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mobile</Label>
                <Input type="tel" value={formData.secondary_mobile} onChange={(e) => updateField('secondary_mobile', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" value={formData.secondary_dob} onChange={(e) => updateField('secondary_dob', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={formData.secondary_gender} onValueChange={(v) => updateField('secondary_gender', v)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Living Situation</Label>
                <Select value={formData.secondary_living_situation} onValueChange={(v) => updateField('secondary_living_situation', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {LIVING_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={formData.secondary_current_address} onChange={(e) => updateField('secondary_current_address', e.target.value)} placeholder={formData.secondary_same_address_as_primary ? 'Same as primary' : 'Enter address'} />
              </div>
              <div className="space-y-2">
                <Label>Residential Status</Label>
                <Select value={formData.secondary_residential_status} onValueChange={(v) => updateField('secondary_residential_status', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {RESIDENTIAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
