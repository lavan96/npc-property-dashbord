import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, Mail, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { useFinanceContacts } from '@/hooks/useFinanceContacts';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationsContext';

interface ClientData {
  id: string;
  primary_first_name: string;
  primary_middle_name?: string | null;
  primary_surname: string;
  primary_mobile?: string | null;
  primary_email?: string | null;
  primary_gender?: string | null;
  primary_dob?: string | null;
  secondary_first_name?: string | null;
  secondary_middle_name?: string | null;
  secondary_surname?: string | null;
  secondary_mobile?: string | null;
  secondary_email?: string | null;
  secondary_gender?: string | null;
  secondary_dob?: string | null;
  current_address?: string | null;
  country?: string | null;
  living_situation?: string | null;
  residential_status?: string | null;
  marital_status?: string | null;
  dependents_count?: number | null;
  total_portfolio_value?: number | null;
  total_debt?: number | null;
  total_monthly_expenditure?: number | null;
  total_monthly_income?: number | null;
  total_monthly_rental_income?: number | null;
  net_monthly_cash_flow?: number | null;
}

interface PropertyData {
  property_type: string;
  address: string;
  value?: number | null;
  loan_remaining?: number | null;
  interest_rate?: number | null;
  ownership_percentage?: number | null;
  monthly_interest_repayment?: number | null;
  monthly_body_corporate?: number | null;
  monthly_council_rates?: number | null;
  monthly_water_rates?: number | null;
  monthly_repairs_maintenance?: number | null;
  monthly_property_management?: number | null;
  monthly_landlord_insurance?: number | null;
  monthly_building_insurance?: number | null;
  monthly_rental_income?: number | null;
  weekly_rental_income?: number | null;
  total_monthly_expenditure?: number | null;
  net_monthly_cashflow?: number | null;
  // SMSF-specific fields
  smsf_fund_name?: string | null;
  smsf_trustee_name?: string | null;
  smsf_trustee_type?: string | null;
  smsf_abn?: string | null;
  smsf_compliance_status?: string | null;
  smsf_auditor_name?: string | null;
}

interface EmploymentData {
  contact_type: string;
  employer_name?: string | null;
  employment_type?: string | null;
  occupation_role?: string | null;
  start_date?: string | null;
}

interface IncomeData {
  contact_type: string;
  gross_salary?: number | null;
  salary_frequency?: string | null;
  bonus?: number | null;
  allowance?: number | null;
  commission?: number | null;
  overtime_essential?: number | null;
  overtime_non_essential?: number | null;
  other_taxable_income?: number | null;
}

interface AssetData {
  asset_type: string;
  vehicle_type?: string | null;
  make_model?: string | null;
  institution_name?: string | null;
  description?: string | null;
  value?: number | null;
}

interface LiabilityData {
  liability_type: string;
  provider_name?: string | null;
  current_balance?: number | null;
  credit_limit?: number | null;
  interest_rate?: number | null;
  monthly_repayment?: number | null;
  repayment_type?: string | null;
}

export interface VownetPDFData {
  client: ClientData;
  properties: PropertyData[];
  employment?: EmploymentData[];
  income?: IncomeData[];
  assets?: AssetData[];
  liabilities?: LiabilityData[];
}

interface VownetPDFGeneratorProps {
  data: VownetPDFData;
  clientName: string;
  onEmailClick?: (pdfBlob: Blob, fileName: string) => void;
  onQuickSendComplete?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  buttonLabel?: string;
}

// Helper functions
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return '$' + value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return value + '%';
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU');
  } catch {
    return dateStr;
  }
};

export function VownetPDFGenerator({ 
  data, 
  clientName,
  onEmailClick,
  onQuickSendComplete,
  variant = 'outline',
  size = 'sm',
  buttonLabel = 'Send to Finance'
}: VownetPDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { contacts, defaultContact, hasContacts } = useFinanceContacts();
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const generatePDF = async (forEmail: boolean = false): Promise<Blob | null> => {
    setIsGenerating(true);
    
    try {
      // Create hidden container for rendering
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm';
      document.body.appendChild(container);

      // Generate HTML content
      const htmlContent = generateHTMLContent(data);
      container.innerHTML = htmlContent;

      // Wait for styles to apply
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pages = container.querySelectorAll('.page');
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 794, // A4 width in pixels at 96dpi
          height: 1123, // A4 height in pixels at 96dpi
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      // Cleanup
      document.body.removeChild(container);

      const fileName = `Vownet_Form_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      if (forEmail) {
        const pdfBlob = pdf.output('blob');
        return pdfBlob;
      } else {
        // Download directly
        pdf.save(fileName);
        toast.success('Vownet PDF generated successfully');
        return null;
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    await generatePDF(false);
  };

  const handleEmailSend = async () => {
    const pdfBlob = await generatePDF(true);
    if (pdfBlob && onEmailClick) {
      const fileName = `Vownet_Form_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      onEmailClick(pdfBlob, fileName);
    }
  };

  const handleQuickSend = async (contactId?: string) => {
    if (!hasContacts) {
      toast.error('No finance contacts configured. Add contacts in Settings → Finance Agent Contacts.');
      return;
    }

    const targetContact = contactId 
      ? contacts.find(c => c.id === contactId) 
      : defaultContact;

    if (!targetContact) {
      toast.error('No finance contact selected');
      return;
    }

    setIsSending(true);
    
    try {
      const pdfBlob = await generatePDF(true);
      if (!pdfBlob) {
        throw new Error('Failed to generate PDF');
      }

      const fileName = `Vownet_Form_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(pdfBlob);
      const base64Data = await base64Promise;

      // Get user's mailbox for sending
      const { data: userData } = await supabase
        .from('custom_users')
        .select('personal_mailbox')
        .eq('id', user?.id)
        .single();

      if (!userData?.personal_mailbox) {
        toast.error('Please configure your personal mailbox in Settings first');
        return;
      }

      // Send email via edge function
      const { error } = await supabase.functions.invoke('send-email-reply', {
        body: {
          to: targetContact.email,
          subject: `Vownet Form - ${clientName}`,
          body: `Hi ${targetContact.name.split(' ')[0]},\n\nPlease find attached the Vownet form for ${clientName}.\n\nKind regards`,
          senderMailbox: userData.personal_mailbox,
          attachments: [{
            name: fileName,
            content: base64Data,
            contentType: 'application/pdf',
          }],
        }
      });

      if (error) throw error;

      toast.success(`Vownet form sent to ${targetContact.name}`);
      
      addNotification({
        type: 'finance_agent_notified',
        title: 'Finance Agent Notified',
        message: `Vownet form for ${clientName} sent to ${targetContact.name}`,
        entityId: data.client.id
      });
      
      onQuickSendComplete?.();
      
    } catch (error: any) {
      console.error('Quick send error:', error);
      toast.error('Failed to send: ' + error.message);
    } finally {
      setIsSending(false);
    }
  };

  const isDisabled = isGenerating || isSending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isDisabled}>
          {isDisabled ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          {isSending ? 'Sending...' : buttonLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleDownload} disabled={isDisabled}>
          <Download className="h-4 w-4 mr-2" />
          Export VowNet as PDF
        </DropdownMenuItem>
        {onEmailClick && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleEmailSend} disabled={isDisabled}>
              <Mail className="h-4 w-4 mr-2" />
              Compose Email with PDF
            </DropdownMenuItem>
            {hasContacts ? (
              contacts.length === 1 ? (
                <DropdownMenuItem onClick={() => handleQuickSend()} disabled={isDisabled}>
                  <Send className="h-4 w-4 mr-2" />
                  Quick Send to {defaultContact?.name}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isDisabled}>
                    <Send className="h-4 w-4 mr-2" />
                    Quick Send to Finance
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {contacts.map((contact) => (
                      <DropdownMenuItem 
                        key={contact.id}
                        onClick={() => handleQuickSend(contact.id)}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {contact.name}
                        {contact.is_default && (
                          <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            ) : (
              <DropdownMenuItem disabled className="text-muted-foreground">
                <Send className="h-4 w-4 mr-2" />
                No finance contacts configured
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// NPC Brand Colors
const NPC_COLORS = {
  gold: '#c9a227',
  goldLight: '#e8d59d',
  goldDark: '#a88520',
  darkBlue: '#113361',
  black: '#0a0a0a',
  darkGray: '#2d3748',
  lightGray: '#f7fafc',
  white: '#ffffff',
  success: '#16a34a',
  danger: '#dc2626',
};

// Generate the full HTML content for the PDF
function generateHTMLContent(data: VownetPDFData): string {
  const { client, properties, employment = [], income = [], assets = [], liabilities = [] } = data;
  const reportDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });
  
  // Find owner occupied property
  const ownerOccupied = properties.find(p => p.property_type === 'owner_occupied');
  const investmentProperties = properties.filter(p => p.property_type === 'investment');
  const smsfProperties = properties.filter(p => p.property_type === 'smsf');
  
  // Helper to format SMSF compliance status
  const formatComplianceStatus = (status: string | null | undefined): string => {
    if (!status) return '-';
    switch (status) {
      case 'compliant': return '✓ Compliant';
      case 'non_compliant': return '✗ Non-Compliant';
      case 'pending_audit': return '⏳ Pending Audit';
      default: return status;
    }
  };

  // Helper to format trustee type
  const formatTrusteeType = (type: string | null | undefined): string => {
    if (!type) return '-';
    return type === 'corporate' ? 'Corporate Trustee' : 'Individual Trustee';
  };

  // Generate investment properties HTML - with NPC branding
  const investmentPropertiesHTML = investmentProperties.map((prop, index) => `
    <div class="section">
      <div class="section-header">Investment Property ${index + 1}</div>
      <table class="data-table">
        <tr><td class="label">Address</td><td class="value">${prop.address || '-'}</td></tr>
        <tr><td class="label">Value</td><td class="value currency">${formatCurrency(prop.value)}</td></tr>
        <tr><td class="label">Loan Remaining ($)</td><td class="value currency">${formatCurrency(prop.loan_remaining)}</td></tr>
        <tr><td class="label">Interest Rate (%)</td><td class="value percent">${formatPercent(prop.interest_rate)}</td></tr>
        <tr><td class="label">Ownership (%)</td><td class="value percent">${formatPercent(prop.ownership_percentage)}</td></tr>
        <tr><td class="label">Monthly Interest Repayment</td><td class="value currency">${formatCurrency(prop.monthly_interest_repayment)}</td></tr>
        <tr><td class="label">Monthly Body Corporate</td><td class="value currency">${formatCurrency(prop.monthly_body_corporate)}</td></tr>
        <tr><td class="label">Monthly Council Rates</td><td class="value currency">${formatCurrency(prop.monthly_council_rates)}</td></tr>
        <tr><td class="label">Monthly Water Rates</td><td class="value currency">${formatCurrency(prop.monthly_water_rates)}</td></tr>
        <tr><td class="label">Monthly Repairs & Maintenance</td><td class="value currency">${formatCurrency(prop.monthly_repairs_maintenance)}</td></tr>
        <tr><td class="label">Monthly Property Management</td><td class="value currency">${formatCurrency(prop.monthly_property_management)}</td></tr>
        <tr><td class="label">Monthly Landlord Insurance</td><td class="value currency">${formatCurrency(prop.monthly_landlord_insurance)}</td></tr>
        <tr><td class="label">Monthly Building Insurance</td><td class="value currency">${formatCurrency(prop.monthly_building_insurance)}</td></tr>
        <tr><td class="label">Total Monthly Expenditure</td><td class="value currency">${formatCurrency(prop.total_monthly_expenditure)}</td></tr>
        <tr><td class="label">Weekly Rental Income</td><td class="value currency">${formatCurrency(prop.weekly_rental_income)}</td></tr>
        <tr><td class="label">Monthly Rental Income</td><td class="value currency">${formatCurrency(prop.monthly_rental_income)}</td></tr>
        <tr><td class="label font-bold">Net Monthly Cashflow</td><td class="value currency font-bold ${(prop.net_monthly_cashflow || 0) >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(prop.net_monthly_cashflow)}</td></tr>
      </table>
    </div>
  `).join('');

  // Generate SMSF properties HTML - with NPC branding
  const smsfPropertiesHTML = smsfProperties.map((prop, index) => `
    <div class="section">
      <div class="section-header gold">SMSF Property ${index + 1}</div>
      
      <!-- SMSF Fund Details -->
      <div class="subsection-header">Fund Details & Compliance</div>
      <table class="data-table">
        <tr><td class="label">Fund Name</td><td class="value">${prop.smsf_fund_name || '-'}</td></tr>
        <tr><td class="label">ABN</td><td class="value">${prop.smsf_abn || '-'}</td></tr>
        <tr><td class="label">Trustee Name</td><td class="value">${prop.smsf_trustee_name || '-'}</td></tr>
        <tr><td class="label">Trustee Type</td><td class="value">${formatTrusteeType(prop.smsf_trustee_type)}</td></tr>
        <tr><td class="label">Compliance Status</td><td class="value" style="font-weight: 600; color: ${prop.smsf_compliance_status === 'compliant' ? NPC_COLORS.success : prop.smsf_compliance_status === 'non_compliant' ? NPC_COLORS.danger : NPC_COLORS.gold};">${formatComplianceStatus(prop.smsf_compliance_status)}</td></tr>
        <tr><td class="label">Auditor</td><td class="value">${prop.smsf_auditor_name || '-'}</td></tr>
      </table>

      <!-- Property Details -->
      <div class="subsection-header">Property Details</div>
      <table class="data-table">
        <tr><td class="label">Address</td><td class="value">${prop.address || '-'}</td></tr>
        <tr><td class="label">Value</td><td class="value currency">${formatCurrency(prop.value)}</td></tr>
        <tr><td class="label">Loan Remaining ($)</td><td class="value currency">${formatCurrency(prop.loan_remaining)}</td></tr>
        <tr><td class="label">Interest Rate (%)</td><td class="value percent">${formatPercent(prop.interest_rate)}</td></tr>
        <tr><td class="label">Ownership (%)</td><td class="value percent">${formatPercent(prop.ownership_percentage)}</td></tr>
        <tr><td class="label">Monthly Interest Repayment</td><td class="value currency">${formatCurrency(prop.monthly_interest_repayment)}</td></tr>
        <tr><td class="label">Monthly Body Corporate</td><td class="value currency">${formatCurrency(prop.monthly_body_corporate)}</td></tr>
        <tr><td class="label">Monthly Council Rates</td><td class="value currency">${formatCurrency(prop.monthly_council_rates)}</td></tr>
        <tr><td class="label">Monthly Water Rates</td><td class="value currency">${formatCurrency(prop.monthly_water_rates)}</td></tr>
        <tr><td class="label">Monthly Repairs & Maintenance</td><td class="value currency">${formatCurrency(prop.monthly_repairs_maintenance)}</td></tr>
        <tr><td class="label">Monthly Property Management</td><td class="value currency">${formatCurrency(prop.monthly_property_management)}</td></tr>
        <tr><td class="label">Monthly Landlord Insurance</td><td class="value currency">${formatCurrency(prop.monthly_landlord_insurance)}</td></tr>
        <tr><td class="label">Monthly Building Insurance</td><td class="value currency">${formatCurrency(prop.monthly_building_insurance)}</td></tr>
        <tr><td class="label">Total Monthly Expenditure</td><td class="value currency">${formatCurrency(prop.total_monthly_expenditure)}</td></tr>
        <tr><td class="label">Weekly Rental Income</td><td class="value currency">${formatCurrency(prop.weekly_rental_income)}</td></tr>
        <tr><td class="label">Monthly Rental Income</td><td class="value currency">${formatCurrency(prop.monthly_rental_income)}</td></tr>
        <tr><td class="label font-bold">Net Monthly Cashflow</td><td class="value currency font-bold ${(prop.net_monthly_cashflow || 0) >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(prop.net_monthly_cashflow)}</td></tr>
      </table>
    </div>
  `).join('');

  // Employment tables
  const primaryEmployment = employment.filter(e => e.contact_type === 'primary');
  const secondaryEmployment = employment.filter(e => e.contact_type === 'secondary');
  
  const generateEmploymentTable = (empList: EmploymentData[]) => {
    if (empList.length === 0) return '<p style="padding: 2mm; color: #666;">No employment records</p>';
    return empList.map(emp => `
      <table class="data-table" style="margin-bottom: 2mm;">
        <tr><td class="label">Employer</td><td class="value">${emp.employer_name || '-'}</td></tr>
        <tr><td class="label">Employment Type</td><td class="value">${emp.employment_type || '-'}</td></tr>
        <tr><td class="label">Role</td><td class="value">${emp.occupation_role || '-'}</td></tr>
        <tr><td class="label">Start Date</td><td class="value">${formatDate(emp.start_date)}</td></tr>
      </table>
    `).join('');
  };

  // Income tables
  const primaryIncome = income.find(i => i.contact_type === 'primary');
  const secondaryIncome = income.find(i => i.contact_type === 'secondary');
  
  const generateIncomeTable = (inc: IncomeData | undefined) => {
    if (!inc) return '<p style="padding: 2mm; color: #666;">No income records</p>';
    return `
      <table class="data-table">
        <tr><td class="label">Gross Salary</td><td class="value currency">${formatCurrency(inc.gross_salary)}</td></tr>
        <tr><td class="label">Salary Frequency</td><td class="value">${inc.salary_frequency || '-'}</td></tr>
        <tr><td class="label">Bonus</td><td class="value currency">${formatCurrency(inc.bonus)}</td></tr>
        <tr><td class="label">Allowance</td><td class="value currency">${formatCurrency(inc.allowance)}</td></tr>
        <tr><td class="label">Commission</td><td class="value currency">${formatCurrency(inc.commission)}</td></tr>
        <tr><td class="label">Overtime (Essential)</td><td class="value currency">${formatCurrency(inc.overtime_essential)}</td></tr>
        <tr><td class="label">Overtime (Non-Essential)</td><td class="value currency">${formatCurrency(inc.overtime_non_essential)}</td></tr>
        <tr><td class="label">Other Taxable Income</td><td class="value currency">${formatCurrency(inc.other_taxable_income)}</td></tr>
      </table>
    `;
  };

  // Assets table
  const generateAssetsTable = () => {
    if (assets.length === 0) return '<p style="padding: 2mm; color: #666;">No assets recorded</p>';
    
    const assetsByType: Record<string, AssetData[]> = {};
    assets.forEach(asset => {
      const type = asset.asset_type || 'Other';
      if (!assetsByType[type]) assetsByType[type] = [];
      assetsByType[type].push(asset);
    });
    
    return Object.entries(assetsByType).map(([type, assetList]) => `
      <div class="subsection-header">${type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
      <table class="data-table">
        ${assetList.map(asset => `
          <tr>
            <td class="label">${asset.description || asset.make_model || asset.institution_name || type}</td>
            <td class="value currency">${formatCurrency(asset.value)}</td>
          </tr>
        `).join('')}
      </table>
    `).join('');
  };

  // Liabilities table
  const generateLiabilitiesTable = () => {
    if (liabilities.length === 0) return '<p style="padding: 2mm; color: #666;">No liabilities recorded</p>';
    
    const liabsByType: Record<string, LiabilityData[]> = {};
    liabilities.forEach(liab => {
      const type = liab.liability_type || 'Other';
      if (!liabsByType[type]) liabsByType[type] = [];
      liabsByType[type].push(liab);
    });
    
    return Object.entries(liabsByType).map(([type, liabList]) => `
      <div class="subsection-header">${type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
      <table class="data-table">
        <tr>
          <th>Provider</th>
          <th>Balance</th>
          <th>Repayment</th>
        </tr>
        ${liabList.map(liab => `
          <tr>
            <td class="value">${liab.provider_name || '-'}</td>
            <td class="value currency">${formatCurrency(liab.current_balance)}</td>
            <td class="value currency">${formatCurrency(liab.monthly_repayment)}/mo</td>
          </tr>
        `).join('')}
      </table>
    `).join('');
  };

  // Properties summary rows
  const propertiesSummaryRows = properties.map(prop => `
    <tr>
      <td>${prop.address?.substring(0, 30) || '-'}${(prop.address?.length || 0) > 30 ? '...' : ''}</td>
      <td class="text-right">${formatCurrency(prop.value)}</td>
      <td class="text-right">${formatCurrency(prop.loan_remaining)}</td>
      <td class="text-right">${formatCurrency(prop.monthly_rental_income)}</td>
      <td class="text-right ${(prop.net_monthly_cashflow || 0) >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(prop.net_monthly_cashflow)}</td>
    </tr>
  `).join('');

  // Calculate totals
  const totalValue = properties.reduce((sum, p) => sum + (p.value || 0), 0);
  const totalLoans = properties.reduce((sum, p) => sum + (p.loan_remaining || 0), 0);
  const totalRental = properties.reduce((sum, p) => sum + (p.monthly_rental_income || 0), 0);
  const totalNetCF = properties.reduce((sum, p) => sum + (p.net_monthly_cashflow || 0), 0);

  const clientFullName = `${client.primary_first_name} ${client.primary_surname}${client.secondary_first_name ? ` & ${client.secondary_first_name} ${client.secondary_surname || client.primary_surname}` : ''}`;
  const equity = (client.total_portfolio_value || 0) - (client.total_debt || 0);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: ${NPC_COLORS.black}; background: ${NPC_COLORS.white}; }
        
        /* Page Layout */
        .page { width: 794px; height: 1123px; background: ${NPC_COLORS.white}; position: relative; overflow: hidden; }
        .page-content { padding: 30px 40px; padding-top: 90px; }
        
        /* Cover Page */
        .cover-page { background: linear-gradient(135deg, ${NPC_COLORS.black} 0%, ${NPC_COLORS.darkBlue} 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
        .cover-corner { position: absolute; width: 100px; height: 100px; }
        .cover-corner-tl { top: 0; left: 0; border-top: 3px solid ${NPC_COLORS.gold}; border-left: 3px solid ${NPC_COLORS.gold}; }
        .cover-corner-tr { top: 0; right: 0; border-top: 3px solid ${NPC_COLORS.gold}; border-right: 3px solid ${NPC_COLORS.gold}; }
        .cover-corner-bl { bottom: 0; left: 0; border-bottom: 3px solid ${NPC_COLORS.gold}; border-left: 3px solid ${NPC_COLORS.gold}; }
        .cover-corner-br { bottom: 0; right: 0; border-bottom: 3px solid ${NPC_COLORS.gold}; border-right: 3px solid ${NPC_COLORS.gold}; }
        
        .cover-logo { margin-bottom: 60px; }
        .logo-n { font-family: 'Playfair Display', Georgia, serif; font-size: 72pt; font-weight: 700; color: ${NPC_COLORS.gold}; letter-spacing: 8px; }
        .cover-company { color: ${NPC_COLORS.white}; font-size: 16pt; font-weight: 600; letter-spacing: 6px; margin-bottom: 8px; }
        .cover-tagline { color: ${NPC_COLORS.goldLight}; font-size: 10pt; letter-spacing: 3px; margin-bottom: 80px; }
        .cover-divider { width: 150px; height: 2px; background: ${NPC_COLORS.gold}; margin: 0 auto 40px; }
        .cover-doc-title { color: ${NPC_COLORS.white}; font-family: 'Playfair Display', Georgia, serif; font-size: 28pt; font-weight: 600; margin-bottom: 20px; }
        .cover-client-name { color: ${NPC_COLORS.gold}; font-size: 18pt; font-weight: 500; margin-bottom: 60px; }
        .cover-date { color: ${NPC_COLORS.goldLight}; font-size: 11pt; letter-spacing: 2px; }
        
        /* Page Header */
        .page-header { position: absolute; top: 0; left: 0; right: 0; height: 70px; background: ${NPC_COLORS.darkBlue}; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; }
        .page-header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: ${NPC_COLORS.gold}; }
        .header-logo { color: ${NPC_COLORS.gold}; font-family: 'Playfair Display', Georgia, serif; font-size: 24pt; font-weight: 700; }
        .header-title-group { text-align: right; }
        .header-title { color: ${NPC_COLORS.white}; font-size: 12pt; font-weight: 600; }
        .header-subtitle { color: ${NPC_COLORS.goldLight}; font-size: 8pt; letter-spacing: 1px; }
        
        /* Page Footer */
        .page-footer { position: absolute; bottom: 0; left: 0; right: 0; height: 45px; background: ${NPC_COLORS.lightGray}; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; font-size: 7pt; color: #718096; }
        .footer-contact { display: flex; gap: 20px; }
        .footer-item { display: flex; align-items: center; gap: 4px; }
        
        /* Section Headers - NPC Gold Theme */
        .section { margin-bottom: 14px; }
        .section-header { 
          background: linear-gradient(135deg, ${NPC_COLORS.darkBlue} 0%, ${NPC_COLORS.darkGray} 100%); 
          color: ${NPC_COLORS.white}; 
          padding: 8px 12px; 
          font-size: 9pt; 
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-header::before { content: ''; width: 4px; height: 16px; background: ${NPC_COLORS.gold}; border-radius: 2px; }
        .section-header.gold { background: linear-gradient(135deg, ${NPC_COLORS.gold} 0%, ${NPC_COLORS.goldDark} 100%); color: ${NPC_COLORS.black}; }
        .section-header.gold::before { background: ${NPC_COLORS.white}; }
        
        .subsection-header { 
          background: linear-gradient(90deg, ${NPC_COLORS.goldLight} 0%, #f5ecd5 100%); 
          color: ${NPC_COLORS.darkGray}; 
          padding: 6px 12px; 
          font-size: 8pt; 
          font-weight: 600;
          border-left: 3px solid ${NPC_COLORS.gold};
        }
        
        /* Two Column Layout */
        .two-columns { display: flex; gap: 24px; }
        .column { flex: 1; }
        .column-left { flex: 0.95; }
        .column-right { flex: 1.05; }
        
        /* Data Tables - Refined */
        .data-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
        .data-table th { 
          background: linear-gradient(180deg, ${NPC_COLORS.darkGray} 0%, #1a202c 100%); 
          color: ${NPC_COLORS.white};
          border: 1px solid #4a5568; 
          padding: 6px 8px; 
          text-align: left; 
          font-weight: 600; 
        }
        .data-table td { border: 1px solid #e2e8f0; padding: 5px 8px; }
        .data-table .label { 
          background: linear-gradient(90deg, ${NPC_COLORS.lightGray} 0%, #edf2f7 100%); 
          font-weight: 500; 
          width: 45%; 
          color: #4a5568; 
        }
        .data-table .value { background: ${NPC_COLORS.white}; color: ${NPC_COLORS.black}; }
        .data-table .currency { text-align: right; font-family: 'Inter', monospace; }
        .data-table .percent { text-align: right; }
        
        /* Summary Box - Gold Accent */
        .summary-box { 
          border: 2px solid ${NPC_COLORS.gold}; 
          background: linear-gradient(135deg, #fffef7 0%, #fefcf3 100%);
          padding: 16px; 
          margin-top: 16px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(201, 162, 39, 0.15);
        }
        .summary-title { 
          font-weight: 700; 
          color: ${NPC_COLORS.darkBlue}; 
          margin-bottom: 12px; 
          font-size: 11pt; 
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .summary-title::before { content: '◆'; color: ${NPC_COLORS.gold}; font-size: 8pt; }
        
        /* Financial Table */
        .financial-table { width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid #e2e8f0; }
        .financial-table th { 
          background: linear-gradient(180deg, ${NPC_COLORS.darkBlue} 0%, #0d264d 100%); 
          color: ${NPC_COLORS.white}; 
          padding: 8px; 
          text-align: left;
          font-weight: 600;
        }
        .financial-table td { border: 1px solid #e2e8f0; padding: 6px 8px; }
        .financial-table tbody tr:nth-child(even) { background: ${NPC_COLORS.lightGray}; }
        .financial-table .total-row { 
          background: linear-gradient(90deg, ${NPC_COLORS.goldLight} 0%, #f5ecd5 100%) !important; 
          font-weight: 700; 
        }
        .financial-table .total-row td { border-top: 2px solid ${NPC_COLORS.gold}; }
        
        /* KPI Cards */
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .kpi-card { 
          background: linear-gradient(135deg, ${NPC_COLORS.white} 0%, ${NPC_COLORS.lightGray} 100%);
          border: 1px solid #e2e8f0;
          border-left: 4px solid ${NPC_COLORS.gold};
          padding: 12px;
          border-radius: 4px;
        }
        .kpi-label { font-size: 7pt; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .kpi-value { font-size: 14pt; font-weight: 700; color: ${NPC_COLORS.darkBlue}; }
        .kpi-value.positive { color: ${NPC_COLORS.success}; }
        .kpi-value.negative { color: ${NPC_COLORS.danger}; }
        
        /* Utility Classes */
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .text-green { color: ${NPC_COLORS.success}; }
        .text-red { color: ${NPC_COLORS.danger}; }
        .mt-2 { margin-top: 12px; }
      </style>
    </head>
    <body>
      <!-- COVER PAGE -->
      <div class="page cover-page">
        <div class="cover-corner cover-corner-tl"></div>
        <div class="cover-corner cover-corner-tr"></div>
        <div class="cover-corner cover-corner-bl"></div>
        <div class="cover-corner cover-corner-br"></div>
        
        <div class="cover-logo">
          <div class="logo-n">N</div>
        </div>
        <div class="cover-company">NAIDU PROPERTY CONSULTING</div>
        <div class="cover-tagline">YOUR DEDICATED PROPERTY PARTNER</div>
        
        <div class="cover-divider"></div>
        
        <div class="cover-doc-title">Client Portfolio Form</div>
        <div class="cover-client-name">${clientFullName}</div>
        
        <div class="cover-date">${reportDate}</div>
      </div>
      
      <!-- PAGE 1: Personal Details & Properties -->
      <div class="page">
        <div class="page-header">
          <div class="header-logo">N</div>
          <div class="header-title-group">
            <div class="header-title">Personal Details</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns">
            <div class="column column-left">
              <div class="section">
                <div class="section-header gold">Primary Contact</div>
                <table class="data-table">
                  <tr><td class="label">First name</td><td class="value">${client.primary_first_name || '-'}</td></tr>
                  <tr><td class="label">Middle name</td><td class="value">${client.primary_middle_name || '-'}</td></tr>
                  <tr><td class="label">Surname</td><td class="value">${client.primary_surname || '-'}</td></tr>
                  <tr><td class="label">Mobile</td><td class="value">${client.primary_mobile || '-'}</td></tr>
                  <tr><td class="label">Email</td><td class="value">${client.primary_email || '-'}</td></tr>
                  <tr><td class="label">Gender</td><td class="value">${client.primary_gender || '-'}</td></tr>
                  <tr><td class="label">Date of Birth</td><td class="value">${formatDate(client.primary_dob)}</td></tr>
                </table>
              </div>
              <div class="section">
                <div class="section-header">Secondary Contact</div>
                <table class="data-table">
                  <tr><td class="label">First name</td><td class="value">${client.secondary_first_name || '-'}</td></tr>
                  <tr><td class="label">Middle name</td><td class="value">${client.secondary_middle_name || '-'}</td></tr>
                  <tr><td class="label">Surname</td><td class="value">${client.secondary_surname || '-'}</td></tr>
                  <tr><td class="label">Mobile</td><td class="value">${client.secondary_mobile || '-'}</td></tr>
                  <tr><td class="label">Email</td><td class="value">${client.secondary_email || '-'}</td></tr>
                  <tr><td class="label">Gender</td><td class="value">${client.secondary_gender || '-'}</td></tr>
                  <tr><td class="label">Date of Birth</td><td class="value">${formatDate(client.secondary_dob)}</td></tr>
                </table>
              </div>
              <div class="section">
                <div class="section-header">Address & Status</div>
                <table class="data-table">
                  <tr><td class="label">Current address</td><td class="value">${client.current_address || '-'}</td></tr>
                  <tr><td class="label">Country</td><td class="value">${client.country || 'Australia'}</td></tr>
                  <tr><td class="label">Living Situation</td><td class="value">${client.living_situation || '-'}</td></tr>
                  <tr><td class="label">Residential status</td><td class="value">${client.residential_status || '-'}</td></tr>
                  <tr><td class="label">Marital status</td><td class="value">${client.marital_status || '-'}</td></tr>
                  <tr><td class="label">Number of dependents</td><td class="value">${client.dependents_count ?? 0}</td></tr>
                </table>
              </div>
            </div>
            <div class="column column-right">
              <div class="section">
                <div class="section-header gold">Property (Owner Occupied)</div>
                <table class="data-table">
                  <tr><td class="label">Address</td><td class="value">${ownerOccupied?.address || '-'}</td></tr>
                  <tr><td class="label">Value</td><td class="value currency">${formatCurrency(ownerOccupied?.value)}</td></tr>
                  <tr><td class="label">Loan Remaining ($)</td><td class="value currency">${formatCurrency(ownerOccupied?.loan_remaining)}</td></tr>
                  <tr><td class="label">Interest Rate (%)</td><td class="value percent">${formatPercent(ownerOccupied?.interest_rate)}</td></tr>
                  <tr><td class="label">Ownership (%)</td><td class="value percent">${formatPercent(ownerOccupied?.ownership_percentage)}</td></tr>
                  <tr><td class="label">Monthly Interest Repayment</td><td class="value currency">${formatCurrency(ownerOccupied?.monthly_interest_repayment)}</td></tr>
                  <tr><td class="label">Net Monthly Cashflow</td><td class="value currency">${formatCurrency(ownerOccupied?.net_monthly_cashflow)}</td></tr>
                </table>
              </div>
              ${investmentPropertiesHTML}
              ${smsfPropertiesHTML}
            </div>
          </div>
        </div>
        <div class="page-footer">
          <div class="footer-contact">
            <span class="footer-item">📞 (02) 8609 3299</span>
            <span class="footer-item">✉ admin@npcservices.com.au</span>
            <span class="footer-item">🌐 npcservices.com.au</span>
          </div>
          <div>Page 1 of 4</div>
        </div>
      </div>
      
      <!-- PAGE 2: Employment & Income -->
      <div class="page">
        <div class="page-header">
          <div class="header-logo">N</div>
          <div class="header-title-group">
            <div class="header-title">Employment & Income</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns">
            <div class="column">
              <div class="section">
                <div class="section-header gold">Primary Contact - Employment</div>
                ${generateEmploymentTable(primaryEmployment)}
              </div>
              <div class="section">
                <div class="section-header">Secondary Contact - Employment</div>
                ${generateEmploymentTable(secondaryEmployment)}
              </div>
            </div>
            <div class="column">
              <div class="section">
                <div class="section-header gold">Primary Contact - Income</div>
                ${generateIncomeTable(primaryIncome)}
              </div>
              <div class="section">
                <div class="section-header">Secondary Contact - Income</div>
                ${generateIncomeTable(secondaryIncome)}
              </div>
            </div>
          </div>
        </div>
        <div class="page-footer">
          <div class="footer-contact">
            <span class="footer-item">📞 (02) 8609 3299</span>
            <span class="footer-item">✉ admin@npcservices.com.au</span>
            <span class="footer-item">🌐 npcservices.com.au</span>
          </div>
          <div>Page 2 of 4</div>
        </div>
      </div>
      
      <!-- PAGE 3: Assets & Liabilities -->
      <div class="page">
        <div class="page-header">
          <div class="header-logo">N</div>
          <div class="header-title-group">
            <div class="header-title">Assets & Liabilities</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns">
            <div class="column">
              <div class="section">
                <div class="section-header gold">Assets</div>
                ${generateAssetsTable()}
              </div>
            </div>
            <div class="column">
              <div class="section">
                <div class="section-header">Liabilities</div>
                ${generateLiabilitiesTable()}
              </div>
            </div>
          </div>
        </div>
        <div class="page-footer">
          <div class="footer-contact">
            <span class="footer-item">📞 (02) 8609 3299</span>
            <span class="footer-item">✉ admin@npcservices.com.au</span>
            <span class="footer-item">🌐 npcservices.com.au</span>
          </div>
          <div>Page 3 of 4</div>
        </div>
      </div>
      
      <!-- PAGE 4: Portfolio Summary -->
      <div class="page">
        <div class="page-header">
          <div class="header-logo">N</div>
          <div class="header-title-group">
            <div class="header-title">Portfolio Summary</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <!-- KPI Cards -->
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Total Portfolio Value</div>
              <div class="kpi-value">${formatCurrency(client.total_portfolio_value)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Debt</div>
              <div class="kpi-value">${formatCurrency(client.total_debt)}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Portfolio Equity</div>
              <div class="kpi-value ${equity >= 0 ? 'positive' : 'negative'}">${formatCurrency(equity)}</div>
            </div>
          </div>
          
          <div class="summary-box">
            <div class="summary-title">Monthly Cashflow Analysis</div>
            <table class="data-table">
              <tr><td class="label">Total Monthly Income</td><td class="value currency">${formatCurrency(client.total_monthly_income)}</td></tr>
              <tr><td class="label">Total Monthly Rental Income</td><td class="value currency">${formatCurrency(client.total_monthly_rental_income)}</td></tr>
              <tr><td class="label">Total Monthly Expenditure</td><td class="value currency">${formatCurrency(client.total_monthly_expenditure)}</td></tr>
              <tr><td class="label font-bold">Net Monthly Cash Flow</td><td class="value currency font-bold ${(client.net_monthly_cash_flow || 0) >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(client.net_monthly_cash_flow)}</td></tr>
            </table>
          </div>
          
          <div class="section mt-2">
            <div class="section-header gold">Properties Overview</div>
            <table class="financial-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th class="text-right">Value</th>
                  <th class="text-right">Loan</th>
                  <th class="text-right">Rental</th>
                  <th class="text-right">Net CF</th>
                </tr>
              </thead>
              <tbody>
                ${propertiesSummaryRows}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td><strong>TOTAL</strong></td>
                  <td class="text-right">${formatCurrency(totalValue)}</td>
                  <td class="text-right">${formatCurrency(totalLoans)}</td>
                  <td class="text-right">${formatCurrency(totalRental)}</td>
                  <td class="text-right ${totalNetCF >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(totalNetCF)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div class="page-footer">
          <div class="footer-contact">
            <span class="footer-item">📞 (02) 8609 3299</span>
            <span class="footer-item">✉ admin@npcservices.com.au</span>
            <span class="footer-item">🌐 npcservices.com.au</span>
          </div>
          <div>Page 4 of 4</div>
        </div>
      </div>
    </body>
    </html>
  `;
}
