import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Settings2, 
  Database, 
  Phone, 
  Mail, 
  Brain, 
  Webhook,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Cloud,
  RefreshCw,
  Upload,
  AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlannedIntegrations } from '@/components/integrations/PlannedIntegrations';

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  fields: {
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'password';
    required?: boolean;
  }[];
  docsUrl?: string;
}

const integrations: IntegrationConfig[] = [
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Connect to Airtable for property listings and data management',
    icon: <Database className="h-6 w-6" />,
    docsUrl: 'https://airtable.com/developers/web/api/introduction',
    fields: [
      { key: 'AIRTABLE_API_KEY', label: 'API Key', placeholder: 'pat...', type: 'password', required: true },
      { key: 'AIRTABLE_BASE_ID', label: 'Base ID', placeholder: 'app...', type: 'text', required: true },
    ],
  },
  {
    id: 'vapi',
    name: 'Vapi',
    description: 'Voice AI platform for call handling and transcription',
    icon: <Phone className="h-6 w-6" />,
    docsUrl: 'https://docs.vapi.ai',
    fields: [
      { key: 'VAPI_API_KEY', label: 'API Key', placeholder: 'Enter Vapi API key', type: 'password', required: true },
    ],
  },
  {
    id: 'gohighlevel',
    name: 'GoHighLevel',
    description: 'CRM and marketing automation platform integration',
    icon: <Settings2 className="h-6 w-6" />,
    docsUrl: 'https://highlevel.stoplight.io/docs/integrations',
    fields: [
      { key: 'GHL_API_KEY', label: 'API Key', placeholder: 'Enter GHL API key', type: 'password', required: true },
      { key: 'GHL_LOCATION_ID', label: 'Location ID', placeholder: 'Enter location ID', type: 'text', required: true },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'AI-powered analysis, chart generation, and report Q&A',
    icon: <Brain className="h-6 w-6" />,
    docsUrl: 'https://platform.openai.com/docs',
    fields: [
      { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...', type: 'password', required: true },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI search for report regeneration and research',
    icon: <Brain className="h-6 w-6" />,
    docsUrl: 'https://docs.perplexity.ai',
    fields: [
      { key: 'PERPLEXITY_API_KEY', label: 'API Key', placeholder: 'pplx-...', type: 'password', required: true },
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS and voice communication services',
    icon: <Phone className="h-6 w-6" />,
    docsUrl: 'https://www.twilio.com/docs',
    fields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', placeholder: 'AC...', type: 'text', required: true },
      { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', placeholder: 'Enter auth token', type: 'password', required: true },
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft / Outlook',
    description: 'Email sync and calendar integration via Microsoft Graph',
    icon: <Mail className="h-6 w-6" />,
    docsUrl: 'https://learn.microsoft.com/en-us/graph/overview',
    fields: [
      { key: 'MICROSOFT_CLIENT_ID', label: 'Client ID', placeholder: 'Enter client ID', type: 'text', required: true },
      { key: 'MICROSOFT_CLIENT_SECRET', label: 'Client Secret', placeholder: 'Enter client secret', type: 'password', required: true },
      { key: 'MICROSOFT_TENANT_ID', label: 'Tenant ID', placeholder: 'Enter tenant ID', type: 'text', required: true },
    ],
  },
  {
    id: 'make',
    name: 'Make.com',
    description: 'Workflow automation webhooks',
    icon: <Webhook className="h-6 w-6" />,
    docsUrl: 'https://www.make.com/en/help',
    fields: [
      { key: 'MAKE_WEBHOOK_URL', label: 'Webhook URL', placeholder: 'https://hook.make.com/...', type: 'text' },
    ],
  },
];

interface SupabaseSecretStatus {
  configured: boolean;
  configuredSecrets: string[];
  missingSecrets: string[];
}

export default function Integrations() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabaseSecrets, setSupabaseSecrets] = useState<Record<string, SupabaseSecretStatus>>({});
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [syncingToSupabase, setSyncingToSupabase] = useState<string | null>(null);
  const [supabaseSetupRequired, setSupabaseSetupRequired] = useState(false);

  // Load saved integration configs from database
  useEffect(() => {
    loadIntegrationConfigs();
    checkSupabaseSecrets();
  }, []);

  const checkSupabaseSecrets = async () => {
    setLoadingSecrets(true);
    try {
      const { data, error } = await invokeSecureFunction('check-integration-secrets', {});
      
      if (error) {
        console.error('Error checking Supabase secrets:', error);
        return;
      }

      if (data?.success && data?.integrations) {
        setSupabaseSecrets(data.integrations);
      }
    } catch (error) {
      console.error('Failed to check Supabase secrets:', error);
    } finally {
      setLoadingSecrets(false);
    }
  };

  const loadIntegrationConfigs = async () => {
    try {
      const { data, error } = await invokeSecureFunction('manage-templates', {
        operation: 'list',
        table: 'integration_configs'
      });

      if (error) {
        console.error('Error loading integration configs:', error);
        // Table might not exist yet, that's okay
        setLoading(false);
        return;
      }

      if (data?.records) {
        const loadedValues: Record<string, string> = {};
        const loadedKeys = new Set<string>();
        
        data.records.forEach((config: any) => {
          loadedValues[config.key_name] = config.key_value || '';
          if (config.key_value) {
            loadedKeys.add(config.key_name);
          }
        });
        
        setValues(loadedValues);
        setSavedKeys(loadedKeys);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveIntegration = async (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return;

    setSaving(integrationId);

    try {
      // Save each field for this integration
      for (const field of integration.fields) {
        const value = values[field.key] || '';
        
        const { error } = await invokeSecureFunction('manage-templates', {
          operation: 'upsert',
          table: 'integration_configs',
          data: {
            key_name: field.key,
            key_value: value,
            integration_id: integrationId,
            updated_at: new Date().toISOString()
          },
          onConflict: 'key_name'
        });

        if (error) throw new Error(error.message);

        if (value) {
          setSavedKeys(prev => new Set([...prev, field.key]));
        } else {
          setSavedKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(field.key);
            return newSet;
          });
        }
      }

      toast({
        title: 'Configuration Saved',
        description: `${integration.name} settings have been saved successfully.`,
      });
    } catch (error) {
      console.error('Error saving integration:', error);
      toast({
        title: 'Error',
        description: 'Failed to save configuration. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  // Map frontend field keys to Supabase secret names
  const getSupabaseSecretName = (fieldKey: string): string => {
    const keyMap: Record<string, string> = {
      'AIRTABLE_API_KEY': 'AIRTABLE_TOKEN',
      'GHL_API_KEY': 'GOHIGHLEVEL_API_KEY',
      'GHL_LOCATION_ID': 'GOHIGHLEVEL_LOCATION_ID',
    };
    return keyMap[fieldKey] || fieldKey;
  };

  const syncToSupabase = async (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return;

    setSyncingToSupabase(integrationId);

    try {
      // Collect secrets for this integration
      const secrets = integration.fields
        .filter(field => values[field.key]?.trim())
        .map(field => ({
          name: getSupabaseSecretName(field.key),
          value: values[field.key].trim()
        }));

      if (secrets.length === 0) {
        toast({
          title: 'No Values to Sync',
          description: 'Please enter API key values before syncing to Supabase.',
          variant: 'destructive',
        });
        setSyncingToSupabase(null);
        return;
      }

      // Use invokeSecureFunction for cookie-based auth
      const { invokeSecureFunction } = await import('@/lib/secureInvoke');
      const { data, error } = await invokeSecureFunction('update-integration-secret', { secrets });

      if (error) throw error;

      if (data?.setupRequired) {
        setSupabaseSetupRequired(true);
        toast({
          title: 'Setup Required',
          description: data.error || 'SUPABASE_ACCESS_TOKEN needs to be configured.',
          variant: 'destructive',
        });
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to sync secrets');
      }

      toast({
        title: 'Synced to Supabase',
        description: `${data.updatedSecrets?.length || 0} secret(s) updated successfully.`,
      });

      // Refresh the Supabase secrets status
      await checkSupabaseSecrets();

    } catch (error) {
      console.error('Error syncing to Supabase:', error);
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync secrets to Supabase.',
        variant: 'destructive',
      });
    } finally {
      setSyncingToSupabase(null);
    }
  };

  const getIntegrationStatus = (integration: IntegrationConfig) => {
    const requiredFields = integration.fields.filter(f => f.required !== false);
    const configuredFields = requiredFields.filter(f => savedKeys.has(f.key));
    
    if (configuredFields.length === 0) return 'not_configured';
    if (configuredFields.length === requiredFields.length) return 'configured';
    return 'partial';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'configured':
        return (
          <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Configured
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Incomplete
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Not Configured
          </Badge>
        );
    }
  };

  const getSupabaseSecretBadge = (integrationId: string) => {
    const secretStatus = supabaseSecrets[integrationId];
    
    if (!secretStatus) return null;
    
    if (secretStatus.configured) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                <Cloud className="h-3 w-3 mr-1" />
                Supabase
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Configured in Supabase secrets:</p>
              <ul className="text-xs mt-1">
                {secretStatus.configuredSecrets.map(s => (
                  <li key={s} className="text-green-400">✓ {s}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    } else if (secretStatus.configuredSecrets.length > 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                <Cloud className="h-3 w-3 mr-1" />
                Partial
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Supabase secrets status:</p>
              <ul className="text-xs mt-1">
                {secretStatus.configuredSecrets.map(s => (
                  <li key={s} className="text-green-400">✓ {s}</li>
                ))}
                {secretStatus.missingSecrets.map(s => (
                  <li key={s} className="text-red-400">✗ {s}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure API keys and credentials for external services
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkSupabaseSecrets}
          disabled={loadingSecrets}
          className="gap-2 min-h-[44px] sm:min-h-0 self-start"
        >
          {loadingSecrets ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync Status
        </Button>
      </div>

      {supabaseSetupRequired && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Supabase Access Token Required:</span> To sync API keys to Supabase secrets, 
            add a <code className="bg-muted px-1 rounded">SUPABASE_ACCESS_TOKEN</code> secret in your{' '}
            <a 
              href="https://supabase.com/dashboard/project/dduzbchuswwbefdunfct/settings/functions" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Supabase dashboard
            </a>. 
            Get your token from{' '}
            <a 
              href="https://supabase.com/dashboard/account/tokens" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Account → Access Tokens
            </a>.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="all" className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-max">
            <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
            <TabsTrigger value="configured" className="text-xs sm:text-sm">Configured</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs sm:text-sm">Pending</TabsTrigger>
            <TabsTrigger value="planned" className="text-xs sm:text-sm">Roadmap</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-6">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
            {integrations.map(integration => {
              const status = getIntegrationStatus(integration);
              return (
                <Card key={integration.id} className="bg-card border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          {integration.icon}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{integration.name}</CardTitle>
                          <CardDescription className="text-sm mt-0.5">
                            {integration.description}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end">
                        {getStatusBadge(status)}
                        {getSupabaseSecretBadge(integration.id)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {integration.fields.map(field => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={field.key} className="text-sm">
                          {field.label}
                          {field.required !== false && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <div className="relative">
                          <Input
                            id={field.key}
                            type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                            placeholder={field.placeholder}
                            value={values[field.key] || ''}
                            onChange={(e) => handleValueChange(field.key, e.target.value)}
                            className="pr-10"
                          />
                          {field.type === 'password' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => togglePasswordVisibility(field.key)}
                            >
                              {showPasswords[field.key] ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
                      {integration.docsUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => window.open(integration.docsUrl, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Docs
                        </Button>
                      )}
                      <div className="flex gap-2 ml-auto">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => syncToSupabase(integration.id)}
                                disabled={syncingToSupabase === integration.id || saving === integration.id}
                              >
                                {syncingToSupabase === integration.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Sync to Supabase Secrets</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          onClick={() => saveIntegration(integration.id)}
                          disabled={saving === integration.id || syncingToSupabase === integration.id}
                        >
                          {saving === integration.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="configured" className="mt-6">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
            {integrations
              .filter(i => getIntegrationStatus(i) === 'configured')
              .map(integration => {
                const status = getIntegrationStatus(integration);
                return (
                  <Card key={integration.id} className="bg-card border-border">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {integration.icon}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{integration.name}</CardTitle>
                            <CardDescription className="text-sm mt-0.5">
                              {integration.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          {getStatusBadge(status)}
                          {getSupabaseSecretBadge(integration.id)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {integration.fields.map(field => (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={field.key} className="text-sm">
                            {field.label}
                          </Label>
                          <div className="relative">
                            <Input
                              id={field.key}
                              type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                              placeholder={field.placeholder}
                              value={values[field.key] || ''}
                              onChange={(e) => handleValueChange(field.key, e.target.value)}
                              className="pr-10"
                            />
                            {field.type === 'password' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => togglePasswordVisibility(field.key)}
                              >
                                {showPasswords[field.key] ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex items-center justify-between pt-2 gap-2">
                        {integration.docsUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => window.open(integration.docsUrl, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Docs
                          </Button>
                        )}
                        <div className="flex gap-2 ml-auto">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => syncToSupabase(integration.id)}
                                  disabled={syncingToSupabase === integration.id || saving === integration.id}
                                >
                                  {syncingToSupabase === integration.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sync to Supabase Secrets</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            onClick={() => saveIntegration(integration.id)}
                            disabled={saving === integration.id || syncingToSupabase === integration.id}
                          >
                            {saving === integration.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            {integrations.filter(i => getIntegrationStatus(i) === 'configured').length === 0 && (
              <div className="col-span-2 text-center py-12 text-muted-foreground">
                No integrations have been fully configured yet.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {integrations
              .filter(i => getIntegrationStatus(i) !== 'configured')
              .map(integration => {
                const status = getIntegrationStatus(integration);
                return (
                  <Card key={integration.id} className="bg-card border-border">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {integration.icon}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{integration.name}</CardTitle>
                            <CardDescription className="text-sm mt-0.5">
                              {integration.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          {getStatusBadge(status)}
                          {getSupabaseSecretBadge(integration.id)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {integration.fields.map(field => (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={field.key} className="text-sm">
                            {field.label}
                            {field.required !== false && <span className="text-destructive ml-1">*</span>}
                          </Label>
                          <div className="relative">
                            <Input
                              id={field.key}
                              type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                              placeholder={field.placeholder}
                              value={values[field.key] || ''}
                              onChange={(e) => handleValueChange(field.key, e.target.value)}
                              className="pr-10"
                            />
                            {field.type === 'password' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                onClick={() => togglePasswordVisibility(field.key)}
                              >
                                {showPasswords[field.key] ? (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex items-center justify-between pt-2 gap-2">
                        {integration.docsUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => window.open(integration.docsUrl, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Docs
                          </Button>
                        )}
                        <div className="flex gap-2 ml-auto">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => syncToSupabase(integration.id)}
                                  disabled={syncingToSupabase === integration.id || saving === integration.id}
                                >
                                  {syncingToSupabase === integration.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sync to Supabase Secrets</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            onClick={() => saveIntegration(integration.id)}
                            disabled={saving === integration.id || syncingToSupabase === integration.id}
                          >
                            {saving === integration.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </TabsContent>

        {/* Planned Integrations Roadmap */}
        <TabsContent value="planned" className="mt-6">
          <PlannedIntegrations />
        </TabsContent>
      </Tabs>
    </div>
  );
}
