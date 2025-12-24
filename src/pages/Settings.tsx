import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, XCircle, RefreshCw, Database, Shield, Palette, Clock, Eye, EyeOff, Mail } from 'lucide-react';
import { airtableService } from '@/lib/airtable';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from 'next-themes';
import { ComparisonScoreMigration } from '@/components/admin/ComparisonScoreMigration';
import { ProfileCredentials } from '@/components/settings/ProfileCredentials';
import { useAuth } from '@/hooks/useAuth';

export default function Settings() {
  const { user } = useAuth();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [credentials, setCredentials] = useState({
    token: '',
    baseId: '',
    tableName: ''
  });
  const [showToken, setShowToken] = useState(false);
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
      return;
    }
    
    try {
      const { data } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'get_own_profile', session_token: sessionToken }
      });

      if (data?.success && data.user) {
        setPersonalMailbox(data.user.personal_mailbox || '');
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoadingMailbox(false);
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

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const success = await airtableService.testConnection();
      setConnectionStatus(success ? 'success' : 'error');
      
      toast({
        title: success ? "Connection Successful" : "Connection Failed",
        description: success 
          ? "Successfully connected to Airtable" 
          : "Failed to connect to Airtable. Please check your configuration.",
        variant: success ? "default" : "destructive"
      });
    } catch (error) {
      setConnectionStatus('error');
      toast({
        title: "Connection Failed",
        description: "An error occurred while testing the connection.",
        variant: "destructive"
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const saveCredentials = async () => {
    try {
      toast({
        title: "Credentials Saved",
        description: "Please add these credentials to your Supabase Edge Function secrets manually.",
      });

      console.log('Credentials to add to Supabase secrets:', {
        AIRTABLE_TOKEN: credentials.token,
        AIRTABLE_BASE_ID: credentials.baseId,
        AIRTABLE_TABLE_NAME: credentials.tableName
      });

      // Reset the form
      setCredentials({ token: '', baseId: '', tableName: '' });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save credentials. Please try again.",
        variant: "destructive"
      });
    }
  };

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your dashboard and manage connections
        </p>
      </div>

      {/* Profile & Credentials */}
      <ProfileCredentials />

      {/* Airtable Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Airtable Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">API Credentials</h4>
            <p className="text-xs text-muted-foreground">
              Enter your Airtable credentials to connect to your database
            </p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Personal Access Token</Label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? "text" : "password"}
                    placeholder="Enter your Airtable personal access token"
                    value={credentials.token}
                    onChange={(e) => setCredentials(prev => ({ ...prev, token: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a personal access token in your Airtable account settings
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-id">Base ID</Label>
                <Input
                  id="base-id"
                  placeholder="Enter your Airtable base ID (e.g., appXXXXXXXXXXXXXX)"
                  value={credentials.baseId}
                  onChange={(e) => setCredentials(prev => ({ ...prev, baseId: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your Airtable base URL or API documentation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="table-name">Table Name</Label>
                <Input
                  id="table-name"
                  placeholder="Enter your table name (e.g., Properties, Listings)"
                  value={credentials.tableName}
                  onChange={(e) => setCredentials(prev => ({ ...prev, tableName: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  The exact name of the table containing your property data
                </p>
              </div>

              <Button 
                onClick={saveCredentials}
                disabled={!credentials.token || !credentials.baseId || !credentials.tableName}
                className="w-full"
              >
                Save Credentials
              </Button>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Connection Status</h4>
              <div className="flex items-center gap-2">
                {connectionStatus === 'success' && (
                  <>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <Badge variant="default">Connected</Badge>
                  </>
                )}
                {connectionStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <Badge variant="destructive">Disconnected</Badge>
                  </>
                )}
                {connectionStatus === 'unknown' && (
                  <Badge variant="outline">Unknown</Badge>
                )}
              </div>
            </div>
            
            <Button
              onClick={testConnection}
              disabled={isTestingConnection}
              variant="outline"
            >
              {isTestingConnection && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Display & Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
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
                >
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                >
                  Dark
                </Button>
                <Button
                  variant={theme === 'system' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('system')}
                >
                  System
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Timezone</h4>
                <p className="text-xs text-muted-foreground">
                  Affects how dates and times are displayed
                </p>
              </div>
              <div className="w-48">
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