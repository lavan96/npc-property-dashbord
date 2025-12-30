import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Building2, Phone, Mail, Globe, MapPin, FileText, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ContactDetails {
  company_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  abn: string;
}

interface ProfessionalDisclaimer {
  text: string;
  is_enabled: boolean;
}

export function GlobalReportSettings() {
  const [contactDetails, setContactDetails] = useState<ContactDetails>({
    company_name: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    abn: ''
  });
  
  const [disclaimer, setDisclaimer] = useState<ProfessionalDisclaimer>({
    text: '',
    is_enabled: true
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('global_report_settings')
        .select('*');

      if (error) throw error;

      data?.forEach((setting) => {
        if (setting.setting_key === 'contact_details') {
          setContactDetails(setting.setting_value as unknown as ContactDetails);
        } else if (setting.setting_key === 'professional_disclaimer') {
          setDisclaimer(setting.setting_value as unknown as ProfessionalDisclaimer);
        }
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      // Update contact details
      const { error: contactError } = await supabase
        .from('global_report_settings')
        .update({ setting_value: JSON.parse(JSON.stringify(contactDetails)) })
        .eq('setting_key', 'contact_details');

      if (contactError) throw contactError;

      // Update disclaimer
      const { error: disclaimerError } = await supabase
        .from('global_report_settings')
        .update({ setting_value: JSON.parse(JSON.stringify(disclaimer)) })
        .eq('setting_key', 'professional_disclaimer');

      if (disclaimerError) throw disclaimerError;

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Contact Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Contact Details
          </CardTitle>
          <CardDescription>
            These details will appear in the footer and contact sections of all generated reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="company_name"
                  placeholder="Your Company Name"
                  className="pl-10"
                  value={contactDetails.company_name}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, company_name: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="abn">ABN</Label>
              <Input
                id="abn"
                placeholder="12 345 678 901"
                value={contactDetails.abn}
                onChange={(e) => setContactDetails(prev => ({ ...prev, abn: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="1300 000 000"
                  className="pl-10"
                  value={contactDetails.phone}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="info@company.com.au"
                  className="pl-10"
                  value={contactDetails.email}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="website"
                  type="url"
                  placeholder="www.company.com.au"
                  className="pl-10"
                  value={contactDetails.website}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, website: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Business Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="address"
                  placeholder="123 Business St, Sydney NSW 2000"
                  className="pl-10"
                  value={contactDetails.address}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Disclaimer Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Professional Disclaimer
          </CardTitle>
          <CardDescription>
            This disclaimer will be included at the end of all generated reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="disclaimer-enabled">Include Disclaimer in Reports</Label>
              <p className="text-sm text-muted-foreground">
                Toggle to enable or disable the disclaimer in generated reports
              </p>
            </div>
            <Switch
              id="disclaimer-enabled"
              checked={disclaimer.is_enabled}
              onCheckedChange={(checked) => setDisclaimer(prev => ({ ...prev, is_enabled: checked }))}
            />
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="disclaimer-text">Disclaimer Text</Label>
            <Textarea
              id="disclaimer-text"
              placeholder="Enter your professional disclaimer..."
              className="min-h-[150px] resize-y"
              value={disclaimer.text}
              onChange={(e) => setDisclaimer(prev => ({ ...prev, text: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              This text will appear in the disclaimer section of all reports. You can use this to outline limitations of the analysis, 
              recommend seeking professional advice, and protect against liability.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Global Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
