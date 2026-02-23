import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Shield, Palette, Clock, Mail, FileSignature, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { ComparisonScoreMigration } from '@/components/admin/ComparisonScoreMigration';
import { ProfileCredentials } from '@/components/settings/ProfileCredentials';
import { FinanceAgentContacts } from '@/components/settings/FinanceAgentContacts';
import { useAuth } from '@/hooks/useAuth';
import { logActivityDirect } from '@/hooks/useActivityLogger';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    timezone: 'Australia/Sydney',
    bookingTimezone: 'Australia/Sydney',
    notifications: true,
    autoRefresh: true,
    refreshInterval: 5,
    autoContinueReports: true,
    autoContinueMaxRetries: 3,
    autoContinueDelaySeconds: 15,
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Mailbox settings
  const [personalMailbox, setPersonalMailbox] = useState('');
  const [loadingMailbox, setLoadingMailbox] = useState(true);
  const [savingMailbox, setSavingMailbox] = useState(false);
  
  // Email signature settings
  const [emailSignature, setEmailSignature] = useState('');
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);

  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('dashboard-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
    
    // Fetch user's mailbox
    fetchOwnProfile();
  }, []);

  const fetchOwnProfile = async () => {
    try {
      const { data } = await invokeSecureFunction('admin-user-management', {
        action: 'get_own_profile'
      });

      if (data?.success && data.user) {
        setPersonalMailbox(data.user.personal_mailbox || '');
        setEmailSignature(data.user.email_signature || '');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoadingMailbox(false);
      setLoadingSignature(false);
    }
  };

  const handleSaveMailbox = async () => {
    setSavingMailbox(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', { 
        action: 'update_own_mailbox', 
        personal_mailbox: personalMailbox || null
      });

      if (data?.success) {
        toast({
          title: "Mailbox Updated",
          description: "Your personal mailbox has been saved successfully.",
        });
        logActivityDirect({
          actionType: 'settings_updated',
          entityType: 'user',
          entityName: 'Personal Mailbox',
          metadata: { setting: 'personal_mailbox' }
        });
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to update mailbox.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update mailbox. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSavingMailbox(false);
    }
  };

  const handleSaveSignature = async () => {
    setSavingSignature(true);
    try {
      const { data } = await invokeSecureFunction('admin-user-management', { 
        action: 'update_own_signature', 
        email_signature: emailSignature || null
      });

      if (data?.success) {
        toast({
          title: "Signature Updated",
          description: "Your email signature has been saved successfully.",
        });
        logActivityDirect({
          actionType: 'settings_updated',
          entityType: 'user',
          entityName: 'Email Signature',
          metadata: { setting: 'email_signature' }
        });
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to update signature.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update signature. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSavingSignature(false);
    }
  };

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('dashboard-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse saved settings:', error);
      }
    }
  }, []);


  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveAllSettings = async () => {
    setIsSaving(true);
    try {
      // Save settings to localStorage
      localStorage.setItem('dashboard-settings', JSON.stringify(settings));
      
      // Apply notification settings
      if (settings.notifications && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }

      toast({
        title: "Settings Saved",
        description: "Your preferences have been saved successfully.",
      });
      logActivityDirect({
        actionType: 'settings_updated',
        entityType: 'system',
        entityName: 'Dashboard Settings',
        metadata: settings
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Configure your dashboard and manage connections
        </p>
      </div>

      {/* Profile & Credentials */}
      <ProfileCredentials />


      {/* Personal Mailbox Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Personal Mailbox
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="personal-mailbox">Mailbox Email Address</Label>
            {loadingMailbox ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                <Input
                  id="personal-mailbox"
                  type="email"
                  placeholder="your.email@example.com"
                  value={personalMailbox}
                  onChange={(e) => setPersonalMailbox(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This email will be used for your personal email communications within the dashboard.
                </p>
              </>
            )}
          </div>
          
          <Button 
            onClick={handleSaveMailbox}
            disabled={savingMailbox || loadingMailbox}
            className="w-full"
          >
            {savingMailbox && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Save Mailbox
          </Button>
        </CardContent>
      </Card>

      {/* Email Signature Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Email Signature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-signature">Your Email Signature</Label>
            {loadingSignature ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                <Textarea
                  id="email-signature"
                  placeholder="Best regards,&#10;Your Name&#10;Company Name&#10;Phone: +1 234 567 890"
                  value={emailSignature}
                  onChange={(e) => setEmailSignature(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This signature will be automatically appended to all emails sent from the Email Copilot.
                  You can use plain text or HTML formatting.
                </p>
              </>
            )}
          </div>
          
          <Button 
            onClick={handleSaveSignature}
            disabled={savingSignature || loadingSignature}
            className="w-full"
          >
            {savingSignature && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Save Signature
          </Button>
        </CardContent>
      </Card>

      {/* Finance Agent Contacts */}
      <FinanceAgentContacts />

      {/* Comparison Score Migration */}
      <ComparisonScoreMigration />

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security & Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">API Token Status</h4>
              <p className="text-xs text-muted-foreground">
                Personal access token for Airtable API
              </p>
            </div>
            <Badge variant="success">Configured</Badge>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium">User Permissions</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Read listings data</span>
                <Badge variant="success">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Export CSV data</span>
                <Badge variant="success">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Modify listing data</span>
                <Badge variant="outline">Disabled</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader className="pb-3 md:pb-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Palette className="h-4 w-4 md:h-5 md:w-5" />
            Display & Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Theme</h4>
                <p className="text-xs text-muted-foreground">
                  Choose your preferred color scheme
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  className="flex-1 sm:flex-none"
                >
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  className="flex-1 sm:flex-none"
                >
                  Dark
                </Button>
                <Button
                  variant={theme === 'system' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('system')}
                  className="flex-1 sm:flex-none"
                >
                  System
                </Button>
              </div>
            </div>

            <Separator />

            {/* Booking Timezone (Source of Truth) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Booking Timezone</h4>
                <p className="text-xs text-muted-foreground">
                  Source of truth for all calendar bookings — times are interpreted in this timezone
                </p>
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={settings.bookingTimezone}
                  onValueChange={(value) => handleSettingChange('bookingTimezone', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select booking timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Australia/Sydney">Sydney (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Melbourne">Melbourne (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Brisbane">Brisbane (AEST)</SelectItem>
                    <SelectItem value="Australia/Adelaide">Adelaide (ACST/ACDT)</SelectItem>
                    <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                    <SelectItem value="Australia/Darwin">Darwin (ACST)</SelectItem>
                    <SelectItem value="Australia/Hobart">Hobart (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Lord_Howe">Lord Howe Island (LHST/LHDT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Display Timezone (Reference) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Display Timezone</h4>
                <p className="text-xs text-muted-foreground">
                  Your local timezone for secondary time reference display
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => handleSettingChange('timezone', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                    <SelectItem value="Australia/Adelaide">Australia/Adelaide (ACST/ACDT)</SelectItem>
                    <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                    <SelectItem value="Australia/Darwin">Australia/Darwin (ACST)</SelectItem>
                    <SelectItem value="Australia/Hobart">Australia/Hobart (AEST/AEDT)</SelectItem>
                    <SelectItem value="Pacific/Auckland">New Zealand (NZST/NZDT)</SelectItem>
                    <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                    <SelectItem value="Asia/Hong_Kong">Hong Kong (HKT)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Japan (JST)</SelectItem>
                    <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                    <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                    <SelectItem value="America/New_York">New York (EST/EDT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Los Angeles (PST/PDT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Browser Notifications</h4>
                <p className="text-xs text-muted-foreground">
                  Get notified about new listings and updates
                </p>
              </div>
              <Switch
                checked={settings.notifications}
                onCheckedChange={(checked) => handleSettingChange('notifications', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Auto-refresh Data</h4>
              <p className="text-xs text-muted-foreground">
                Automatically refresh listings data
              </p>
            </div>
            <Switch
              checked={settings.autoRefresh}
              onCheckedChange={(checked) => handleSettingChange('autoRefresh', checked)}
            />
          </div>

          {settings.autoRefresh && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Refresh Interval</h4>
                  <p className="text-xs text-muted-foreground">
                    How often to check for new data (minutes)
                  </p>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={settings.refreshInterval}
                    onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Report Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Report Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Auto-Continue Reports</h4>
              <p className="text-xs text-muted-foreground">
                Automatically resume stalled investment report generations
              </p>
            </div>
            <Switch
              checked={settings.autoContinueReports}
              onCheckedChange={(checked) => handleSettingChange('autoContinueReports', checked)}
            />
          </div>

          {settings.autoContinueReports && (
            <>
              <Separator />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Max Retry Attempts</h4>
                  <p className="text-xs text-muted-foreground">
                    Maximum times to auto-retry a stalled report (1-5)
                  </p>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={settings.autoContinueMaxRetries}
                    onChange={(e) => handleSettingChange('autoContinueMaxRetries', Math.min(5, Math.max(1, parseInt(e.target.value) || 3)))}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Retry Delay</h4>
                  <p className="text-xs text-muted-foreground">
                    Seconds to wait between retry attempts (10-60)
                  </p>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="10"
                    max="60"
                    value={settings.autoContinueDelaySeconds}
                    onChange={(e) => handleSettingChange('autoContinueDelaySeconds', Math.min(60, Math.max(10, parseInt(e.target.value) || 15)))}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save Settings - Sticky on mobile */}
      <div className="flex justify-end md:relative fixed bottom-16 left-0 right-0 md:bottom-auto p-4 md:p-0 bg-background/95 backdrop-blur-sm md:bg-transparent border-t md:border-0 z-30">
        <Button onClick={saveAllSettings} disabled={isSaving} className="w-full md:w-auto">
          {isSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}