import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings, LayoutDashboard, User, TrendingUp, Building2, BarChart3,
  Briefcase, FileText, Mail, MessageSquare, Bell, CalendarDays,
  Save, Loader2, Palette, Clock, Type, Shield, Eye, Plus, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useGHLCalendar } from '@/hooks/useGHLCalendar';

interface BookingCalendarOption {
  id: string;
  name: string;
  description?: string;
}

interface PortalConfig {
  id: string;
  module_dashboard: boolean;
  module_profile: boolean;
  module_deal_progress: boolean;
  module_properties: boolean;
  module_property_insights: boolean;
  module_employment: boolean;
  module_documents: boolean;
  module_emails: boolean;
  module_messages: boolean;
  module_notifications: boolean;
  module_booking: boolean;
  welcome_title: string;
  welcome_message: string;
  welcome_banner_url: string | null;
  default_access_level: string;
  booking_calendar_id: string | null;
  booking_calendar_name: string | null;
  booking_calendars: BookingCalendarOption[];
  booking_slot_duration: number;
  booking_working_hours_start: number;
  booking_working_hours_end: number;
  booking_lead_time_hours: number;
  booking_max_advance_days: number;
  booking_confirmation_email: boolean;
  booking_team_notification_email: string | null;
  booking_intro_text: string;
  portal_accent_color: string | null;
  portal_footer_text: string;
}

const MODULE_ITEMS = [
  { key: 'module_dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Main portal landing page' },
  { key: 'module_profile', label: 'My Profile', icon: User, desc: 'Personal details editing' },
  { key: 'module_deal_progress', label: 'Deal Progress', icon: TrendingUp, desc: 'Visual deal pipeline tracker' },
  { key: 'module_properties', label: 'Properties', icon: Building2, desc: 'Property portfolio view' },
  { key: 'module_property_insights', label: 'Property Insights', icon: BarChart3, desc: 'Equity, LVR, yield analytics' },
  { key: 'module_employment', label: 'Finances', icon: Briefcase, desc: 'Employment and income details' },
  { key: 'module_documents', label: 'Documents', icon: FileText, desc: 'File uploads and downloads' },
  { key: 'module_emails', label: 'Correspondence', icon: Mail, desc: 'Email history view' },
  { key: 'module_messages', label: 'Messages', icon: MessageSquare, desc: 'Advisor messaging' },
  { key: 'module_notifications', label: 'Notifications', icon: Bell, desc: 'Activity alerts and updates' },
  { key: 'module_booking', label: 'Book Appointment', icon: CalendarDays, desc: 'Calendar booking via GHL' },
] as const;

export default function PortalConfig() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { calendars, fetchCalendarData } = useGHLCalendar();

  const DEFAULT_CONFIG: PortalConfig = {
    id: '',
    module_dashboard: true,
    module_profile: true,
    module_deal_progress: true,
    module_properties: true,
    module_property_insights: true,
    module_employment: true,
    module_documents: true,
    module_emails: true,
    module_messages: true,
    module_notifications: true,
    module_booking: true,
    welcome_title: 'Welcome to your Client Portal',
    welcome_message: 'Access your property investment details, track your deal progress, and communicate with your advisor.',
    welcome_banner_url: null,
    default_access_level: 'read_only',
    booking_calendar_id: null,
    booking_calendar_name: null,
    booking_calendars: [],
    booking_slot_duration: 30,
    booking_working_hours_start: 9,
    booking_working_hours_end: 17,
    booking_lead_time_hours: 24,
    booking_max_advance_days: 30,
    booking_confirmation_email: true,
    booking_team_notification_email: null,
    booking_intro_text: 'Schedule a consultation with our team.',
    portal_accent_color: null,
    portal_footer_text: 'Secured Portal • End-to-end encrypted',
  };

  // Fetch config
  const { data, isLoading } = useQuery({
    queryKey: ['portal-configuration'],
    queryFn: async () => {
      const { data, error } = await invokeSecureFunction('manage-client-data', {
        operation: 'list',
        table: 'portal_configuration',
      });
      if (error) throw new Error(error.message);
      const rows = data?.data || data || [];
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row || null;
    },
  });

  useEffect(() => {
    if (data) {
      setConfig(data as PortalConfig);
    } else if (!isLoading && !data) {
      setConfig(DEFAULT_CONFIG);
    }
  }, [data, isLoading]);

  // Load GHL calendars for the booking selector
  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const updateConfig = useCallback((updates: Partial<PortalConfig>) => {
    setConfig(prev => prev ? { ...prev, ...updates } : null);
    setHasChanges(true);
  }, []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!config) throw new Error('No config');
      const { id, ...updates } = config;
      const { error } = await invokeSecureFunction('manage-client-data', {
        operation: 'upsert',
        table: 'portal_configuration',
        data: updates,
        id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setHasChanges(false);
      toast.success('Portal configuration saved');
      queryClient.invalidateQueries({ queryKey: ['portal-configuration'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save configuration');
    },
  });

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Portal Configuration
          </h1>
          <p className="text-muted-foreground mt-1">Manage your client portal settings, modules, and booking configuration</p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="modules" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="modules" className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Modules
          </TabsTrigger>
          <TabsTrigger value="welcome" className="flex items-center gap-2">
            <Type className="h-4 w-4" /> Welcome
          </TabsTrigger>
          <TabsTrigger value="booking" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Booking
          </TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Access
          </TabsTrigger>
        </TabsList>

        {/* MODULE TOGGLES */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Portal Modules</CardTitle>
              <CardDescription>Enable or disable specific sections of the client portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {MODULE_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={(config as any)[item.key] ?? true}
                    onCheckedChange={(checked) => updateConfig({ [item.key]: checked } as any)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* WELCOME MESSAGE */}
        <TabsContent value="welcome">
          <Card>
            <CardHeader>
              <CardTitle>Welcome Message</CardTitle>
              <CardDescription>Customise the welcome text shown on the portal dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Welcome Title</Label>
                <Input
                  value={config.welcome_title || ''}
                  onChange={(e) => updateConfig({ welcome_title: e.target.value })}
                  placeholder="Welcome to your Client Portal"
                />
              </div>
              <div className="space-y-2">
                <Label>Welcome Message</Label>
                <Textarea
                  value={config.welcome_message || ''}
                  onChange={(e) => updateConfig({ welcome_message: e.target.value })}
                  placeholder="Access your property investment details..."
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Banner Image URL (optional)</Label>
                <Input
                  value={config.welcome_banner_url || ''}
                  onChange={(e) => updateConfig({ welcome_banner_url: e.target.value || null })}
                  placeholder="https://..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Portal Footer Text</Label>
                <Input
                  value={config.portal_footer_text || ''}
                  onChange={(e) => updateConfig({ portal_footer_text: e.target.value })}
                  placeholder="Secured Portal • End-to-end encrypted"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOOKING / CALENDAR */}
        <TabsContent value="booking">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Booking Configuration
              </CardTitle>
              <CardDescription>Configure the appointment booking system for the client portal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div>
                  <p className="font-medium">Enable Booking Module</p>
                  <p className="text-sm text-muted-foreground">Allow clients to book appointments through the portal</p>
                </div>
                <Switch
                  checked={config.module_booking}
                  onCheckedChange={(checked) => updateConfig({ module_booking: checked })}
                />
              </div>

              {config.module_booking && (
                <>
                  <Separator />

                  <div className="grid grid-cols-1 gap-4">
                    {/* Multi-calendar manager */}
                    <div className="space-y-3">
                      <Label>Available Calendars for Clients</Label>
                      <p className="text-xs text-muted-foreground">Add GHL calendars that clients can choose from when booking. Clients select one calendar per booking.</p>
                      
                      {/* Existing calendars list */}
                      {(config.booking_calendars || []).length > 0 && (
                        <div className="space-y-2">
                          {config.booking_calendars.map((bc, idx) => (
                            <div key={bc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{bc.name}</p>
                                {bc.description && <p className="text-xs text-muted-foreground truncate">{bc.description}</p>}
                                <p className="text-xs text-muted-foreground font-mono">{bc.id}</p>
                              </div>
                              <Input
                                className="w-48 text-xs"
                                placeholder="Label shown to clients..."
                                value={bc.description || ''}
                                onChange={(e) => {
                                  const updated = [...config.booking_calendars];
                                  updated[idx] = { ...updated[idx], description: e.target.value };
                                  updateConfig({ booking_calendars: updated });
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  const updated = config.booking_calendars.filter((_, i) => i !== idx);
                                  updateConfig({ booking_calendars: updated });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add calendar selector */}
                      {(() => {
                        const usedIds = new Set((config.booking_calendars || []).map(c => c.id));
                        const available = calendars.filter(c => !usedIds.has(c.id));
                        if (available.length === 0 && calendars.length > 0) return (
                          <p className="text-xs text-muted-foreground italic">All available GHL calendars have been added.</p>
                        );
                        return (
                          <div className="flex items-center gap-2">
                            <Select
                              value=""
                              onValueChange={(val) => {
                                const cal = calendars.find(c => c.id === val);
                                if (cal) {
                                  updateConfig({
                                    booking_calendars: [...(config.booking_calendars || []), { id: cal.id, name: cal.name, description: '' }],
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Add a GHL calendar..." />
                              </SelectTrigger>
                              <SelectContent>
                                {available.map((cal) => (
                                  <SelectItem key={cal.id} value={cal.id}>
                                    {cal.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Label>Slot Duration (minutes)</Label>
                      <Select
                        value={String(config.booking_slot_duration)}
                        onValueChange={(val) => updateConfig({ booking_slot_duration: Number(val) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="45">45 minutes</SelectItem>
                          <SelectItem value="60">60 minutes</SelectItem>
                          <SelectItem value="90">90 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Minimum Lead Time (hours)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={168}
                        value={config.booking_lead_time_hours}
                        onChange={(e) => updateConfig({ booking_lead_time_hours: Number(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">How far in advance clients must book</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Max Advance Booking (days)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        value={config.booking_max_advance_days}
                        onChange={(e) => updateConfig({ booking_max_advance_days: Number(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">How far ahead clients can book</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      Email Notifications
                    </h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Send Client Confirmation</p>
                        <p className="text-xs text-muted-foreground">Email the client a booking confirmation</p>
                      </div>
                      <Switch
                        checked={config.booking_confirmation_email}
                        onCheckedChange={(checked) => updateConfig({ booking_confirmation_email: checked })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Team Notification Email</Label>
                      <Input
                        type="email"
                        value={config.booking_team_notification_email || ''}
                        onChange={(e) => updateConfig({ booking_team_notification_email: e.target.value || null })}
                        placeholder="team@yourcompany.com"
                      />
                      <p className="text-xs text-muted-foreground">Receive an email when a client books an appointment</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Booking Introduction Text</Label>
                    <Textarea
                      value={config.booking_intro_text || ''}
                      onChange={(e) => updateConfig({ booking_intro_text: e.target.value })}
                      placeholder="Schedule a consultation with our team..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCESS LEVEL DEFAULTS */}
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Access Level Defaults
              </CardTitle>
              <CardDescription>Set the default permissions for new client portal users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Default Access Level for New Users</Label>
                <Select
                  value={config.default_access_level}
                  onValueChange={(val) => updateConfig({ default_access_level: val })}
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read_only">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Read Only</Badge>
                        <span className="text-muted-foreground text-xs">View data but cannot edit</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="limited_edit">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">Limited Edit</Badge>
                        <span className="text-muted-foreground text-xs">Edit profile and documents only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="full_edit">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">Full Edit</Badge>
                        <span className="text-muted-foreground text-xs">Edit all available sections</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                <h4 className="font-medium text-sm">Access Level Guide</h4>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs shrink-0 mt-0.5">Read Only</Badge>
                    <p>Clients can view all enabled portal sections but cannot modify any data. Documents are downloadable but not uploadable.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600 shrink-0 mt-0.5">Limited</Badge>
                    <p>Clients can edit their personal profile and upload documents. Other sections remain read-only.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs border-green-500/50 text-green-600 shrink-0 mt-0.5">Full Edit</Badge>
                    <p>Clients have full editing access across profile, properties, employment/financial details, and documents.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating save bar */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 px-6 py-3 bg-card border border-border rounded-full shadow-xl">
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
