import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { downloadVownetTemplate, downloadBlankVownetTemplate, type VownetExportData } from '@/utils/vownetTemplateGenerator';
import { useNotifications } from '@/contexts/NotificationsContext';
import { supabase } from '@/integrations/supabase/client';

interface ExportVownetButtonProps {
  clientId: string;
  clientName: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Helper to get session token
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

/**
 * Fetch client data securely with fallback
 */
async function fetchClientDataForExport(clientId: string) {
  const sessionToken = getSessionToken();
  
  // Try secure Edge Function first
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('get-client-data', {
        body: {
          session_token: sessionToken,
          clientId,
          include: {
            client: true,
            properties: true,
            employment: true,
            income: true,
            assets: true,
            liabilities: true,
          },
        },
      });

      if (!error && data?.success) {
        return {
          client: data.data?.client,
          properties: data.data?.properties || [],
          employment: data.data?.employment || [],
          income: data.data?.income || [],
          assets: data.data?.assets || [],
          liabilities: data.data?.liabilities || [],
        };
      }
      
      if (error && !error.message?.includes('401')) {
        console.warn('Secure export fetch failed, falling back:', error.message);
      }
    } catch (err) {
      console.warn('Edge function call failed, falling back:', err);
    }
  }

  // Fallback: Direct Supabase queries
  const [
    { data: client, error: clientError },
    { data: properties },
    { data: employment },
    { data: income },
    { data: assets },
    { data: liabilities },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase.from('client_properties').select('*').eq('client_id', clientId),
    supabase.from('client_employment').select('*').eq('client_id', clientId),
    supabase.from('client_income').select('*').eq('client_id', clientId),
    supabase.from('client_assets').select('*').eq('client_id', clientId),
    supabase.from('client_liabilities').select('*').eq('client_id', clientId),
  ]);

  if (clientError) throw clientError;

  return {
    client,
    properties: properties || [],
    employment: employment || [],
    income: income || [],
    assets: assets || [],
    liabilities: liabilities || [],
  };
}

export function ExportVownetButton({ 
  clientId, 
  clientName,
  variant = 'outline',
  size = 'sm'
}: ExportVownetButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { addNotification } = useNotifications();

  const handleExportPrefilled = async () => {
    setIsExporting(true);
    try {
      const data = await fetchClientDataForExport(clientId);
      
      if (!data?.client) {
        throw new Error('Failed to fetch client data');
      }

      const exportData: VownetExportData = {
        client: data.client,
        properties: data.properties,
        employment: data.employment,
        income: data.income,
        assets: data.assets,
        liabilities: data.liabilities,
      };

      downloadVownetTemplate(exportData);
      toast.success('Vownet form exported successfully');
      
      addNotification({
        type: 'vownet_form_exported',
        title: 'Vownet Form Exported',
        message: `Vownet form exported for ${clientName}`,
        entityId: clientId
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBlank = () => {
    downloadBlankVownetTemplate();
    toast.success('Blank Vownet template downloaded');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPrefilled}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export Pre-filled Vownet Form
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleExportBlank}>
          <FileSpreadsheet className="h-4 w-4 mr-2 opacity-50" />
          Download Blank Template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
