import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  FileSpreadsheet, 
  Download,
  Trash2,
  Loader2,
  Upload,
  Calendar,
  CheckCircle2,
  FileUp,
  AlertTriangle,
  User,
  Briefcase,
  DollarSign,
  Building2,
  CreditCard,
  PiggyBank
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationsContext';
import * as XLSX from 'xlsx';
import { parseVownetForm } from '@/utils/vownetParser';
import type { ParsedClient } from '@/utils/excelClientParser';

interface ClientVownetFormsProps {
  clientId: string;
  clientName: string;
}

type UploadStatus = 'idle' | 'parsing' | 'importing' | 'complete' | 'error';

interface ImportSummary {
  personalDetailsUpdated: boolean;
  employmentRecords: number;
  incomeRecords: number;
  assetRecords: number;
  liabilityRecords: number;
  propertyRecords: number;
  portfolioUpdated: boolean;
}

export function ClientVownetForms({ clientId, clientName }: ClientVownetFormsProps) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // Fetch VowNet forms for this client
  const { data: vownetForms = [], isLoading } = useQuery({
    queryKey: ['client-vownet-forms', clientId],
    queryFn: async () => {
      // Try secure Edge Function first
      const sessionToken = localStorage.getItem('session_token');
      if (sessionToken) {
        const { data, error } = await supabase.functions.invoke('get-client-data', {
          body: {
            session_token: sessionToken,
            clientId,
            include: { files: true },
          },
        });
        if (!error && data?.success && data.data?.files) {
          return (data.data.files || []).filter((f: any) => f.is_vownet_form);
        }
      }

      // Fallback to direct query
      const { data, error } = await supabase
        .from('client_files')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_vownet_form', true)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const processAndImportVownetForm = async (file: File) => {
    setUploadStatus('parsing');
    setProgress(10);
    setErrorMessage(null);
    setImportSummary(null);

    try {
      // Check if it's a PDF file - PDFs require OCR and are not supported for data extraction
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('PDF parsing is not yet supported for VowNet data extraction. Please upload an Excel file (.xlsx or .xls) instead.');
      }

      // Parse the Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      setProgress(30);

      const parsedData = parseVownetForm(workbook);
      
      if (!parsedData) {
        throw new Error('Could not parse VowNet form. Please check the file format.');
      }

      setUploadStatus('importing');
      setProgress(40);

      const summary: ImportSummary = {
        personalDetailsUpdated: false,
        employmentRecords: 0,
        incomeRecords: 0,
        assetRecords: 0,
        liabilityRecords: 0,
        propertyRecords: 0,
        portfolioUpdated: false
      };

      // 1. Update personal details
      const clientUpdate: Record<string, any> = {};
      
      if (parsedData.primaryContact.firstName) clientUpdate.primary_first_name = parsedData.primaryContact.firstName;
      if (parsedData.primaryContact.middleName) clientUpdate.primary_middle_name = parsedData.primaryContact.middleName;
      if (parsedData.primaryContact.surname) clientUpdate.primary_surname = parsedData.primaryContact.surname;
      if (parsedData.primaryContact.mobile) clientUpdate.primary_mobile = parsedData.primaryContact.mobile;
      if (parsedData.primaryContact.email) clientUpdate.primary_email = parsedData.primaryContact.email;
      if (parsedData.primaryContact.gender) clientUpdate.primary_gender = parsedData.primaryContact.gender;
      if (parsedData.primaryContact.dob) clientUpdate.primary_dob = parsedData.primaryContact.dob;
      
      if (parsedData.secondaryContact) {
        if (parsedData.secondaryContact.firstName) clientUpdate.secondary_first_name = parsedData.secondaryContact.firstName;
        if (parsedData.secondaryContact.middleName) clientUpdate.secondary_middle_name = parsedData.secondaryContact.middleName;
        if (parsedData.secondaryContact.surname) clientUpdate.secondary_surname = parsedData.secondaryContact.surname;
        if (parsedData.secondaryContact.mobile) clientUpdate.secondary_mobile = parsedData.secondaryContact.mobile;
        if (parsedData.secondaryContact.email) clientUpdate.secondary_email = parsedData.secondaryContact.email;
        if (parsedData.secondaryContact.gender) clientUpdate.secondary_gender = parsedData.secondaryContact.gender;
        if (parsedData.secondaryContact.dob) clientUpdate.secondary_dob = parsedData.secondaryContact.dob;
      }

      if (parsedData.address) {
        if (parsedData.address.currentAddress) clientUpdate.current_address = parsedData.address.currentAddress;
        if (parsedData.address.country) clientUpdate.country = parsedData.address.country;
        if (parsedData.address.livingSituation) clientUpdate.living_situation = parsedData.address.livingSituation;
      }

      if (parsedData.familyRelations) {
        if (parsedData.familyRelations.maritalStatus) clientUpdate.marital_status = parsedData.familyRelations.maritalStatus;
        if (parsedData.familyRelations.dependentsCount !== undefined) clientUpdate.dependents_count = parsedData.familyRelations.dependentsCount;
      }

      if (parsedData.residentialStatus) clientUpdate.residential_status = parsedData.residentialStatus;

      if (Object.keys(clientUpdate).length > 0) {
        // Try secure Edge Function first
        const sessionToken = localStorage.getItem('session_token');
        if (sessionToken) {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('manage-client-data', {
            body: {
              session_token: sessionToken,
              operation: 'update',
              table: 'clients',
              clientId,
              data: clientUpdate,
            },
          });
          if (!fnError && fnData?.success) {
            summary.personalDetailsUpdated = true;
          } else {
            // Fallback to direct query
            const { error } = await supabase.from('clients').update(clientUpdate).eq('id', clientId);
            if (!error) summary.personalDetailsUpdated = true;
            else console.error('Error updating client details:', error);
          }
        } else {
          const { error } = await supabase.from('clients').update(clientUpdate).eq('id', clientId);
          if (!error) summary.personalDetailsUpdated = true;
          else console.error('Error updating client details:', error);
        }
      }
      setProgress(50);

      // 2. Import employment records (delete existing first to avoid duplicates)
      if (parsedData.employment && parsedData.employment.length > 0) {
        // Delete existing employment records for this client
        await supabase.from('client_employment').delete().eq('client_id', clientId);
        
        for (const emp of parsedData.employment) {
          const { error } = await supabase.from('client_employment').insert({
            client_id: clientId,
            contact_type: emp.contactType,
            employer_name: emp.employerName,
            employment_type: emp.employmentType,
            occupation_role: emp.occupationRole,
            start_date: emp.startDate,
            is_current: true
          });
          if (!error) summary.employmentRecords++;
        }
      }
      setProgress(60);

      // 3. Import income records
      if (parsedData.income && parsedData.income.length > 0) {
        await supabase.from('client_income').delete().eq('client_id', clientId);
        
        for (const inc of parsedData.income) {
          const { error } = await supabase.from('client_income').insert({
            client_id: clientId,
            contact_type: inc.contactType,
            gross_salary: inc.grossSalary || 0,
            salary_frequency: inc.salaryFrequency || 'annual',
            bonus: inc.bonus || 0,
            allowance: inc.allowance || 0,
            commission: inc.commission || 0,
            overtime_essential: inc.overtimeEssential || 0,
            overtime_non_essential: inc.overtimeNonEssential || 0,
            other_taxable_income: inc.otherTaxableIncome || 0
          });
          if (!error) summary.incomeRecords++;
        }
      }
      setProgress(70);

      // 4. Import assets
      if (parsedData.assets && parsedData.assets.length > 0) {
        await supabase.from('client_assets').delete().eq('client_id', clientId);
        
        for (const asset of parsedData.assets) {
          const { error } = await supabase.from('client_assets').insert({
            client_id: clientId,
            asset_type: asset.assetType,
            vehicle_type: asset.vehicleType,
            make_model: asset.makeModel,
            institution_name: asset.institutionName,
            description: asset.description,
            value: asset.value || 0
          });
          if (!error) summary.assetRecords++;
        }
      }
      setProgress(80);

      // 5. Import liabilities
      if (parsedData.liabilities && parsedData.liabilities.length > 0) {
        await supabase.from('client_liabilities').delete().eq('client_id', clientId);
        
        for (const liability of parsedData.liabilities) {
          const { error } = await supabase.from('client_liabilities').insert({
            client_id: clientId,
            liability_type: liability.liabilityType,
            provider_name: liability.providerName,
            current_balance: liability.currentBalance || 0,
            credit_limit: liability.creditLimit,
            interest_rate: liability.interestRate,
            monthly_repayment: liability.monthlyRepayment || 0,
            repayment_type: liability.repaymentType
          });
          if (!error) summary.liabilityRecords++;
        }
      }
      setProgress(85);

      // 6. Import properties
      if (parsedData.properties && parsedData.properties.length > 0) {
        // Delete existing properties to avoid duplicates
        await supabase.from('client_properties').delete().eq('client_id', clientId);
        
        for (const prop of parsedData.properties) {
          const { error } = await supabase.from('client_properties').insert({
            client_id: clientId,
            property_type: prop.propertyType,
            address: prop.address || 'Unknown Address',
            value: prop.value || 0,
            loan_remaining: prop.loanRemaining || 0,
            interest_rate: prop.interestRate || 0,
            ownership_percentage: prop.ownershipPercentage || 100,
            monthly_interest_repayment: prop.monthlyInterestRepayment || 0,
            monthly_body_corporate: prop.monthlyBodyCorporate || 0,
            monthly_council_rates: prop.monthlyCouncilRates || 0,
            monthly_water_rates: prop.monthlyWaterRates || 0,
            monthly_repairs_maintenance: prop.monthlyRepairsMaintenance || 0,
            monthly_property_management: prop.monthlyPropertyManagement || 0,
            monthly_landlord_insurance: prop.monthlyLandlordInsurance || 0,
            monthly_building_insurance: prop.monthlyBuildingInsurance || 0,
            monthly_rental_income: prop.monthlyRentalIncome || 0,
            weekly_rental_income: prop.weeklyRentalIncome || 0,
            total_monthly_expenditure: prop.totalMonthlyExpenditure || 0,
            net_monthly_cashflow: prop.netMonthlyCashflow || 0
          });
          if (!error) summary.propertyRecords++;
        }
      }
      setProgress(90);

      // 7. Update portfolio summary
      if (parsedData.portfolioSummary) {
        const { error } = await supabase
          .from('clients')
          .update({
            total_portfolio_value: parsedData.portfolioSummary.totalPortfolioValue,
            total_debt: parsedData.portfolioSummary.totalDebt,
            total_monthly_expenditure: parsedData.portfolioSummary.totalMonthlyExpenditure,
            total_monthly_income: parsedData.portfolioSummary.totalMonthlyIncome,
            total_monthly_rental_income: parsedData.portfolioSummary.totalMonthlyRentalIncome,
            net_monthly_cash_flow: parsedData.portfolioSummary.netMonthlyCashFlow
          })
          .eq('id', clientId);
        if (!error) summary.portfolioUpdated = true;
      }
      setProgress(95);

      // 8. Store the file in storage
      const filePath = `${clientId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('vownet-forms')
        .upload(filePath, file);

      if (!uploadError) {
        await supabase.from('client_files').insert({
          client_id: clientId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          category: 'vownet',
          document_type: 'vownet_form',
          is_vownet_form: true,
          uploaded_by: user?.id
        });
      }

      setProgress(100);
      setImportSummary(summary);
      setUploadStatus('complete');

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['client-vownet-forms', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-details', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-employment', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-income', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-assets', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-liabilities', clientId] });

      toast.success('VowNet form imported successfully');
      
      addNotification({
        type: 'vownet_form_uploaded',
        title: 'VowNet Form Imported',
        message: `Client data imported for ${clientName}`,
        entityId: clientId
      });

    } catch (error: any) {
      console.error('VowNet import error:', error);
      setErrorMessage(error.message);
      setUploadStatus('error');
      toast.error('Failed to import VowNet form: ' + error.message);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (file: { id: string; file_path: string }) => {
      // 1. Delete associated data from all related tables
      const deletePromises = [
        supabase.from('client_employment').delete().eq('client_id', clientId),
        supabase.from('client_income').delete().eq('client_id', clientId),
        supabase.from('client_assets').delete().eq('client_id', clientId),
        supabase.from('client_liabilities').delete().eq('client_id', clientId),
        supabase.from('client_properties').delete().eq('client_id', clientId),
      ];
      
      await Promise.all(deletePromises);

      // 2. Clear portfolio summary fields on client record
      await supabase
        .from('clients')
        .update({
          total_portfolio_value: null,
          total_debt: null,
          total_monthly_expenditure: null,
          total_monthly_income: null,
          total_monthly_rental_income: null,
          net_monthly_cash_flow: null,
        })
        .eq('id', clientId);

      // 3. Delete file from storage
      const { error: storageError } = await supabase.storage
        .from('vownet-forms')
        .remove([file.file_path]);

      if (storageError) console.warn('Storage delete failed:', storageError);

      // 4. Delete file record from database
      const { error: dbError } = await supabase
        .from('client_files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      // Invalidate all related queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['client-vownet-forms', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-details', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-employment', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-income', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-assets', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-liabilities', clientId] });
      toast.success('VowNet form and associated data deleted');
    },
    onError: (error: any) => {
      toast.error('Failed to delete: ' + error.message);
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processAndImportVownetForm(acceptedFiles[0]);
    }
  }, [clientId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
      'application/octet-stream': ['.xlsx', '.xls', '.xlsm', '.xlsb'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf']
    },
    disabled: uploadStatus === 'parsing' || uploadStatus === 'importing'
  });

  const downloadFile = async (file: { file_path: string; file_name: string }) => {
    const { data, error } = await supabase.storage
      .from('vownet-forms')
      .download(file.file_path);

    if (error) {
      toast.error('Failed to download file');
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resetUpload = () => {
    setUploadStatus('idle');
    setProgress(0);
    setErrorMessage(null);
    setImportSummary(null);
  };

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Upload & Import VowNet Form
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uploadStatus === 'idle' && (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
              `}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-primary" />
                  <p className="text-sm text-primary">Drop VowNet form here</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    Drag & drop VowNet form to import all client data (Excel or PDF)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Automatically populates personal details, employment, income, assets, liabilities & properties
                  </p>
                </div>
              )}
            </div>
          )}

          {(uploadStatus === 'parsing' || uploadStatus === 'importing') && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium text-sm">
                    {uploadStatus === 'parsing' ? 'Parsing VowNet form...' : 'Importing data...'}
                  </p>
                  <p className="text-xs text-muted-foreground">Please wait</p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {uploadStatus === 'complete' && importSummary && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-medium text-sm">Import Complete!</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                {importSummary.personalDetailsUpdated && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>Personal details updated</span>
                  </div>
                )}
                {importSummary.employmentRecords > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <Briefcase className="h-3 w-3 text-muted-foreground" />
                    <span>{importSummary.employmentRecords} employment record(s)</span>
                  </div>
                )}
                {importSummary.incomeRecords > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    <span>{importSummary.incomeRecords} income record(s)</span>
                  </div>
                )}
                {importSummary.assetRecords > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <PiggyBank className="h-3 w-3 text-muted-foreground" />
                    <span>{importSummary.assetRecords} asset(s)</span>
                  </div>
                )}
                {importSummary.liabilityRecords > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <CreditCard className="h-3 w-3 text-muted-foreground" />
                    <span>{importSummary.liabilityRecords} liability(s)</span>
                  </div>
                )}
                {importSummary.propertyRecords > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <span>{importSummary.propertyRecords} property(s)</span>
                  </div>
                )}
                {importSummary.portfolioUpdated && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded col-span-2">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>Portfolio summary updated</span>
                  </div>
                )}
              </div>

              <Button variant="outline" size="sm" onClick={resetUpload} className="w-full mt-2">
                <Upload className="h-4 w-4 mr-2" />
                Upload Another Form
              </Button>
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium text-sm">Import Failed</p>
                  <p className="text-xs">{errorMessage}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={resetUpload} className="w-full">
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Forms List */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Imported VowNet Forms ({vownetForms.length})
        </h4>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vownetForms.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No VowNet forms imported yet</p>
              <p className="text-xs mt-1">Upload a VowNet form to import client data</p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-4">
              {vownetForms.map((file) => (
                <Card key={file.id} className="group">
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.file_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Imported
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(file.uploaded_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => downloadFile(file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => deleteMutation.mutate(file)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
