import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const employmentTypeOptions = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
  { value: 'self_employed', label: 'Self Employed' },
];

interface EmploymentFormData {
  id?: string;
  contact_type: 'primary' | 'secondary';
  is_current: boolean;
  employment_type: string;
  occupation_role: string;
  employer_name: string;
  start_date: string;
}

interface EmploymentFormFieldsProps {
  formData: EmploymentFormData;
  updateField: (field: keyof EmploymentFormData, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  isEditing: boolean;
}

export function EmploymentFormFields({
  formData,
  updateField,
  onSubmit,
  onCancel,
  isPending,
  isEditing,
}: EmploymentFormFieldsProps) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {isEditing ? 'Edit Employment' : 'Add New Employment'}
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
          {isEditing && (
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          <Button 
            onClick={onSubmit} 
            disabled={isPending}
            className="flex-1"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Update' : 'Add'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
