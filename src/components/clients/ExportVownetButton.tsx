import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

interface ExportVownetButtonProps {
  clientId: string;
  clientName: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportVownetButton({ 
  clientId, 
  clientName,
  variant = 'outline',
  size = 'sm'
}: ExportVownetButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  // Fetch all client data for export
  const { data: clientData, refetch: refetchClient } = useQuery({
    queryKey: ['client-export-data', clientId],
    queryFn: async () => {
      const [
        { data: client, error: clientError },
        { data: properties, error: propsError },
        { data: employment, error: empError },
        { data: income, error: incError },
        { data: assets, error: assetsError },
        { data: liabilities, error: liabError },
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
    },
    enabled: false, // Only fetch on demand
  });

  const handleExportPrefilled = async () => {
    setIsExporting(true);
    try {
      const result = await refetchClient();
      
      if (!result.data?.client) {
        throw new Error('Failed to fetch client data');
      }

      const exportData: VownetExportData = {
        client: result.data.client,
        properties: result.data.properties,
        employment: result.data.employment,
        income: result.data.income,
        assets: result.data.assets,
        liabilities: result.data.liabilities,
      };

      downloadVownetTemplate(exportData);
      toast.success('Vownet form exported successfully');
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