import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { parseExcelToClients, type ParsedClient } from '@/utils/excelClientParser';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationsContext';

interface ExcelDropzoneProps {
  onImportComplete: () => void;
}

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'complete' | 'error';

interface ImportResult {
  clientsCreated: number;
  propertiesCreated: number;
  errors: string[];
}

export function ExcelDropzone({ onImportComplete }: ExcelDropzoneProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setStatus('parsing');
    setProgress(10);

    try {
      // Read the Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      setProgress(30);

      // Parse clients from the workbook
      const clients = parseExcelToClients(workbook);
      
      if (clients.length === 0) {
        throw new Error('No valid client data found in the spreadsheet');
      }

      setParsedClients(clients);
      setProgress(50);
      setStatus('importing');

      // Import each client
      const result: ImportResult = {
        clientsCreated: 0,
        propertiesCreated: 0,
        errors: []
      };

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        
        try {
          // Prepare client data
          const clientInsertData = {
            primary_first_name: client.primaryContact.firstName || 'Unknown',
            primary_middle_name: client.primaryContact.middleName,
            primary_surname: client.primaryContact.surname || 'Unknown',
            primary_mobile: client.primaryContact.mobile,
            primary_email: client.primaryContact.email,
            primary_gender: client.primaryContact.gender,
            primary_dob: client.primaryContact.dob,
            secondary_first_name: client.secondaryContact?.firstName,
            secondary_middle_name: client.secondaryContact?.middleName,
            secondary_surname: client.secondaryContact?.surname,
            secondary_mobile: client.secondaryContact?.mobile,
            secondary_email: client.secondaryContact?.email,
            secondary_gender: client.secondaryContact?.gender,
            secondary_dob: client.secondaryContact?.dob,
            current_address: client.address?.currentAddress,
            country: client.address?.country || 'Australia',
            living_situation: client.address?.livingSituation,
            residential_status: client.residentialStatus,
            marital_status: client.familyRelations?.maritalStatus,
            dependents_count: client.familyRelations?.dependentsCount || 0,
            total_portfolio_value: client.portfolioSummary?.totalPortfolioValue || 0,
            total_debt: client.portfolioSummary?.totalDebt || 0,
            total_monthly_expenditure: client.portfolioSummary?.totalMonthlyExpenditure || 0,
            total_monthly_income: client.portfolioSummary?.totalMonthlyIncome || 0,
            total_monthly_rental_income: client.portfolioSummary?.totalMonthlyRentalIncome || 0,
            net_monthly_cash_flow: client.portfolioSummary?.netMonthlyCashFlow || 0,
            ghl_sync_status: 'pending',
            created_by: user?.id
          };

          // Insert client via secure Edge Function
          const { data: fnData, error: fnError } = await invokeSecureFunction('manage-client-data', {
            operation: 'create',
            table: 'clients',
            clientId: '',
            data: clientInsertData,
          });
          
          if (fnError) throw new Error(fnError.message);
          if (!fnData?.success) throw new Error(fnData?.error || 'Failed to create client');
          
          const clientData = fnData.result;
          result.clientsCreated++;
          const newClientId = clientData.id;

          // Insert properties
          if (client.properties && client.properties.length > 0) {
            for (const property of client.properties) {
              const propertyData = {
                client_id: newClientId,
                property_type: property.propertyType,
                address: property.address || 'Unknown Address',
                value: property.value || 0,
                loan_remaining: property.loanRemaining || 0,
                interest_rate: property.interestRate || 0,
                ownership_percentage: property.ownershipPercentage || 100,
                monthly_interest_repayment: property.monthlyInterestRepayment || 0,
                monthly_body_corporate: property.monthlyBodyCorporate || 0,
                monthly_council_rates: property.monthlyCouncilRates || 0,
                monthly_water_rates: property.monthlyWaterRates || 0,
                monthly_repairs_maintenance: property.monthlyRepairsMaintenance || 0,
                monthly_property_management: property.monthlyPropertyManagement || 0,
                monthly_landlord_insurance: property.monthlyLandlordInsurance || 0,
                monthly_building_insurance: property.monthlyBuildingInsurance || 0,
                monthly_rental_income: property.monthlyRentalIncome || 0,
                weekly_rental_income: property.weeklyRentalIncome || 0,
                total_monthly_expenditure: property.totalMonthlyExpenditure || 0,
                net_monthly_cashflow: property.netMonthlyCashflow || 0
              };

              const { data: propData, error: propError } = await invokeSecureFunction('manage-client-data', {
                operation: 'create',
                table: 'client_properties',
                clientId: newClientId,
                data: propertyData,
              });
              
              if (propError || !propData?.success) {
                result.errors.push(`Property error for ${client.primaryContact.firstName}: ${propError?.message || propData?.error}`);
              } else {
                result.propertiesCreated++;
              }
            }
          }

          // Insert employment records
          if (client.employment) {
            for (const emp of client.employment) {
              const empData = {
                client_id: newClientId,
                contact_type: emp.contactType,
                employer_name: emp.employerName,
                employment_type: emp.employmentType,
                occupation_role: emp.occupationRole,
                start_date: emp.startDate,
                is_current: true
              };
              
              await invokeSecureFunction('manage-client-data', {
                operation: 'create',
                table: 'client_employment',
                clientId: newClientId,
                data: empData,
              });
            }
          }

          // Insert income records
          if (client.income) {
            for (const inc of client.income) {
              const incData = {
                client_id: newClientId,
                contact_type: inc.contactType,
                gross_salary: inc.grossSalary || 0,
                salary_frequency: inc.salaryFrequency || 'annual',
                bonus: inc.bonus || 0,
                allowance: inc.allowance || 0,
                commission: inc.commission || 0,
                overtime_essential: inc.overtimeEssential || 0,
                overtime_non_essential: inc.overtimeNonEssential || 0,
                other_taxable_income: inc.otherTaxableIncome || 0
              };
              
              await invokeSecureFunction('manage-client-data', {
                operation: 'create',
                table: 'client_income',
                clientId: newClientId,
                data: incData,
              });
            }
          }

          // Insert assets
          if (client.assets) {
            for (const asset of client.assets) {
              const assetData = {
                client_id: newClientId,
                asset_type: asset.assetType,
                vehicle_type: asset.vehicleType,
                make_model: asset.makeModel,
                institution_name: asset.institutionName,
                description: asset.description,
                value: asset.value || 0
              };
              
              await invokeSecureFunction('manage-client-data', {
                operation: 'create',
                table: 'client_assets',
                clientId: newClientId,
                data: assetData,
              });
            }
          }

          // Insert liabilities
          if (client.liabilities) {
            for (const liability of client.liabilities) {
              const liabData = {
                client_id: newClientId,
                liability_type: liability.liabilityType,
                provider_name: liability.providerName,
                current_balance: liability.currentBalance || 0,
                credit_limit: liability.creditLimit,
                interest_rate: liability.interestRate,
                monthly_repayment: liability.monthlyRepayment || 0,
                repayment_type: liability.repaymentType
              };
              
              await invokeSecureFunction('manage-client-data', {
                operation: 'create',
                table: 'client_liabilities',
                clientId: newClientId,
                data: liabData,
              });
            }
          }

        } catch (err: any) {
          result.errors.push(`Failed to import ${client.primaryContact.firstName || 'client'}: ${err.message}`);
        }

        setProgress(50 + ((i + 1) / clients.length) * 45);
      }

      // Log the import via secure Edge Function
      await invokeSecureFunction('manage-client-data', {
        operation: 'create',
        table: 'client_import_logs',
        clientId: '',
        data: {
          file_name: file.name,
          status: result.errors.length === 0 ? 'completed' : 'completed_with_errors',
          clients_created: result.clientsCreated,
          properties_created: result.propertiesCreated,
          errors: result.errors,
          imported_by: user?.id,
          completed_at: new Date().toISOString()
        }
      });

      setProgress(100);
      setImportResult(result);
      setStatus('complete');
      
      if (result.clientsCreated > 0) {
        toast.success(`Successfully imported ${result.clientsCreated} client(s) with ${result.propertiesCreated} properties`);
        
        // Add notification for client import
        addNotification({
          type: 'client_created',
          title: 'Clients Imported',
          message: `${result.clientsCreated} client(s) imported with ${result.propertiesCreated} properties`
        });
        
        // Auto-sync imported clients to GHL via secure Edge Function
        try {
          const { data: clientsData } = await invokeSecureFunction<{ success: boolean; clients: Array<{ id: string }> }>('get-client-data', {
            listMode: true,
            listOptions: {
              select: 'id',
              filters: { ghl_sync_status: 'pending' },
              orderBy: 'created_at',
              order_asc: false,
              limit: result.clientsCreated
            }
          });
          
          const newClients = clientsData?.clients || [];
          
          if (newClients.length > 0) {
            toast.info('Syncing clients to GoHighLevel...');
            const clientIds = newClients.map(c => c.id);
            
            const { data: syncResult, error: syncError } = await supabase.functions.invoke('sync-client-to-ghl', {
              body: { action: 'batch', clientIds }
            });
            
            if (syncError) {
              console.error('Auto-sync error:', syncError);
              toast.warning('Import complete, but GHL sync failed. You can retry manually.');
            } else if (syncResult?.success) {
              toast.success(`Synced ${syncResult.results?.filter((r: any) => r.success).length || 0} clients to GHL`);
            }
          }
        } catch (syncErr) {
          console.error('Auto-sync error:', syncErr);
        }
        
        onImportComplete();
      }

    } catch (error: any) {
      console.error('Import error:', error);
      setStatus('error');
      toast.error(`Import failed: ${error.message}`);
    }
  }, [user, onImportComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0]);
      }
    },
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    disabled: status === 'parsing' || status === 'importing'
  });

  const resetState = () => {
    setStatus('idle');
    setProgress(0);
    setFileName(null);
    setParsedClients([]);
    setImportResult(null);
  };

  return (
    <div className="space-y-4">
      {status === 'idle' && (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }
          `}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground">
            {isDragActive ? 'Drop the Excel file here' : 'Drag & drop your Excel file here'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse (supports .xlsx and .xls)
          </p>
        </div>
      )}

      {(status === 'parsing' || status === 'importing') && (
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">{fileName}</p>
              <p className="text-sm text-muted-foreground">
                {status === 'parsing' ? 'Parsing spreadsheet...' : 'Importing clients...'}
              </p>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {status === 'complete' && importResult && (
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-medium text-foreground">Import Complete</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <Badge variant="secondary" className="text-sm">
              {importResult.clientsCreated} Client(s)
            </Badge>
            <Badge variant="secondary" className="text-sm">
              {importResult.propertiesCreated} Properties
            </Badge>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium text-sm">{importResult.errors.length} Warning(s)</span>
              </div>
              <ul className="text-sm text-destructive/80 space-y-1">
                {importResult.errors.slice(0, 5).map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>• ...and {importResult.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <Button onClick={resetState} variant="outline" className="w-full">
            <Upload className="h-4 w-4 mr-2" />
            Import Another File
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="border border-destructive/50 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <XCircle className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Import Failed</p>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
          <Button onClick={resetState} variant="outline" className="w-full">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
