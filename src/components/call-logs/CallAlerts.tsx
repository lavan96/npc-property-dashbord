import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Bell, 
  BellRing, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Settings,
  Mail,
  Send
} from 'lucide-react';
import { format } from 'date-fns';

interface AlertRule {
  id: string;
  name: string;
  condition_type: string;
  condition_operator: string;
  condition_value: string;
  is_positive: boolean;
  is_enabled: boolean;
  notification_type: string;
  created_at: string;
}

interface AlertHistory {
  id: string;
  rule_id: string;
  call_id: string;
  rule_name: string;
  message: string;
  is_positive: boolean;
  is_read: boolean;
  triggered_at: string;
}

interface CallLog {
  id: string;
  sentiment: string | null;
  duration_seconds: number | null;
  call_outcome: string | null;
  cost: number | null;
  customer_name: string | null;
  phone_number: string | null;
}

interface CallAlertsProps {
  calls: CallLog[];
  onAlertTriggered?: (alert: AlertHistory) => void;
}

const CONDITION_TYPES = [
  { value: 'sentiment', label: 'Sentiment', icon: ThumbsUp },
  { value: 'duration', label: 'Duration (seconds)', icon: Clock },
  { value: 'outcome', label: 'Call Outcome', icon: CheckCircle },
  { value: 'cost', label: 'Cost ($)', icon: DollarSign },
];

const OPERATORS = {
  sentiment: [
    { value: 'equals', label: 'equals' },
  ],
  duration: [
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
  ],
  outcome: [
    { value: 'equals', label: 'equals' },
  ],
  cost: [
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
  ],
};

const VALUE_OPTIONS = {
  sentiment: ['positive', 'negative', 'neutral', 'mixed'],
  outcome: ['completed', 'failed', 'voicemail', 'no-answer', 'busy', 'cancelled'],
};

export const CallAlerts = ({ calls, onAlertTriggered }: CallAlertsProps) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // New rule form
  const [newRuleName, setNewRuleName] = useState('');
  const [newConditionType, setNewConditionType] = useState('sentiment');
  const [newOperator, setNewOperator] = useState('equals');
  const [newValue, setNewValue] = useState('');
  const [newIsPositive, setNewIsPositive] = useState(false);
  const [newNotificationType, setNewNotificationType] = useState('toast');
  const [emailRecipient, setEmailRecipient] = useState('');

  useEffect(() => {
    fetchRules();
    fetchHistory();

    // Subscribe to new alerts
    const channel = supabase
      .channel('call-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_alert_history' }, (payload) => {
        const newAlert = payload.new as AlertHistory;
        setHistory(prev => [newAlert, ...prev]);
        setUnreadCount(prev => prev + 1);
        
        // Show toast notification
        toast({
          title: newAlert.is_positive ? '🎉 Positive Alert' : '⚠️ Alert Triggered',
          description: newAlert.message,
          variant: newAlert.is_positive ? 'default' : 'destructive',
        });
        
        onAlertTriggered?.(newAlert);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Check calls against rules and send email notifications if needed
  const sendEmailNotification = async (rule: AlertRule, call: CallLog, message: string) => {
    if (rule.notification_type !== 'email' && rule.notification_type !== 'both') return;
    
    // Extract email from notification settings (stored as JSON in condition for simplicity)
    // For this implementation, we'll use a default admin email or stored preference
    const adminEmail = localStorage.getItem('alertEmailRecipient') || '';
    if (!adminEmail) {
      console.log('No email recipient configured for alerts');
      return;
    }
    
    try {
      const response = await supabase.functions.invoke('send-call-alert-email', {
        body: {
          to: adminEmail,
          alertName: rule.name,
          callId: call.id,
          customerName: call.customer_name,
          phoneNumber: call.phone_number,
          sentiment: call.sentiment,
          duration: call.duration_seconds,
          outcome: call.call_outcome,
          cost: call.cost,
          message,
          isPositive: rule.is_positive,
        },
      });
      
      if (response.error) {
        console.error('Failed to send email notification:', response.error);
      } else {
        console.log('Email notification sent successfully');
      }
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  };

  // Check calls against rules
  const checkCallsAgainstRules = useCallback(async (callsToCheck: CallLog[]) => {
    const enabledRules = rules.filter(r => r.is_enabled);
    
    for (const call of callsToCheck) {
      for (const rule of enabledRules) {
        const triggered = evaluateRule(rule, call);
        if (triggered) {
          // Check if alert already exists for this call/rule combo
          const { data: existing } = await supabase
            .from('call_alert_history')
            .select('id')
            .eq('call_id', call.id)
            .eq('rule_id', rule.id)
            .single();
          
          if (!existing) {
            const message = generateAlertMessage(rule, call);
            await supabase.from('call_alert_history').insert({
              rule_id: rule.id,
              call_id: call.id,
              rule_name: rule.name,
              message,
              is_positive: rule.is_positive,
            });
            
            // Send email notification if configured
            await sendEmailNotification(rule, call, message);
          }
        }
      }
    }
  }, [rules]);

  useEffect(() => {
    if (calls.length > 0 && rules.length > 0) {
      // Check only recent calls (last hour)
      const recentCalls = calls.filter(c => {
        return true; // For simplicity, check all current calls
      });
      checkCallsAgainstRules(recentCalls);
    }
  }, [calls, rules, checkCallsAgainstRules]);

  const evaluateRule = (rule: AlertRule, call: CallLog): boolean => {
    const { condition_type, condition_operator, condition_value } = rule;
    
    switch (condition_type) {
      case 'sentiment':
        return call.sentiment === condition_value;
      case 'duration':
        if (!call.duration_seconds) return false;
        const durationVal = parseInt(condition_value);
        return condition_operator === 'greater_than' 
          ? call.duration_seconds > durationVal
          : call.duration_seconds < durationVal;
      case 'outcome':
        return call.call_outcome === condition_value;
      case 'cost':
        if (!call.cost) return false;
        const costVal = parseFloat(condition_value);
        return condition_operator === 'greater_than'
          ? call.cost > costVal
          : call.cost < costVal;
      default:
        return false;
    }
  };

  const generateAlertMessage = (rule: AlertRule, call: CallLog): string => {
    const caller = call.customer_name || call.phone_number || 'Unknown caller';
    
    switch (rule.condition_type) {
      case 'sentiment':
        return `${caller} - ${rule.condition_value} sentiment detected`;
      case 'duration':
        return `${caller} - Call duration: ${Math.round((call.duration_seconds || 0) / 60)}min`;
      case 'outcome':
        return `${caller} - Call ${rule.condition_value}`;
      case 'cost':
        return `${caller} - Call cost: $${(call.cost || 0).toFixed(2)}`;
      default:
        return `${caller} - Alert triggered`;
    }
  };

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from('call_alert_rules')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error) setRules(data || []);
  };

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('call_alert_history')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(50);
    
    if (!error) {
      setHistory(data || []);
      setUnreadCount((data || []).filter(a => !a.is_read).length);
    }
  };

  const createRule = async () => {
    if (!newRuleName.trim() || !newValue) return;
    
    // Validate email if email notifications are enabled
    if ((newNotificationType === 'email' || newNotificationType === 'both') && !emailRecipient) {
      toast({ title: 'Error', description: 'Please enter an email address for notifications', variant: 'destructive' });
      return;
    }
    
    // Save email recipient to localStorage for use in notifications
    if (emailRecipient) {
      localStorage.setItem('alertEmailRecipient', emailRecipient);
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.from('call_alert_rules').insert({
        name: newRuleName.trim(),
        condition_type: newConditionType,
        condition_operator: newOperator,
        condition_value: newValue,
        is_positive: newIsPositive,
        notification_type: newNotificationType,
      });

      if (error) throw error;

      toast({ title: 'Rule created', description: `"${newRuleName}" alert rule created` });
      setNewRuleName('');
      setNewValue('');
      setNewIsPositive(false);
      setNewNotificationType('toast');
      fetchRules();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create rule', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    const { error } = await supabase
      .from('call_alert_rules')
      .update({ is_enabled: enabled })
      .eq('id', ruleId);
    
    if (!error) {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_enabled: enabled } : r));
    }
  };

  const deleteRule = async (ruleId: string) => {
    const { error } = await supabase.from('call_alert_rules').delete().eq('id', ruleId);
    if (!error) fetchRules();
  };

  const markAllRead = async () => {
    await supabase
      .from('call_alert_history')
      .update({ is_read: true })
      .eq('is_read', false);
    
    setHistory(prev => prev.map(a => ({ ...a, is_read: true })));
    setUnreadCount(0);
  };

  const getConditionIcon = (type: string) => {
    const found = CONDITION_TYPES.find(c => c.value === type);
    return found ? found.icon : AlertTriangle;
  };

  const getNotificationTypeLabel = (type: string) => {
    switch (type) {
      case 'email': return 'Email';
      case 'both': return 'Toast + Email';
      default: return 'Toast';
    }
  };

  // Load saved email from localStorage
  useEffect(() => {
    const savedEmail = localStorage.getItem('alertEmailRecipient');
    if (savedEmail) setEmailRecipient(savedEmail);
  }, []);

  return (
    <div className="space-y-4">
      {/* Alert Bell with Dropdown */}
      <div className="flex items-center gap-2">
        <Dialog open={showManager} onOpenChange={setShowManager}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 relative">
              {unreadCount > 0 ? (
                <BellRing className="w-4 h-4 text-amber-500" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              Alerts
              {unreadCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Call Alerts
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Email Configuration */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Notifications
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure email address for alert notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="admin@example.com"
                      value={emailRecipient}
                      onChange={(e) => setEmailRecipient(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        localStorage.setItem('alertEmailRecipient', emailRecipient);
                        toast({ title: 'Saved', description: 'Email recipient saved' });
                      }}
                      disabled={!emailRecipient}
                    >
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Create New Rule */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create Alert Rule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Rule name (e.g., 'Negative Sentiment Alert')"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={newConditionType} onValueChange={(v) => {
                      setNewConditionType(v);
                      setNewOperator(OPERATORS[v as keyof typeof OPERATORS]?.[0]?.value || 'equals');
                      setNewValue('');
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="w-4 h-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={newOperator} onValueChange={setNewOperator}>
                      <SelectTrigger>
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS[newConditionType as keyof typeof OPERATORS]?.map(op => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {VALUE_OPTIONS[newConditionType as keyof typeof VALUE_OPTIONS] ? (
                      <Select value={newValue} onValueChange={setNewValue}>
                        <SelectTrigger>
                          <SelectValue placeholder="Value" />
                        </SelectTrigger>
                        <SelectContent>
                          {VALUE_OPTIONS[newConditionType as keyof typeof VALUE_OPTIONS].map(val => (
                            <SelectItem key={val} value={val} className="capitalize">{val}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="number"
                        placeholder={newConditionType === 'duration' ? 'Seconds' : 'Amount'}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                      />
                    )}
                  </div>
                  
                  {/* Notification Type Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm">Notification Type</Label>
                    <Select value={newNotificationType} onValueChange={setNewNotificationType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select notification type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="toast">
                          <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4" />
                            Toast Only
                          </div>
                        </SelectItem>
                        <SelectItem value="email">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            Email Only
                          </div>
                        </SelectItem>
                        <SelectItem value="both">
                          <div className="flex items-center gap-2">
                            <Send className="w-4 h-4" />
                            Toast + Email
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={newIsPositive} onCheckedChange={setNewIsPositive} />
                      <span className="text-sm">
                        {newIsPositive ? (
                          <span className="flex items-center gap-1 text-emerald-500">
                            <ThumbsUp className="w-4 h-4" /> Positive Alert
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-500">
                            <AlertTriangle className="w-4 h-4" /> Warning Alert
                          </span>
                        )}
                      </span>
                    </div>
                    <Button onClick={createRule} disabled={loading || !newRuleName.trim() || !newValue} size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Create Rule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Active Rules */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Active Rules ({rules.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {rules.map(rule => {
                        const Icon = getConditionIcon(rule.condition_type);
                        return (
                          <div key={rule.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded ${rule.is_positive ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                                <Icon className={`w-4 h-4 ${rule.is_positive ? 'text-emerald-500' : 'text-amber-500'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{rule.name}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-muted-foreground">
                                    {rule.condition_type} {rule.condition_operator.replace('_', ' ')} {rule.condition_value}
                                  </p>
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    {rule.notification_type === 'email' && <Mail className="w-3 h-3 mr-1" />}
                                    {rule.notification_type === 'both' && <Send className="w-3 h-3 mr-1" />}
                                    {getNotificationTypeLabel(rule.notification_type)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={rule.is_enabled}
                                onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteRule(rule.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {rules.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No alert rules configured</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Alert History */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Recent Alerts
                    </CardTitle>
                    {unreadCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                        Mark all read
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {history.map(alert => (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                            !alert.is_read ? 'bg-primary/5' : 'bg-muted/30'
                          }`}
                        >
                          <div className={`p-1.5 rounded ${alert.is_positive ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                            {alert.is_positive ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{alert.rule_name}</p>
                              {!alert.is_read && (
                                <Badge variant="secondary" className="h-4 text-[10px]">New</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{alert.message}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(alert.triggered_at), 'MMM dd, HH:mm')}
                            </p>
                          </div>
                        </div>
                      ))}
                      {history.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No alerts yet</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
