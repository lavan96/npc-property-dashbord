import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Shield, Palette, Clock, Mail, FileSignature } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from 'next-themes';
import { ComparisonScoreMigration } from '@/components/admin/ComparisonScoreMigration';
import { ProfileCredentials } from '@/components/settings/ProfileCredentials';
import { FinanceAgentContacts } from '@/components/settings/FinanceAgentContacts';
import { useAuth } from '@/hooks/useAuth';
import { logActivityDirect } from '@/hooks/useActivityLogger';

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    timezone: 'Australia/Sydney',
    notifications: true,
    autoRefresh: true,
    refreshInterval: 5,
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
  const sessionToken = localStorage.getItem('session_token');

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
    if (!sessionToken) {
      setLoadingMailbox(false);
      setLoadingSignature(false);
      return;
    }
    
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'get_own_profile', session_token: sessionToken }
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
    if (!sessionToken) return;
    
    setSavingMailbox(true);
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: { 
          action: 'update_own_mailbox', 
          session_token: sessionToken,
          personal_mailbox: personalMailbox || null
        }
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
    if (!sessionToken) return;
    
    setSavingSignature(true);
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: { 
          action: 'update_own_signature', 
          session_token: sessionToken,
          email_signature: emailSignature || null
        }
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

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Timezone</h4>
                <p className="text-xs text-muted-foreground">
                  Affects how dates and times are displayed
                </p>
              </div>
              <div className="w-full sm:w-48">
                <Input
                  value={settings.timezone}
                  onChange={(e) => handleSettingChange('timezone', e.target.value)}
                  placeholder="Australia/Sydney"
                />
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

      {/* Save Settings */}
      <div className="flex justify-end">
        <Button onClick={saveAllSettings} disabled={isSaving}>
          {isSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}