import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trash2, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Client {
  id: string;
  primary_first_name: string;
  primary_surname: string;
  primary_email: string | null;
  primary_mobile: string | null;
  total_portfolio_value: number;
  total_debt: number;
  net_monthly_cash_flow: number;
  ghl_sync_status: string | null;
  client_properties?: { id: string }[];
}

interface ClientBulkActionsProps {
  selectedClients: string[];
  clients: Client[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function ClientBulkActions({ 
  selectedClients, 
  clients, 
  onClearSelection,
  onActionComplete 
}: ClientBulkActionsProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const selectedCount = selectedClients.length;
  const selectedClientData = clients.filter(c => selectedClients.includes(c.id));

  const handleBulkSync = async () => {
    setIsSyncing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const clientId of selectedClients) {
      try {
        const { data, error } = await supabase.functions.invoke('sync-client-to-ghl', {
          body: { clientId }
        });
        if (error || !data?.success) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsSyncing(false);
    toast.success(`Synced ${successCount} clients${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    onActionComplete();
    onClearSelection();
  };

  const getSessionToken = () => localStorage.getItem('session_token');

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    const sessionToken = getSessionToken();
    
    try {
      // Try secure Edge Function for each client
      if (sessionToken) {
        let allSuccess = true;
        for (const clientId of selectedClients) {
          try {
            const { data, error } = await supabase.functions.invoke('manage-client-data', {
              body: {
                operation: 'delete',
                table: 'clients',
                clientId,
                session_token: sessionToken,
              },
            });
            
            if (error || !data?.success) {
              allSuccess = false;
              break;
            }
          } catch {
            allSuccess = false;
            break;
          }
        }
        
        if (allSuccess) {
          toast.success(`Deleted ${selectedCount} clients`);
          onActionComplete();
          onClearSelection();
          return;
        }
      }
      
      // Fallback to direct query
      const { error } = await supabase
        .from('clients')
        .delete()
        .in('id', selectedClients);

      if (error) throw error;

      toast.success(`Deleted ${selectedCount} clients`);
      onActionComplete();
      onClearSelection();
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Portfolio Value', 'Total Debt', 'Net Cash Flow', 'Properties', 'GHL Status'];
    const rows = selectedClientData.map(c => [
      `${c.primary_first_name} ${c.primary_surname}`,
      c.primary_email || '',
      c.primary_mobile || '',
      c.total_portfolio_value?.toString() || '0',
      c.total_debt?.toString() || '0',
      c.net_monthly_cash_flow?.toString() || '0',
      (c.client_properties?.length || 0).toString(),
      c.ghl_sync_status || 'not_synced'
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedCount} clients to CSV`);
  };

  const handleExportJSON = () => {
    const exportData = selectedClientData.map(c => ({
      name: `${c.primary_first_name} ${c.primary_surname}`,
      email: c.primary_email,
      phone: c.primary_mobile,
      portfolioValue: c.total_portfolio_value,
      totalDebt: c.total_debt,
      netCashFlow: c.net_monthly_cash_flow,
      propertiesCount: c.client_properties?.length || 0,
      ghlStatus: c.ghl_sync_status
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedCount} clients to JSON`);
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
        <Badge variant="secondary" className="font-medium">
          {selectedCount} selected
        </Badge>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync to GHL
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJSON}>
              <Download className="h-4 w-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} Clients</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCount} clients? This will also delete all their properties, income, assets, and liabilities. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
