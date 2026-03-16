import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Home, Loader2, Mail, Send, Users, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { secureStorageUpload } from '@/hooks/useSecureStorage';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { drawBorrowingCapacitySections, transformAssessmentToSectionData } from '@/utils/borrowingCapacityPdfSections';
import { fetchLatestBorrowingCapacity } from '@/lib/fetchLatestBorrowingCapacity';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  // Loan repayment & lender fields
  loan_repayment_amount?: number | null;
  loan_repayment_frequency?: string | null;
  lender_name?: string | null;
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
  // Format interest rates properly (e.g., 5.9 -> 5.9%, not 250%)
  return value.toFixed(1) + '%';
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU');
  } catch {
    return dateStr;
  }
};

// Helper to properly capitalize names
const properCase = (str: string | null | undefined): string => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
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
  const [includeOwnerOccupied, setIncludeOwnerOccupied] = useState(true);
  const [includeBorrowingCapacity, setIncludeBorrowingCapacity] = useState(false);
  const { contacts, defaultContact, hasContacts } = useFinanceContacts();
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // Persist Vownet PDF to storage + client_files in background
  const persistVownetPdf = async (blob: Blob, fileName: string, clientIdVal: string) => {
    try {
      const storagePath = `vownet-forms/${clientIdVal}/${fileName}`;
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const uploadedPath = await secureStorageUpload('client-files', storagePath, file);

      if (uploadedPath) {
        await invokeSecureFunction('manage-client-data', {
          operation: 'create',
          table: 'client_files',
          clientId: clientIdVal,
          data: {
            category: 'vownet',
            file_name: fileName,
            file_path: uploadedPath,
            file_type: 'application/pdf',
            file_size: blob.size,
            is_vownet_form: true,
            description: `Client Details Form - ${new Date().toLocaleDateString('en-AU')}`,
          },
        });
        console.log('✓ Vownet PDF persisted to storage + client_files');
      }
    } catch (err) {
      console.error('Failed to persist Vownet PDF:', err);
      // Non-blocking — the user already has their download
    }
  };

  // Helper: preload an image and convert to data URL for html2canvas compatibility
  // Adds timeout + content-type validation to avoid indefinite hangs.
  const preloadImageAsDataUrl = async (src: string, timeoutMs = 5000): Promise<string | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(src, { signal: controller.signal });
      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image/')) return null;

      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Helper: html2canvas with a timeout to prevent infinite hangs
  const html2canvasWithTimeout = (
    element: HTMLElement,
    options: Parameters<typeof html2canvas>[1],
    timeoutMs = 15000
  ): Promise<HTMLCanvasElement> => {
    return Promise.race([
      html2canvas(element, options),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('html2canvas timed out')), timeoutMs)
      ),
    ]);
  };

  const generatePDF = async (forEmail: boolean = false): Promise<Blob | null> => {
    setIsGenerating(true);
    let iframe: HTMLIFrameElement | null = null;

    try {
      const generationDeadline = Date.now() + 120000; // 2-min hard cap
      const ensureWithinBudget = () => {
        if (Date.now() > generationDeadline) {
          throw new Error('PDF generation timed out');
        }
      };

      // Pre-load cover image as data URL to avoid cross-origin / hanging issues
      const coverDataUrl = await preloadImageAsDataUrl('/templates/npc-vownet-cover.jpg', 5000);

      // ── Render inside an isolated iframe to avoid dashboard DOM interference ──
      // The main page has 1000+ DOM nodes (charts, listings, modals) that cause
      // html2canvas to crawl or crash. An iframe gives a clean, lightweight document.
      iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:1123px;border:none;visibility:hidden;';
      document.body.appendChild(iframe);

      // Wait for iframe to be ready
      await new Promise<void>((resolve) => {
        iframe!.onload = () => resolve();
        // Some browsers fire onload immediately for about:blank
        if (iframe!.contentDocument?.readyState === 'complete') resolve();
      });

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Could not access iframe document');

      // Generate HTML content (unchanged)
      const htmlContent = generateHTMLContent(data, includeOwnerOccupied);

      // Write the full HTML into the iframe's clean document
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // Replace cover background-image with preloaded data URL
      if (coverDataUrl) {
        const coverEl = iframeDoc.querySelector('.cover-page-image') as HTMLElement;
        if (coverEl) {
          coverEl.style.backgroundImage = `url('${coverDataUrl}')`;
        }
      }

      // Wait for styles to apply inside the iframe
      await new Promise(resolve => setTimeout(resolve, 300));

      const pages = iframeDoc.querySelectorAll('.page');
      const totalHtmlPages = pages.length;
      if (totalHtmlPages === 0) {
        throw new Error('No PDF pages were generated from template');
      }

      console.log(`[VownetPDF] Starting render: ${totalHtmlPages} pages in isolated iframe`);

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // The last HTML page is the disclaimer/contact page — render it AFTER BC pages
      const contentPages = totalHtmlPages > 1 ? totalHtmlPages - 1 : totalHtmlPages;
      const hasDisclaimerPage = totalHtmlPages > 1;

      // Adaptive render scale
      const navWithMemory = navigator as Navigator & { deviceMemory?: number };
      const deviceMemory = navWithMemory.deviceMemory ?? 4;
      const renderScale = totalHtmlPages > 8
        ? 1
        : deviceMemory <= 4
          ? 1.25
          : 1.6;

      const renderOptions: Parameters<typeof html2canvas>[1] = {
        scale: renderScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        logging: false,
      };

      // Render all content pages (everything except the final disclaimer page)
      for (let i = 0; i < contentPages; i++) {
        ensureWithinBudget();
        await new Promise(resolve => setTimeout(resolve, 0));

        const pageStart = Date.now();
        const page = pages[i] as HTMLElement;
        const canvas = await html2canvasWithTimeout(page, renderOptions, 15000);
        console.log(`[VownetPDF] Page ${i + 1}/${totalHtmlPages} rendered in ${Date.now() - pageStart}ms`);

        if (i > 0) {
          pdf.addPage();
        }

        // Pass canvas directly to jsPDF to avoid large base64 memory spikes
        pdf.addImage(canvas, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        canvas.width = 1;
        canvas.height = 1;
      }

      // ── Append Borrowing Capacity pages BEFORE disclaimer ──
      if (includeBorrowingCapacity && data.client.id) {
        try {
          ensureWithinBudget();
          console.log('📊 Fetching borrowing capacity data for Vownet PDF...');
          const { latestAssessment } = await fetchLatestBorrowingCapacity(data.client.id);

          if (latestAssessment) {
            const bcPdfData = transformAssessmentToSectionData(latestAssessment);
            const pageNum = { value: pdf.getNumberOfPages() + 1 };

            pdf.addPage();
            drawBorrowingCapacitySections(pdf, bcPdfData, 20, pageNum, false);

            console.log('✓ Borrowing capacity pages appended to Vownet PDF');
          } else {
            console.log('ℹ No borrowing capacity data found — skipping BC pages');
          }
        } catch (bcErr) {
          console.warn('Could not append borrowing capacity pages:', bcErr);
        }
      }

      // ── Render the disclaimer/contact page LAST (always the final page) ──
      if (hasDisclaimerPage) {
        ensureWithinBudget();
        await new Promise(resolve => setTimeout(resolve, 0));

        const disclaimerPage = pages[totalHtmlPages - 1] as HTMLElement;
        const disclaimerCanvas = await html2canvasWithTimeout(disclaimerPage, {
          ...renderOptions,
          backgroundColor: '#141414',
        }, 15000);

        pdf.addPage();
        pdf.addImage(disclaimerCanvas, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        disclaimerCanvas.width = 1;
        disclaimerCanvas.height = 1;
      }

      const generatedStamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `Vownet_Form_${clientName.replace(/\s+/g, '_')}_${generatedStamp}.pdf`;

      console.log(`[VownetPDF] Generation complete: ${pdf.getNumberOfPages()} total PDF pages`);

      if (forEmail) {
        const pdfBlob = pdf.output('blob');
        persistVownetPdf(pdfBlob, fileName, data.client.id);
        return pdfBlob;
      } else {
        const pdfBlob = pdf.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        persistVownetPdf(pdfBlob, fileName, data.client.id);
        toast.success('Vownet PDF downloaded & saved to Reports');
        return null;
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(message.toLowerCase().includes('timed out')
        ? 'PDF generation timed out. Please try again.'
        : 'Failed to generate PDF');
      return null;
    } finally {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    await generatePDF(false);
  };

  const handleEmailSend = async () => {
    const pdfBlob = await generatePDF(true);
    if (pdfBlob && onEmailClick) {
      const fileName = `Vownet_Form_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
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
      const { error } = await invokeSecureFunction('send-email-reply', {
        to: targetContact.email,
      subject: `Client Detail Form - ${clientName}`,
      body: `Hi ${targetContact.name.split(' ')[0]},\n\nPlease find attached the client detail form for ${clientName}.\n\nKind regards`,
        senderMailbox: userData.personal_mailbox,
        attachments: [{
          name: fileName,
          content: base64Data,
          contentType: 'application/pdf',
        }],
      });

      if (error) throw error;

      toast.success(`Client detail form sent to ${targetContact.name}`);
      
      addNotification({
        type: 'finance_agent_notified',
        title: 'Finance Agent Notified',
        message: `Client detail form for ${clientName} sent to ${targetContact.name}`,
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
      <DropdownMenuContent align="end" className="w-64">
        {/* Owner Occupied Toggle - affects Portfolio Summary calculations only */}
        <div className="flex items-center justify-between px-2 py-2 border-b">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="include-owner-occupied" className="text-sm cursor-pointer leading-tight">
              <span className="block">Owner Occupied in Summary</span>
              <span className="text-xs text-muted-foreground">Include in portfolio calculations</span>
            </Label>
          </div>
          <Switch
            id="include-owner-occupied"
            checked={includeOwnerOccupied}
            onCheckedChange={setIncludeOwnerOccupied}
          />
        </div>

        {/* Borrowing Capacity Toggle */}
        <div className="flex items-center justify-between px-2 py-2 border-b">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="include-bc-vownet" className="text-sm cursor-pointer leading-tight">
              <span className="block">Borrowing Capacity</span>
              <span className="text-xs text-muted-foreground">Append detailed BC assessment</span>
            </Label>
          </div>
          <Switch
            id="include-bc-vownet"
            checked={includeBorrowingCapacity}
            onCheckedChange={setIncludeBorrowingCapacity}
          />
        </div>
        
        <DropdownMenuItem onClick={handleDownload} disabled={isDisabled} className="mt-1">
          <Download className="h-4 w-4 mr-2" />
          Export Client Details as PDF
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
  goldTint: '#fdf9ed',
  darkBlue: '#113361',
  navy: '#0d264d',
  black: '#0a0a0a',
  darkGray: '#2d3748',
  mediumGray: '#4a5568',
  lightGray: '#f7fafc',
  borderGray: '#e2e8f0',
  white: '#ffffff',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
};

// Generate the full HTML content for the PDF
function generateHTMLContent(data: VownetPDFData, includeOwnerOccupied: boolean = true): string {
  const { client, properties, employment = [], income = [], assets = [], liabilities = [] } = data;
  const reportDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' });
  
  // Always find owner occupied property (shown on page 1 regardless of toggle)
  const ownerOccupied = properties.find(p => p.property_type === 'owner_occupied');
  const investmentProperties = properties.filter(p => p.property_type === 'investment');
  const smsfProperties = properties.filter(p => p.property_type === 'smsf');
  const rentalProperties = properties.filter(p => p.property_type === 'rental');
  
  // Filter properties for Portfolio Summary calculations based on toggle
  // When toggle is OFF, only investment properties are included in summary calculations
  const summaryProperties = includeOwnerOccupied 
    ? properties 
    : properties.filter(p => p.property_type !== 'owner_occupied');
  
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

  // Helper for cashflow indicator
  const getCashflowIndicator = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    if (value > 0) return `<span class="cf-indicator cf-positive">▲</span>`;
    if (value < 0) return `<span class="cf-indicator cf-negative">▼</span>`;
    return `<span class="cf-indicator cf-neutral">●</span>`;
  };

  // Helper for property type badge (with emoji icons for character)
  const getPropertyTypeBadge = (type: string): string => {
    switch (type) {
      case 'owner_occupied': return `<span class="prop-badge prop-badge-owner">🏠 Owner Occupied</span>`;
      case 'investment': return `<span class="prop-badge prop-badge-invest">📈 Investment</span>`;
      case 'smsf': return `<span class="prop-badge prop-badge-smsf">🏛️ SMSF</span>`;
      default: return `<span class="prop-badge">${type}</span>`;
    }
  };

  // Helper for equity progress bar
  const getEquityProgressBar = (value: number | null | undefined, loan: number | null | undefined): string => {
    const v = value || 0;
    const l = loan || 0;
    if (v === 0) return '<div class="equity-bar-container"><div class="equity-bar" style="width: 0%"></div></div>';
    const equityPercent = Math.max(0, Math.min(100, ((v - l) / v) * 100));
    return `
      <div class="equity-bar-container">
        <div class="equity-bar" style="width: ${equityPercent}%"></div>
        <span class="equity-label">${equityPercent.toFixed(0)}% equity</span>
      </div>
    `;
  };

  // Generate investment property HTML for a single property
  // Helper to calculate weekly rental from monthly
  const calculateWeeklyRental = (monthlyRental: number | null | undefined): number | null => {
    if (monthlyRental === null || monthlyRental === undefined || monthlyRental === 0) return null;
    return Math.round(monthlyRental * (12 / 52));
  };

  const generateInvestmentPropertyHTML = (prop: PropertyData, index: number) => {
    // Calculate weekly rental from monthly if not provided
    const weeklyRental = prop.weekly_rental_income || calculateWeeklyRental(prop.monthly_rental_income);
    
    return `
    <div class="property-card">
      <div class="section-header">
        <span class="section-header-text">📈 Investment Property ${index}</span>
        <span class="prop-badge prop-badge-invest">INVESTMENT</span>
      </div>
      <div class="property-address-bar">
        <span class="property-address-icon">📍</span>
        <span class="property-address-text">${prop.address || '-'}</span>
      </div>
      <div class="equity-display">
        ${getEquityProgressBar(prop.value, prop.loan_remaining)}
      </div>
      <table class="data-table alt-rows">
        <tr><td class="label">Value</td><td class="value currency">${formatCurrency(prop.value)}</td></tr>
        <tr><td class="label">Loan Remaining</td><td class="value currency">${formatCurrency(prop.loan_remaining)}</td></tr>
        <tr><td class="label">Interest Rate</td><td class="value percent">${formatPercent(prop.interest_rate)}</td></tr>
        <tr><td class="label">Ownership</td><td class="value percent">${formatPercent(prop.ownership_percentage)}</td></tr>
        ${prop.lender_name ? `<tr><td class="label">Lender / Bank</td><td class="value">${prop.lender_name}</td></tr>` : ''}
        ${prop.loan_repayment_amount ? `<tr><td class="label">Loan Repayment</td><td class="value currency">${formatCurrency(prop.loan_repayment_amount)}${prop.loan_repayment_frequency ? ` <span style="font-size:7px;color:#999">(${prop.loan_repayment_frequency})</span>` : ''}</td></tr>` : ''}
      </table>
      <div class="subsection-header">Monthly Expenses</div>
      <table class="data-table compact alt-rows">
        <tr><td class="label">Interest Repayment</td><td class="value currency">${formatCurrency(prop.monthly_interest_repayment)}</td></tr>
        <tr><td class="label">Body Corporate</td><td class="value currency">${formatCurrency(prop.monthly_body_corporate)}</td></tr>
        <tr><td class="label">Council Rates</td><td class="value currency">${formatCurrency(prop.monthly_council_rates)}</td></tr>
        <tr><td class="label">Water Rates</td><td class="value currency">${formatCurrency(prop.monthly_water_rates)}</td></tr>
        <tr><td class="label">Repairs & Maintenance</td><td class="value currency">${formatCurrency(prop.monthly_repairs_maintenance)}</td></tr>
        <tr><td class="label">Property Management</td><td class="value currency">${formatCurrency(prop.monthly_property_management)}</td></tr>
        <tr><td class="label">Landlord Insurance</td><td class="value currency">${formatCurrency(prop.monthly_landlord_insurance)}</td></tr>
        <tr><td class="label">Building Insurance</td><td class="value currency">${formatCurrency(prop.monthly_building_insurance)}</td></tr>
        <tr class="expense-total"><td class="label">Total Expenditure</td><td class="value currency">${formatCurrency(prop.total_monthly_expenditure)}</td></tr>
      </table>
      <div class="subsection-header">Income & Cashflow</div>
      <table class="data-table compact">
        <tr><td class="label">Weekly Rental Income</td><td class="value currency income-value">${formatCurrency(weeklyRental)}</td></tr>
        <tr><td class="label">Monthly Rental Income</td><td class="value currency income-value">${formatCurrency(prop.monthly_rental_income)}</td></tr>
        <tr class="cashflow-row ${(prop.net_monthly_cashflow || 0) >= 0 ? 'cf-positive-row' : 'cf-negative-row'}">
          <td class="label"><strong>Net Monthly Cashflow</strong></td>
          <td class="value currency">
            ${getCashflowIndicator(prop.net_monthly_cashflow)}
            <strong>${formatCurrency(prop.net_monthly_cashflow)}</strong>
          </td>
        </tr>
      </table>
    </div>
  `;
  };

  // ALL investment properties go to their own individual pages now
  // Each investment property gets a dedicated page for better readability

  // Generate SMSF property HTML for a single property
  const generateSmsfPropertyHTML = (prop: PropertyData, index: number) => {
    // Calculate weekly rental from monthly if not provided
    const weeklyRental = prop.weekly_rental_income || calculateWeeklyRental(prop.monthly_rental_income);
    
    return `
    <div class="property-card smsf-card">
      <div class="section-header gold">
        <span class="section-header-text">🏛️ SMSF Property ${index}</span>
        <span class="prop-badge prop-badge-smsf">SMSF</span>
      </div>
      
      <div class="property-address-bar">
        <span class="property-address-icon">📍</span>
        <span class="property-address-text">${prop.address || '-'}</span>
      </div>
      
      <!-- SMSF Fund Details -->
      <div class="subsection-header">Fund Details & Compliance</div>
      <table class="data-table alt-rows">
        <tr><td class="label">Fund Name</td><td class="value">${prop.smsf_fund_name || '-'}</td></tr>
        <tr><td class="label">ABN</td><td class="value"><code class="abn-code">${prop.smsf_abn || '-'}</code></td></tr>
        <tr><td class="label">Trustee Name</td><td class="value">${prop.smsf_trustee_name || '-'}</td></tr>
        <tr><td class="label">Trustee Type</td><td class="value">${formatTrusteeType(prop.smsf_trustee_type)}</td></tr>
        <tr><td class="label">Compliance Status</td><td class="value"><span class="compliance-badge ${prop.smsf_compliance_status === 'compliant' ? 'compliant' : prop.smsf_compliance_status === 'non_compliant' ? 'non-compliant' : 'pending'}">${formatComplianceStatus(prop.smsf_compliance_status)}</span></td></tr>
        <tr><td class="label">Auditor</td><td class="value">${prop.smsf_auditor_name || '-'}</td></tr>
      </table>

      <div class="equity-display">
        ${getEquityProgressBar(prop.value, prop.loan_remaining)}
      </div>
      
      <!-- Property Details -->
      <div class="subsection-header">Property Financials</div>
      <table class="data-table compact alt-rows">
        <tr><td class="label">Value</td><td class="value currency">${formatCurrency(prop.value)}</td></tr>
        <tr><td class="label">Loan Remaining</td><td class="value currency">${formatCurrency(prop.loan_remaining)}</td></tr>
        <tr><td class="label">Interest Rate</td><td class="value percent">${formatPercent(prop.interest_rate)}</td></tr>
        <tr><td class="label">Ownership</td><td class="value percent">${formatPercent(prop.ownership_percentage)}</td></tr>
        ${prop.lender_name ? `<tr><td class="label">Lender / Bank</td><td class="value">${prop.lender_name}</td></tr>` : ''}
        ${prop.loan_repayment_amount ? `<tr><td class="label">Loan Repayment</td><td class="value currency">${formatCurrency(prop.loan_repayment_amount)}${prop.loan_repayment_frequency ? ` <span style="font-size:7px;color:#999">(${prop.loan_repayment_frequency})</span>` : ''}</td></tr>` : ''}
      </table>
      
      <div class="subsection-header">Monthly Expenses</div>
      <table class="data-table compact alt-rows">
        <tr><td class="label">Interest Repayment</td><td class="value currency">${formatCurrency(prop.monthly_interest_repayment)}</td></tr>
        <tr><td class="label">Body Corporate</td><td class="value currency">${formatCurrency(prop.monthly_body_corporate)}</td></tr>
        <tr><td class="label">Council Rates</td><td class="value currency">${formatCurrency(prop.monthly_council_rates)}</td></tr>
        <tr><td class="label">Water Rates</td><td class="value currency">${formatCurrency(prop.monthly_water_rates)}</td></tr>
        <tr><td class="label">Repairs & Maintenance</td><td class="value currency">${formatCurrency(prop.monthly_repairs_maintenance)}</td></tr>
        <tr><td class="label">Property Management</td><td class="value currency">${formatCurrency(prop.monthly_property_management)}</td></tr>
        <tr><td class="label">Landlord Insurance</td><td class="value currency">${formatCurrency(prop.monthly_landlord_insurance)}</td></tr>
        <tr><td class="label">Building Insurance</td><td class="value currency">${formatCurrency(prop.monthly_building_insurance)}</td></tr>
        <tr class="expense-total"><td class="label">Total Expenditure</td><td class="value currency">${formatCurrency(prop.total_monthly_expenditure)}</td></tr>
      </table>
      
      <div class="subsection-header">Income & Cashflow</div>
      <table class="data-table compact">
        <tr><td class="label">Weekly Rental Income</td><td class="value currency income-value">${formatCurrency(weeklyRental)}</td></tr>
        <tr><td class="label">Monthly Rental Income</td><td class="value currency income-value">${formatCurrency(prop.monthly_rental_income)}</td></tr>
        <tr class="cashflow-row ${(prop.net_monthly_cashflow || 0) >= 0 ? 'cf-positive-row' : 'cf-negative-row'}">
          <td class="label"><strong>Net Monthly Cashflow</strong></td>
          <td class="value currency">
            ${getCashflowIndicator(prop.net_monthly_cashflow)}
            <strong>${formatCurrency(prop.net_monthly_cashflow)}</strong>
          </td>
        </tr>
      </table>
    </div>
  `;
  };

  // Calculate total pages dynamically
  // ALL investment properties now get their own individual page (one property per page)
  const investmentPropertyPages: Array<{prop: PropertyData, index: number}> = investmentProperties.map((prop, idx) => ({
    prop,
    index: idx + 1 // Start from 1
  }));
  
  // SMSF properties also get their own pages
  const smsfPropertyPages: Array<{prop: PropertyData, index: number}> = smsfProperties.map((prop, idx) => ({
    prop,
    index: idx + 1
  }));
  
  // Total pages: Cover + Page 1 (Personal Details) + Investment Property Pages + SMSF Pages + Employment + Assets + Summary + Final
  const basePages = 5; // Cover, Page 1, Employment, Assets, Summary
  const totalPages = basePages + investmentPropertyPages.length + smsfPropertyPages.length + 1; // +1 for Final page

  // Employment tables
  const primaryEmployment = employment.filter(e => e.contact_type === 'primary');
  const secondaryEmployment = employment.filter(e => e.contact_type === 'secondary');
  
  const generateEmploymentTable = (empList: EmploymentData[], isPrimary: boolean = false) => {
    if (empList.length === 0) {
      return `
        <div class="empty-state-compact ${isPrimary ? 'primary' : ''}">
          <div class="empty-state-icon">💼</div>
          <p class="empty-state-text">No employment records</p>
        </div>
      `;
    }
    return empList.map((emp, idx) => `
      <div class="info-card ${idx > 0 ? 'mt-2' : ''}">
        <div class="info-card-header">
          <span class="employer-icon">🏢</span>
          <span class="employer-name">${emp.employer_name || 'Unknown Employer'}</span>
        </div>
        <table class="data-table compact alt-rows">
          <tr><td class="label">Employment Type</td><td class="value"><span class="emp-type-badge">${emp.employment_type || '-'}</span></td></tr>
          <tr><td class="label">Role</td><td class="value">${emp.occupation_role || '-'}</td></tr>
          <tr><td class="label">Start Date</td><td class="value">${formatDate(emp.start_date)}</td></tr>
        </table>
      </div>
    `).join('');
  };

  // Income tables
  const primaryIncome = income.find(i => i.contact_type === 'primary');
  const secondaryIncome = income.find(i => i.contact_type === 'secondary');
  
  const generateIncomeTable = (inc: IncomeData | undefined) => {
    if (!inc) {
      return `
        <div class="empty-state-compact">
          <div class="empty-state-icon">💰</div>
          <p class="empty-state-text">No income records</p>
        </div>
      `;
    }
    const totalIncome = (inc.gross_salary || 0) + (inc.bonus || 0) + (inc.allowance || 0) + (inc.commission || 0) + (inc.overtime_essential || 0) + (inc.overtime_non_essential || 0) + (inc.other_taxable_income || 0);
    return `
      <div class="income-highlight">
        <span class="income-highlight-label">TOTAL ANNUAL INCOME</span>
        <span class="income-highlight-value">${formatCurrency(totalIncome)}</span>
      </div>
      <table class="data-table alt-rows compact">
        <tr><td class="label">Gross Salary</td><td class="value currency income-value">${formatCurrency(inc.gross_salary)}</td></tr>
        <tr><td class="label">Salary Frequency</td><td class="value"><span class="freq-badge">${(inc.salary_frequency || '-').toUpperCase()}</span></td></tr>
        <tr><td class="label">Bonus</td><td class="value currency">${formatCurrency(inc.bonus)}</td></tr>
        <tr><td class="label">Allowance</td><td class="value currency">${formatCurrency(inc.allowance)}</td></tr>
        <tr><td class="label">Commission</td><td class="value currency">${formatCurrency(inc.commission)}</td></tr>
        <tr><td class="label">Overtime (Essential)</td><td class="value currency">${formatCurrency(inc.overtime_essential)}</td></tr>
        <tr><td class="label">Overtime (Non-Essential)</td><td class="value currency">${formatCurrency(inc.overtime_non_essential)}</td></tr>
        <tr><td class="label">Other Taxable Income</td><td class="value currency">${formatCurrency(inc.other_taxable_income)}</td></tr>
      </table>
    `;
  };

  // Assets table - with emoji icons for character
  const getAssetEmoji = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('vehicle') || lowerType.includes('car')) return '🚗';
    if (lowerType.includes('savings') || lowerType.includes('bank')) return '🏦';
    if (lowerType.includes('super') || lowerType.includes('retirement')) return '💎';
    if (lowerType.includes('shares') || lowerType.includes('stock')) return '📈';
    if (lowerType.includes('property') || lowerType.includes('real')) return '🏠';
    return '💰';
  };

  const generateAssetsTable = () => {
    // Filter out credit cards from assets - check all relevant fields
    const filteredAssets = assets.filter(asset => {
      const type = (asset.asset_type || '').toLowerCase();
      const desc = (asset.description || '').toLowerCase();
      const institution = (asset.institution_name || '').toLowerCase();
      const isCreditCard = type.includes('credit') || type.includes('card') ||
                          desc.includes('credit') || desc.includes('card') ||
                          institution.includes('credit') || institution.includes('card');
      return !isCreditCard;
    });
    
    if (filteredAssets.length === 0) {
      return `
        <div class="empty-state-compact">
          <div class="empty-state-icon">💎</div>
          <p class="empty-state-text">No assets recorded</p>
        </div>
      `;
    }
    
    const totalAssets = filteredAssets.reduce((sum, a) => sum + (a.value || 0), 0);
    
    // Separate SMSF/super fund assets from others
    const smsfAssets: AssetData[] = [];
    const regularAssets: AssetData[] = [];
    
    filteredAssets.forEach(asset => {
      const type = (asset.asset_type || '').toLowerCase();
      const desc = (asset.description || asset.institution_name || '').toLowerCase();
      if (type.includes('super') || type.includes('smsf') || 
          desc.includes('super') || desc.includes('smsf') || desc.includes('cbus')) {
        smsfAssets.push(asset);
      } else {
        regularAssets.push(asset);
      }
    });
    
    // Group regular assets by type
    const assetsByType: Record<string, AssetData[]> = {};
    regularAssets.forEach(asset => {
      const type = asset.asset_type || 'Other';
      if (!assetsByType[type]) assetsByType[type] = [];
      assetsByType[type].push(asset);
    });
    
    // Generate SMSF section if there are SMSF assets
    const smsfSection = smsfAssets.length > 0 ? `
      <div class="asset-category">
        <div class="asset-category-header">
          <span class="category-icon">🏛️</span>
          <span class="category-title">Self-Managed Super Fund</span>
        </div>
        <table class="data-table compact alt-rows asset-table">
          ${smsfAssets.map(asset => `
            <tr>
              <td class="label">${asset.description || asset.make_model || asset.institution_name || '-'}</td>
              <td class="value currency">${formatCurrency(asset.value)}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    ` : '';
    
    return `
      <div class="assets-summary">
        <span class="assets-summary-label">TOTAL ASSETS VALUE</span>
        <span class="assets-summary-value">${formatCurrency(totalAssets)}</span>
      </div>
      ${Object.entries(assetsByType).map(([type, assetList]) => `
        <div class="asset-category">
          <div class="asset-category-header">
            <span class="category-icon">${getAssetEmoji(type)}</span>
            <span class="category-title">${type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </div>
          <table class="data-table compact alt-rows asset-table">
            ${assetList.map(asset => `
              <tr>
                <td class="label">${asset.description || asset.make_model || asset.institution_name || '-'}</td>
                <td class="value currency">${formatCurrency(asset.value)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `).join('')}
      ${smsfSection}
    `;
  };

  // Liabilities table - with emoji icons for character
  const getLiabilityEmoji = (type: string): string => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('credit') || lowerType.includes('card')) return '💳';
    if (lowerType.includes('mortgage') || lowerType.includes('home')) return '🏠';
    if (lowerType.includes('car') || lowerType.includes('vehicle')) return '🚗';
    if (lowerType.includes('personal') || lowerType.includes('loan')) return '📝';
    if (lowerType.includes('student') || lowerType.includes('education')) return '🎓';
    return '📋';
  };

  const generateLiabilitiesTable = () => {
    if (liabilities.length === 0) {
      return `
        <div class="empty-state-compact">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">No liabilities recorded</p>
        </div>
      `;
    }
    
    const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
    const totalRepayments = liabilities.reduce((sum, l) => sum + (l.monthly_repayment || 0), 0);
    const liabsByType: Record<string, LiabilityData[]> = {};
    liabilities.forEach(liab => {
      const type = liab.liability_type || 'Other';
      if (!liabsByType[type]) liabsByType[type] = [];
      liabsByType[type].push(liab);
    });
    
    return `
      <div class="liabilities-summary">
        <div class="liab-summary-item">
          <span class="liab-label">TOTAL OWED</span>
          <span class="liab-value negative">${formatCurrency(totalLiabilities)}</span>
        </div>
        <div class="liab-summary-item">
          <span class="liab-label">MONTHLY REPAYMENTS</span>
          <span class="liab-value">${formatCurrency(totalRepayments)}</span>
        </div>
      </div>
      ${Object.entries(liabsByType).map(([type, liabList]) => `
        <div class="liability-category">
          <div class="liability-category-header">
            <span class="category-icon">${getLiabilityEmoji(type)}</span>
            <span class="category-title">${type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </div>
          <table class="data-table financial-mini alt-rows">
            <thead>
              <tr>
                <th>PROVIDER</th>
                <th class="text-right">BALANCE</th>
                <th class="text-right">REPAYMENT</th>
              </tr>
            </thead>
            <tbody>
              ${liabList.map(liab => `
                <tr>
                  <td class="value">${liab.provider_name || '-'}</td>
                  <td class="value currency">${formatCurrency(liab.current_balance)}</td>
                  <td class="value currency">${formatCurrency(liab.monthly_repayment)}/mo</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    `;
  };

  // Personal Expenses table - rental properties where client pays rent
  const generateExpensesTable = () => {
    if (rentalProperties.length === 0) {
      return `
        <div class="empty-state-compact">
          <div class="empty-state-icon">🏠</div>
          <p class="empty-state-text">No personal expenses recorded</p>
        </div>
      `;
    }
    
    // For rental properties, monthly_rental_income stores the rent they PAY (as expense)
    const totalMonthlyRent = rentalProperties.reduce((sum, p) => sum + (p.monthly_rental_income || 0), 0);
    const totalWeeklyRent = rentalProperties.reduce((sum, p) => {
      const weekly = p.weekly_rental_income || (p.monthly_rental_income ? Math.round(p.monthly_rental_income * (12 / 52)) : 0);
      return sum + weekly;
    }, 0);
    
    return `
      <div class="expenses-summary">
        <div class="expense-summary-item">
          <span class="expense-label">TOTAL WEEKLY RENT</span>
          <span class="expense-value">${formatCurrency(totalWeeklyRent)}</span>
        </div>
        <div class="expense-summary-item">
          <span class="expense-label">TOTAL MONTHLY RENT</span>
          <span class="expense-value negative">${formatCurrency(totalMonthlyRent)}</span>
        </div>
      </div>
      <div class="expense-category">
        <div class="expense-category-header">
          <span class="category-icon">🏠</span>
          <span class="category-title">Rental Accommodation</span>
        </div>
        <table class="data-table financial-mini alt-rows">
          <thead>
            <tr>
              <th>ADDRESS</th>
              <th class="text-right">WEEKLY</th>
              <th class="text-right">MONTHLY</th>
            </tr>
          </thead>
          <tbody>
            ${rentalProperties.map(prop => {
              const weeklyRent = prop.weekly_rental_income || (prop.monthly_rental_income ? Math.round(prop.monthly_rental_income * (12 / 52)) : 0);
              return `
                <tr>
                  <td class="value">${prop.address?.substring(0, 30) || '-'}${(prop.address?.length || 0) > 30 ? '...' : ''}</td>
                  <td class="value currency">${formatCurrency(weeklyRent)}/wk</td>
                  <td class="value currency">${formatCurrency(prop.monthly_rental_income)}/mo</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  // Properties summary rows - show more of address (uses filtered properties based on toggle)
  const propertiesSummaryRows = summaryProperties.map(prop => `
    <tr>
      <td class="property-address-cell">${prop.address?.substring(0, 45) || '-'}${(prop.address?.length || 0) > 45 ? '...' : ''}</td>
      <td class="text-right compact-col">${formatCurrency(prop.value)}</td>
      <td class="text-right compact-col">${formatCurrency(prop.loan_remaining)}</td>
      <td class="text-right compact-col">${formatCurrency(prop.monthly_rental_income)}</td>
      <td class="text-right compact-col ${(prop.net_monthly_cashflow || 0) >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(prop.net_monthly_cashflow)}</td>
    </tr>
  `).join('');

  // Calculate totals (uses filtered properties based on toggle)
  const totalValue = summaryProperties.reduce((sum, p) => sum + (p.value || 0), 0);
  const totalLoans = summaryProperties.reduce((sum, p) => sum + (p.loan_remaining || 0), 0);
  const totalRental = summaryProperties.reduce((sum, p) => sum + (p.monthly_rental_income || 0), 0);
  const totalNetCF = summaryProperties.reduce((sum, p) => sum + (p.net_monthly_cashflow || 0), 0);

  // Properly capitalize client names
  const primaryName = `${properCase(client.primary_first_name)} ${properCase(client.primary_surname)}`;
  const secondaryName = client.secondary_first_name 
    ? `${properCase(client.secondary_first_name)} ${properCase(client.secondary_surname || client.primary_surname)}`
    : '';
  const clientFullName = secondaryName ? `${primaryName} & ${secondaryName}` : primaryName;
  
  // Calculate equity based on filtered properties (respects toggle setting)
  const summaryEquity = totalValue - totalLoans;

  // Generate individual investment property pages HTML (one per page)
  const investmentPropertyPagesHTML = investmentPropertyPages.map((item, pageIndex) => `
    <!-- INVESTMENT PROPERTY PAGE ${pageIndex + 1} -->
    <div class="page">
      <div class="page-header">
        <div class="header-title-group">
          <div class="header-title">Investment Property ${item.index}</div>
          <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
        </div>
      </div>
      <div class="page-content">
        <div class="property-page-content">
          ${generateInvestmentPropertyHTML(item.prop, item.index)}
        </div>
      </div>
      <div class="page-footer">
        <div class="footer-contact">
          <span class="footer-item">📞 (02) 8609 3299</span>
          <span class="footer-item">✉ admin@npcservices.com.au</span>
          <span class="footer-item">🌐 npcservices.com.au</span>
        </div>
        <div>Page ${pageIndex + 2} of ${totalPages}</div>
      </div>
    </div>
  `).join('');
  
  // Generate individual SMSF property pages HTML (one per page)
  const smsfPropertyPagesHTML = smsfPropertyPages.map((item, pageIndex) => `
    <!-- SMSF PROPERTY PAGE ${pageIndex + 1} -->
    <div class="page">
      <div class="page-header">
        <div class="header-title-group">
          <div class="header-title">SMSF Property ${item.index}</div>
          <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
        </div>
      </div>
      <div class="page-content">
        <div class="property-page-content">
          ${generateSmsfPropertyHTML(item.prop, item.index)}
        </div>
      </div>
      <div class="page-footer">
        <div class="footer-contact">
          <span class="footer-item">📞 (02) 8609 3299</span>
          <span class="footer-item">✉ admin@npcservices.com.au</span>
          <span class="footer-item">🌐 npcservices.com.au</span>
        </div>
        <div>Page ${pageIndex + 2 + investmentPropertyPages.length} of ${totalPages}</div>
      </div>
    </div>
  `).join('');
  
  // Combined property pages HTML
  const allPropertyPagesHTML = investmentPropertyPagesHTML + smsfPropertyPagesHTML;

  // Calculate page numbers for static pages
  // New order: Cover(no number) → Portfolio Summary(1) → Personal Details(2) → Properties → Employment → Assets → Disclaimer
  const propertyPagesCount = investmentPropertyPages.length + smsfPropertyPages.length;
  const summaryPageNumber = 1;
  const page1Number = 2;
  // Property pages start at page 3
  const employmentPageNumber = 3 + propertyPagesCount;
  const assetsPageNumber = 4 + propertyPagesCount;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        /* System font stack — no @import to avoid html2canvas hanging */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: ${NPC_COLORS.black}; background: ${NPC_COLORS.white}; }
        
        /* Page Layout */
        .page { width: 794px; height: 1123px; background: ${NPC_COLORS.white}; position: relative; overflow: hidden; }
        .page-content { padding: 30px 40px; padding-top: 90px; }
        
        /* Cover Page - Image Based */
        .cover-page-image { 
          background-size: cover; 
          background-position: center; 
          background-repeat: no-repeat;
          position: relative;
          transform: rotate(180deg);
        }
        .cover-page-image .cover-overlay {
          transform: rotate(180deg);
        }
        .cover-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .cover-content-positioned {
          position: absolute;
          bottom: 180px;
          left: 0;
          right: 0;
          text-align: center;
        }
        .cover-doc-title-positioned {
          color: ${NPC_COLORS.white};
          font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
          font-size: 28pt;
          font-weight: 500;
          margin-bottom: 20px;
        }
        .cover-client-name-positioned {
          color: ${NPC_COLORS.gold};
          font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
          font-size: 16pt;
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 40px;
        }
        .cover-date-positioned {
          color: ${NPC_COLORS.white};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          font-size: 11pt;
          letter-spacing: 1px;
        }
        
        /* Final Page - Image Based */
        .final-page {
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .cover-date { color: ${NPC_COLORS.goldLight}; font-size: 11pt; letter-spacing: 2px; }
        
        /* Page Header */
        .page-header { position: absolute; top: 0; left: 0; right: 0; height: 70px; background: ${NPC_COLORS.darkBlue}; display: flex; justify-content: flex-end; align-items: center; padding: 0 40px; }
        .page-header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: ${NPC_COLORS.gold}; }
        .header-title-group { text-align: right; }
        .header-title { color: ${NPC_COLORS.white}; font-size: 12pt; font-weight: 600; }
        .header-subtitle { color: ${NPC_COLORS.goldLight}; font-size: 8pt; letter-spacing: 1px; }
        
        /* Page Footer */
        .page-footer { position: absolute; bottom: 0; left: 0; right: 0; height: 50px; background: ${NPC_COLORS.lightGray}; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; padding: 0 40px; font-size: 7.5pt; color: #4a5568; }
        .footer-contact { display: flex; gap: 24px; }
        .footer-item { display: flex; align-items: center; gap: 6px; }
        
        /* Section Headers - Enhanced readability */
        .section { margin-bottom: 16px; }
        .section-header { 
          background: linear-gradient(135deg, ${NPC_COLORS.darkBlue} 0%, ${NPC_COLORS.navy} 100%); 
          color: ${NPC_COLORS.white}; 
          padding: 14px 18px; 
          font-size: 10pt; 
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-left: 4px solid ${NPC_COLORS.gold};
          border-radius: 0;
        }
        .section-header-text { display: flex; align-items: center; gap: 10px; }
        .section-header-text::before { content: ''; }
        .section-header.gold { 
          background: linear-gradient(135deg, ${NPC_COLORS.gold} 0%, ${NPC_COLORS.goldDark} 100%); 
          color: ${NPC_COLORS.black}; 
          border-left: 4px solid ${NPC_COLORS.darkBlue};
        }
        .section-header.gold .section-header-text::before { content: ''; }
        
        .subsection-header { 
          background: linear-gradient(90deg, ${NPC_COLORS.goldTint} 0%, #fefcf8 100%); 
          color: ${NPC_COLORS.darkGray}; 
          padding: 12px 18px; 
          font-size: 9pt; 
          font-weight: 600;
          border-left: 3px solid ${NPC_COLORS.gold};
          margin-top: 14px;
          margin-bottom: 10px;
        }
        
        /* Property Page Content - for individual property pages */
        .property-page-content {
          max-width: 680px;
          margin: 0 auto;
        }
        .property-page-content .property-card {
          margin-bottom: 0;
        }
        
        /* Property Cards */
        .property-card {
          border: 1px solid ${NPC_COLORS.borderGray};
          border-radius: 6px;
          margin-bottom: 14px;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        .property-card .section-header { border-radius: 0; }
        .smsf-card { border: 2px solid ${NPC_COLORS.gold}; }
        
        /* Properties grid for overflow pages */
        .properties-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .property-address-bar {
          background: ${NPC_COLORS.lightGray};
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid ${NPC_COLORS.borderGray};
        }
        .property-address-icon { 
          color: ${NPC_COLORS.gold}; 
          font-size: 10pt; 
          line-height: 1; 
        }
        .property-address-text { font-weight: 500; color: ${NPC_COLORS.darkGray}; font-size: 8.5pt; }
        
        /* Property Badges */
        .prop-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 6.5pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .prop-badge-owner { background: ${NPC_COLORS.goldLight}; color: ${NPC_COLORS.goldDark}; }
        .prop-badge-invest { background: #dbeafe; color: #1e40af; }
        .prop-badge-smsf { background: #fae8ff; color: #7e22ce; }
        
        /* Equity Progress Bar */
        .equity-display { padding: 10px 14px; background: ${NPC_COLORS.lightGray}; }
        .equity-bar-container {
          width: 100%;
          height: 18px;
          background: #e5e7eb;
          border-radius: 9px;
          position: relative;
          overflow: hidden;
        }
        .equity-bar {
          height: 100%;
          background: linear-gradient(90deg, ${NPC_COLORS.gold} 0%, ${NPC_COLORS.goldDark} 100%);
          border-radius: 9px;
          transition: width 0.3s ease;
        }
        .equity-label {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 7pt;
          font-weight: 600;
          color: ${NPC_COLORS.darkGray};
        }
        
        /* Cashflow Indicators */
        .cf-indicator { font-size: 11pt; margin-right: 6px; vertical-align: middle; }
        .cf-positive { color: ${NPC_COLORS.success}; }
        .cf-negative { color: ${NPC_COLORS.danger}; }
        .cf-neutral { color: ${NPC_COLORS.warning}; }
        
        .cashflow-row { font-weight: 600; }
        .cf-positive-row { background: ${NPC_COLORS.successLight} !important; }
        .cf-positive-row td { border-color: #86efac !important; }
        .cf-negative-row { background: ${NPC_COLORS.dangerLight} !important; }
        .cf-negative-row td { border-color: #fecaca !important; }
        
        /* Income Values Highlight */
        .income-value { color: ${NPC_COLORS.success}; font-weight: 500; }
        .expense-total { background: #fff7ed !important; }
        .expense-total td { border-top: 1px solid ${NPC_COLORS.warning}; font-weight: 600; }
        
        /* Two Column Layout */
        .two-columns { display: flex; gap: 24px; }
        .column { flex: 1; }
        .column-left { flex: 0.95; }
        .column-right { flex: 1.05; }
        
        /* Data Tables - Enhanced for better readability */
        .data-table { width: 100%; border-collapse: collapse; font-size: 9pt; border: 1px solid ${NPC_COLORS.borderGray}; line-height: 1.5; }
        .data-table th { 
          background: linear-gradient(180deg, ${NPC_COLORS.darkGray} 0%, #1a202c 100%); 
          color: ${NPC_COLORS.white};
          border: 1px solid ${NPC_COLORS.mediumGray}; 
          padding: 12px 16px; 
          text-align: left; 
          font-weight: 600;
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .data-table td { border: 1px solid ${NPC_COLORS.borderGray}; padding: 12px 16px; vertical-align: middle; line-height: 1.4; }
        .data-table .label { 
          background: linear-gradient(90deg, ${NPC_COLORS.lightGray} 0%, #edf2f7 100%); 
          font-weight: 500; 
          width: 48%; 
          color: ${NPC_COLORS.darkGray}; 
          font-size: 8.5pt;
        }
        .data-table .value { background: ${NPC_COLORS.white}; color: ${NPC_COLORS.black}; font-weight: 500; font-size: 9pt; }
        .data-table .currency { text-align: right; font-family: 'Inter', monospace; font-weight: 600; }
        .data-table .percent { text-align: right; }
        
        /* Alternating Rows */
        .data-table.alt-rows tr:nth-child(even) td.label { background: #edf2f7; }
        .data-table.alt-rows tr:nth-child(even) td.value { background: ${NPC_COLORS.lightGray}; }
        
        /* Compact Tables - still readable */
        .data-table.compact td { padding: 10px 14px; font-size: 8.5pt; }
        
        /* Financial Mini Tables */
        .financial-mini { font-size: 7.5pt; }
        .financial-mini th { 
          background: linear-gradient(180deg, ${NPC_COLORS.navy} 0%, ${NPC_COLORS.darkBlue} 100%); 
          padding: 5px 8px;
          font-size: 6.5pt;
        }
        
        /* Compliance Badges */
        .compliance-badge {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 7pt;
          font-weight: 600;
        }
        .compliance-badge.compliant { background: ${NPC_COLORS.successLight}; color: ${NPC_COLORS.success}; }
        .compliance-badge.non-compliant { background: ${NPC_COLORS.dangerLight}; color: ${NPC_COLORS.danger}; }
        .compliance-badge.pending { background: ${NPC_COLORS.warningLight}; color: ${NPC_COLORS.warning}; }
        
        .abn-code { 
          font-family: 'Courier New', monospace; 
          background: ${NPC_COLORS.lightGray}; 
          padding: 2px 6px; 
          border-radius: 3px;
          font-size: 8pt;
        }
        
        /* Info Cards - Enhanced readability */
        .info-card {
          border: 1px solid ${NPC_COLORS.borderGray};
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .info-card-header {
          background: linear-gradient(90deg, ${NPC_COLORS.goldTint} 0%, ${NPC_COLORS.white} 100%);
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid ${NPC_COLORS.borderGray};
          border-left: 4px solid ${NPC_COLORS.gold};
        }
        .employer-icon { 
          font-size: 16pt; 
          line-height: 1; 
        }
        .employer-name { font-weight: 600; color: ${NPC_COLORS.darkBlue}; font-size: 10pt; }
        
        .emp-type-badge, .freq-badge {
          background: ${NPC_COLORS.goldLight};
          color: ${NPC_COLORS.goldDark};
          padding: 4px 12px;
          border-radius: 10px;
          font-size: 7.5pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        /* Empty State - Compact */
        .empty-state-compact {
          padding: 28px 16px;
          text-align: center;
          background: ${NPC_COLORS.lightGray};
          border-radius: 6px;
          border: 1px dashed ${NPC_COLORS.borderGray};
        }
        .empty-state-compact.primary {
          border-color: ${NPC_COLORS.gold};
          background: ${NPC_COLORS.goldTint};
        }
        .empty-state-icon {
          font-size: 24pt;
          margin-bottom: 10px;
        }
        .empty-state-text {
          font-size: 9pt;
          color: ${NPC_COLORS.mediumGray};
          margin: 0;
        }
        
        /* Income Highlight - Better readability */
        .income-highlight {
          background: linear-gradient(135deg, ${NPC_COLORS.gold} 0%, ${NPC_COLORS.goldDark} 100%);
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          border-radius: 6px;
        }
        .income-highlight-label { color: ${NPC_COLORS.white}; font-size: 9pt; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
        .income-highlight-value { color: ${NPC_COLORS.white}; font-size: 18pt; font-weight: 700; }
        
        /* Assets Summary */
        .assets-summary {
          background: linear-gradient(135deg, ${NPC_COLORS.goldTint} 0%, #fefcf8 100%);
          border: 2px solid ${NPC_COLORS.gold};
          padding: 14px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          border-radius: 6px;
        }
        .assets-summary-label { color: ${NPC_COLORS.darkGray}; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .assets-summary-value { color: ${NPC_COLORS.success}; font-size: 18pt; font-weight: 700; }
        
        .asset-category, .liability-category { margin-bottom: 12px; }
        
        /* Category Headers - Consistent styling with better readability */
        .asset-category-header, .liability-category-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: ${NPC_COLORS.lightGray};
          border-left: 3px solid ${NPC_COLORS.gold};
          margin-bottom: 6px;
          border-radius: 0 4px 4px 0;
        }
        .category-icon {
          font-size: 14pt;
        }
        .category-title {
          font-size: 9pt;
          font-weight: 600;
          color: ${NPC_COLORS.darkGray};
          text-transform: capitalize;
        }
        
        /* Asset Table specific styling */
        .asset-table td.label {
          width: 70%;
        }
        .asset-table td.value {
          width: 30%;
        }
        
        /* Liabilities Summary */
        .liabilities-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 14px;
        }
        .liab-summary-item {
          background: ${NPC_COLORS.lightGray};
          padding: 14px 16px;
          border-radius: 6px;
          border-left: 4px solid ${NPC_COLORS.darkBlue};
        }
        .liab-label { display: block; font-size: 7.5pt; color: ${NPC_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .liab-value { display: block; font-size: 18pt; font-weight: 700; color: ${NPC_COLORS.darkBlue}; }
        .liab-value.negative { color: ${NPC_COLORS.danger}; }
        
        /* Expenses Summary - Personal expenses like rent */
        .expenses-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 14px;
        }
        .expense-summary-item {
          background: ${NPC_COLORS.lightGray};
          padding: 14px 16px;
          border-radius: 6px;
          border-left: 4px solid ${NPC_COLORS.warning};
        }
        .expense-label { display: block; font-size: 7.5pt; color: ${NPC_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .expense-value { display: block; font-size: 18pt; font-weight: 700; color: ${NPC_COLORS.darkGray}; }
        .expense-value.negative { color: ${NPC_COLORS.warning}; }
        
        .expense-category { margin-bottom: 12px; }
        .expense-category-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: ${NPC_COLORS.warningLight};
          border-left: 3px solid ${NPC_COLORS.warning};
          margin-bottom: 6px;
          border-radius: 0 4px 4px 0;
        }
        
        /* Empty States */
        .empty-state {
          padding: 20px;
          text-align: center;
          background: ${NPC_COLORS.lightGray};
          border-radius: 6px;
          color: ${NPC_COLORS.mediumGray};
        }
        .empty-icon { font-size: 24pt; display: block; margin-bottom: 8px; opacity: 0.5; }
        .empty-state p { font-size: 8pt; }
        
        /* Summary Box - Gold Accent */
        .summary-box { 
          border: 2px solid ${NPC_COLORS.gold}; 
          background: linear-gradient(135deg, ${NPC_COLORS.goldTint} 0%, #fefcf8 100%);
          padding: 18px; 
          margin-top: 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(201, 162, 39, 0.15);
        }
        .summary-title { 
          font-weight: 700; 
          color: ${NPC_COLORS.darkBlue}; 
          margin-bottom: 14px; 
          font-size: 11pt; 
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 10px;
          border-bottom: 1px solid ${NPC_COLORS.goldLight};
        }
        .summary-title::before { content: ''; }
        
        /* Financial Table - Better readability */
        .financial-table { width: 100%; border-collapse: collapse; font-size: 9pt; border: 1px solid ${NPC_COLORS.borderGray}; border-radius: 4px; overflow: hidden; line-height: 1.4; }
        .financial-table th { 
          background: linear-gradient(180deg, ${NPC_COLORS.darkBlue} 0%, ${NPC_COLORS.navy} 100%); 
          color: ${NPC_COLORS.white}; 
          padding: 12px 14px; 
          text-align: left;
          font-weight: 600;
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .financial-table td { border: 1px solid ${NPC_COLORS.borderGray}; padding: 10px 12px; font-size: 9pt; }
        .financial-table tbody tr:nth-child(odd) { background: ${NPC_COLORS.white}; }
        .financial-table tbody tr:nth-child(even) { background: ${NPC_COLORS.lightGray}; }
        .financial-table .total-row { 
          background: linear-gradient(90deg, ${NPC_COLORS.goldLight} 0%, ${NPC_COLORS.goldTint} 100%) !important; 
          font-weight: 700; 
        }
        .financial-table .total-row td { 
          border-top: 2px solid ${NPC_COLORS.gold}; 
          font-size: 10pt;
        }
        
        /* KPI Cards - Enhanced with emoji icons for character */
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 24px; }
        .kpi-card { 
          background: linear-gradient(135deg, ${NPC_COLORS.white} 0%, ${NPC_COLORS.lightGray} 100%);
          border: 1px solid ${NPC_COLORS.borderGray};
          border-left: 5px solid ${NPC_COLORS.gold};
          padding: 18px 20px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .kpi-icon { 
          font-size: 24pt; 
          margin-bottom: 12px; 
          display: block; 
          line-height: 1; 
        }
        .kpi-label { font-size: 7.5pt; color: ${NPC_COLORS.mediumGray}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 600; }
        .kpi-value { font-size: 20pt; font-weight: 700; color: ${NPC_COLORS.darkBlue}; }
        .kpi-value.positive { color: ${NPC_COLORS.success}; }
        .kpi-value.negative { color: ${NPC_COLORS.danger}; }
        .kpi-trend { font-size: 8pt; color: ${NPC_COLORS.mediumGray}; margin-top: 6px; }
        .kpi-trend.up { color: ${NPC_COLORS.success}; }
        .kpi-trend.down { color: ${NPC_COLORS.danger}; }
        
        /* Gold Divider */
        .gold-divider {
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, ${NPC_COLORS.gold} 50%, transparent 100%);
          margin: 16px 0;
        }
        
        /* Utility Classes */
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .text-green { color: ${NPC_COLORS.success}; }
        .text-red { color: ${NPC_COLORS.danger}; }
        .mt-2 { margin-top: 12px; }
        
        /* Properties Overview Table - Smart column sizing */
        .property-address-cell { 
          max-width: 200px; 
          word-wrap: break-word; 
          font-size: 8pt;
        }
        .compact-col { 
          white-space: nowrap; 
          font-size: 8pt;
          padding: 8px 6px !important;
        }
        .financial-table th:first-child { width: 40%; }
        .financial-table th:not(:first-child) { width: 15%; }
      </style>
    </head>
    <body>
      <!-- COVER PAGE - Using exact template image -->
      <div class="page cover-page-image" style="background-image: url('/templates/npc-vownet-cover.jpg'); background-size: cover; background-position: center;">
        <!-- Overlay content positioned on the template -->
        <div class="cover-overlay">
          <div class="cover-content-positioned">
            <div class="cover-doc-title-positioned">Client Portfolio Form</div>
            <div class="cover-client-name-positioned">${clientFullName}</div>
            <div class="cover-date-positioned">${reportDate}</div>
          </div>
        </div>
      </div>
      
      <!-- PAGE 1: Portfolio Summary (immediately after cover) -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Portfolio Summary</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-icon">🏠</span>
              <div class="kpi-label">TOTAL PORTFOLIO VALUE</div>
              <div class="kpi-value">${formatCurrency(totalValue)}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-icon">💳</span>
              <div class="kpi-label">TOTAL DEBT</div>
              <div class="kpi-value">${formatCurrency(totalLoans)}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-icon">📈</span>
              <div class="kpi-label">PORTFOLIO EQUITY</div>
              <div class="kpi-value ${summaryEquity >= 0 ? 'positive' : 'negative'}">${formatCurrency(summaryEquity)}</div>
            </div>
          </div>
          
          <div class="summary-box">
            <div class="summary-title">📊 Monthly Cashflow Analysis</div>
            <table class="data-table alt-rows compact">
              <tr><td class="label">Total Monthly Income</td><td class="value currency income-value">${formatCurrency(client.total_monthly_income || 0)}</td></tr>
              <tr><td class="label">Total Monthly Expenditure</td><td class="value currency">${formatCurrency(client.total_monthly_expenditure || 0)}</td></tr>
              <tr class="cashflow-row ${(client.net_monthly_cash_flow || totalNetCF || 0) >= 0 ? 'cf-positive-row' : 'cf-negative-row'}">
                <td class="label"><strong>Net Monthly Cash Flow</strong></td>
                <td class="value currency">
                  ${getCashflowIndicator(client.net_monthly_cash_flow || totalNetCF)}
                  <strong>${formatCurrency(client.net_monthly_cash_flow || totalNetCF)}</strong>
                </td>
              </tr>
            </table>
          </div>
          
          <div class="section" style="margin-top: 20px;">
            <div class="section-header gold">Properties Overview</div>
            <table class="financial-table">
              <thead>
                <tr>
                  <th>PROPERTY</th>
                  <th class="text-right">VALUE</th>
                  <th class="text-right">LOAN</th>
                  <th class="text-right">RENTAL</th>
                  <th class="text-right">NET CF</th>
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
          <div>Page ${summaryPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
      <!-- PAGE 2: Personal Details & Properties -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Personal Details</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns" style="align-items: flex-start;">
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
            </div>
            <div class="column column-right">
              <div class="section">
                <div class="section-header gold">Address & Status</div>
                <table class="data-table">
                  <tr><td class="label">Current address</td><td class="value">${client.current_address || '-'}</td></tr>
                  <tr><td class="label">Country</td><td class="value">${client.country || 'Australia'}</td></tr>
                  <tr><td class="label">Living Situation</td><td class="value">${client.living_situation || '-'}</td></tr>
                  <tr><td class="label">Residential status</td><td class="value">${client.residential_status || '-'}</td></tr>
                  <tr><td class="label">Marital status</td><td class="value">${client.marital_status || '-'}</td></tr>
                  <tr><td class="label">Number of dependents</td><td class="value">${client.dependents_count ?? 0}</td></tr>
                </table>
              </div>
              <div class="section">
                <div class="section-header">Property (Owner Occupied)</div>
                <table class="data-table">
                  <tr><td class="label">Address</td><td class="value">${ownerOccupied?.address || '-'}</td></tr>
                  <tr><td class="label">Value</td><td class="value currency">${formatCurrency(ownerOccupied?.value)}</td></tr>
                  <tr><td class="label">Loan Remaining ($)</td><td class="value currency">${formatCurrency(ownerOccupied?.loan_remaining)}</td></tr>
                  <tr><td class="label">Interest Rate (%)</td><td class="value percent">${formatPercent(ownerOccupied?.interest_rate)}</td></tr>
                  <tr><td class="label">Ownership (%)</td><td class="value percent">${formatPercent(ownerOccupied?.ownership_percentage)}</td></tr>
                  ${ownerOccupied?.lender_name ? `<tr><td class="label">Lender / Bank</td><td class="value">${ownerOccupied.lender_name}</td></tr>` : ''}
                  ${ownerOccupied?.loan_repayment_amount ? `<tr><td class="label">Loan Repayment</td><td class="value currency">${formatCurrency(ownerOccupied.loan_repayment_amount)} <span style="font-size:7px;color:#999">(${ownerOccupied.loan_repayment_frequency || 'monthly'})</span></td></tr>` : ''}
                  <tr><td class="label">Monthly Interest Repayment</td><td class="value currency">${formatCurrency(ownerOccupied?.monthly_interest_repayment)}</td></tr>
                  <tr><td class="label">Net Monthly Cashflow</td><td class="value currency">${formatCurrency(ownerOccupied?.net_monthly_cashflow)}</td></tr>
                </table>
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
          <div>Page ${page1Number} of ${totalPages}</div>
        </div>
      </div>
      
      ${allPropertyPagesHTML}
      
      <!-- Employment & Income -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Employment & Income</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns" style="align-items: flex-start;">
            <div class="column">
              <div class="section" style="margin-bottom: 20px;">
                <div class="section-header gold">Primary Contact - Employment</div>
                ${generateEmploymentTable(primaryEmployment, true)}
              </div>
              <div class="section">
                <div class="section-header">Secondary Contact - Employment</div>
                ${generateEmploymentTable(secondaryEmployment, false)}
              </div>
            </div>
            <div class="column">
              <div class="section" style="margin-bottom: 20px;">
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
          <div>Page ${employmentPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
      <!-- Assets, Liabilities & Expenses -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Assets, Liabilities & Expenses</div>
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
              <div class="section" style="margin-bottom: 20px;">
                <div class="section-header">Liabilities</div>
                ${generateLiabilitiesTable()}
              </div>
              <div class="section">
                <div class="section-header" style="background: linear-gradient(135deg, ${NPC_COLORS.warning} 0%, ${NPC_COLORS.goldDark} 100%); border-left-color: ${NPC_COLORS.darkBlue};">
                  <span class="section-header-text">💸 Personal Expenses</span>
                </div>
                ${generateExpensesTable()}
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
          <div>Page ${assetsPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
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
            </div>
            <div class="column column-right">
              <div class="section">
                <div class="section-header gold">Address & Status</div>
                <table class="data-table">
                  <tr><td class="label">Current address</td><td class="value">${client.current_address || '-'}</td></tr>
                  <tr><td class="label">Country</td><td class="value">${client.country || 'Australia'}</td></tr>
                  <tr><td class="label">Living Situation</td><td class="value">${client.living_situation || '-'}</td></tr>
                  <tr><td class="label">Residential status</td><td class="value">${client.residential_status || '-'}</td></tr>
                  <tr><td class="label">Marital status</td><td class="value">${client.marital_status || '-'}</td></tr>
                  <tr><td class="label">Number of dependents</td><td class="value">${client.dependents_count ?? 0}</td></tr>
                </table>
              </div>
              <div class="section">
                <div class="section-header">Property (Owner Occupied)</div>
                <table class="data-table">
                  <tr><td class="label">Address</td><td class="value">${ownerOccupied?.address || '-'}</td></tr>
                  <tr><td class="label">Value</td><td class="value currency">${formatCurrency(ownerOccupied?.value)}</td></tr>
                  <tr><td class="label">Loan Remaining ($)</td><td class="value currency">${formatCurrency(ownerOccupied?.loan_remaining)}</td></tr>
                  <tr><td class="label">Interest Rate (%)</td><td class="value percent">${formatPercent(ownerOccupied?.interest_rate)}</td></tr>
                  <tr><td class="label">Ownership (%)</td><td class="value percent">${formatPercent(ownerOccupied?.ownership_percentage)}</td></tr>
                  ${ownerOccupied?.lender_name ? `<tr><td class="label">Lender / Bank</td><td class="value">${ownerOccupied.lender_name}</td></tr>` : ''}
                  ${ownerOccupied?.loan_repayment_amount ? `<tr><td class="label">Loan Repayment</td><td class="value currency">${formatCurrency(ownerOccupied.loan_repayment_amount)} <span style="font-size:7px;color:#999">(${ownerOccupied.loan_repayment_frequency || 'monthly'})</span></td></tr>` : ''}
                  <tr><td class="label">Monthly Interest Repayment</td><td class="value currency">${formatCurrency(ownerOccupied?.monthly_interest_repayment)}</td></tr>
                  <tr><td class="label">Net Monthly Cashflow</td><td class="value currency">${formatCurrency(ownerOccupied?.net_monthly_cashflow)}</td></tr>
                </table>
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
          <div>Page ${page1Number} of ${totalPages}</div>
        </div>
      </div>
      
      ${allPropertyPagesHTML}
      
      <!-- PAGE 2: Employment & Income -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Employment & Income</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <div class="two-columns" style="align-items: flex-start;">
            <div class="column">
              <div class="section" style="margin-bottom: 16px;">
                <div class="section-header gold">Primary Contact - Employment</div>
                ${generateEmploymentTable(primaryEmployment, true)}
              </div>
              <div class="section">
                <div class="section-header">Secondary Contact - Employment</div>
                ${generateEmploymentTable(secondaryEmployment, false)}
              </div>
            </div>
            <div class="column">
              <div class="section" style="margin-bottom: 16px;">
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
          <div>Page ${employmentPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
      <!-- PAGE 3: Assets, Liabilities & Expenses -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Assets, Liabilities & Expenses</div>
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
              <div class="section" style="margin-bottom: 16px;">
                <div class="section-header">Liabilities</div>
                ${generateLiabilitiesTable()}
              </div>
              <div class="section">
                <div class="section-header" style="background: linear-gradient(135deg, ${NPC_COLORS.warning} 0%, ${NPC_COLORS.goldDark} 100%); border-left-color: ${NPC_COLORS.darkBlue};">
                  <span class="section-header-text">💸 Personal Expenses</span>
                </div>
                ${generateExpensesTable()}
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
          <div>Page ${assetsPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
      <!-- PAGE 4: Portfolio Summary -->
      <div class="page">
        <div class="page-header">
          <div class="header-title-group">
            <div class="header-title">Portfolio Summary</div>
            <div class="header-subtitle">CLIENT PORTFOLIO FORM</div>
          </div>
        </div>
        <div class="page-content">
          <!-- KPI Cards - Uses filtered property calculations based on toggle -->
          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="kpi-icon">🏠</span>
              <div class="kpi-label">TOTAL PORTFOLIO VALUE</div>
              <div class="kpi-value">${formatCurrency(totalValue)}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-icon">💳</span>
              <div class="kpi-label">TOTAL DEBT</div>
              <div class="kpi-value">${formatCurrency(totalLoans)}</div>
            </div>
            <div class="kpi-card">
              <span class="kpi-icon">📈</span>
              <div class="kpi-label">PORTFOLIO EQUITY</div>
              <div class="kpi-value ${summaryEquity >= 0 ? 'positive' : 'negative'}">${formatCurrency(summaryEquity)}</div>
            </div>
          </div>
          
          <div class="summary-box">
            <div class="summary-title">📊 Monthly Cashflow Analysis</div>
            <table class="data-table alt-rows compact">
              <tr><td class="label">Total Monthly Income</td><td class="value currency income-value">${formatCurrency(client.total_monthly_income || 0)}</td></tr>
              <tr><td class="label">Total Monthly Expenditure</td><td class="value currency">${formatCurrency(client.total_monthly_expenditure || 0)}</td></tr>
              <tr class="cashflow-row ${(client.net_monthly_cash_flow || totalNetCF || 0) >= 0 ? 'cf-positive-row' : 'cf-negative-row'}">
                <td class="label"><strong>Net Monthly Cash Flow</strong></td>
                <td class="value currency">
                  ${getCashflowIndicator(client.net_monthly_cash_flow || totalNetCF)}
                  <strong>${formatCurrency(client.net_monthly_cash_flow || totalNetCF)}</strong>
                </td>
              </tr>
            </table>
          </div>
          
          <div class="section" style="margin-top: 16px;">
            <div class="section-header gold">Properties Overview</div>
            <table class="financial-table">
              <thead>
                <tr>
                  <th>PROPERTY</th>
                  <th class="text-right">VALUE</th>
                  <th class="text-right">LOAN</th>
                  <th class="text-right">RENTAL</th>
                  <th class="text-right">NET CF</th>
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
          <div>Page ${summaryPageNumber} of ${totalPages}</div>
        </div>
      </div>
      
      <!-- FINAL PAGE - Contact & Disclaimer -->
      <div class="page final-page" style="background-color: #141414; display: flex; flex-direction: column; justify-content: flex-start; padding: 60px 40px;">
        <div style="color: #BF9B50; font-size: 28px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">NAIDU PROPERTY CONSULTING</div>
        <div style="color: #BF9B50; font-size: 16px; font-weight: normal; text-transform: uppercase; margin-bottom: 30px;">SERVICES</div>
        
        <div style="color: #BF9B50; font-size: 14px; font-weight: bold; margin-bottom: 20px;">CONTACT US</div>
        
        <table style="border-collapse: collapse; margin-bottom: auto;">
          <tr style="height: 28px;"><td style="color: #BF9B50; font-size: 9px; font-weight: bold; padding-right: 20px; white-space: nowrap;">WEBSITE:</td><td style="color: #BF9B50; font-size: 9px;">npcservices.com.au</td></tr>
          <tr style="height: 28px;"><td style="color: #BF9B50; font-size: 9px; font-weight: bold; padding-right: 20px; white-space: nowrap;">EMAIL:</td><td style="color: #BF9B50; font-size: 9px;">admin@npcservices.com.au</td></tr>
          <tr style="height: 28px;"><td style="color: #BF9B50; font-size: 9px; font-weight: bold; padding-right: 20px; white-space: nowrap;">PHONE:</td><td style="color: #BF9B50; font-size: 9px;">(02) 8609 3299</td></tr>
          <tr style="height: 28px;"><td style="color: #BF9B50; font-size: 9px; font-weight: bold; padding-right: 20px; white-space: nowrap;">ADDRESS:</td><td style="color: #BF9B50; font-size: 9px;">Level 5 Nexus Norwest, 4 Columbia Ct, Norwest NSW 2153</td></tr>
          <tr style="height: 28px;"><td style="color: #BF9B50; font-size: 9px; font-weight: bold; padding-right: 20px; white-space: nowrap;">ABN:</td><td style="color: #BF9B50; font-size: 9px;">50 684 555 771</td></tr>
        </table>
        
        <div style="color: #999999; font-size: 8.5px; line-height: 1.4; margin-top: auto; padding-bottom: 20px;">
          As a Professional Property Consultant &amp; Buyers Agent, we provide information and advice based on our expertise and experience in the real estate market. Please be aware that the advice and insights offered are for general informational purposes only and should not be considered financial advice. While we strive to ensure the accuracy and relevance of the information provided, real estate markets are dynamic and subject to change and cannot guarantee the future performance or outcomes of any property investment. It is important to understand that real estate investments carry risks, including market fluctuations, changes in property values, and potential financial losses. Our services include assisting you in identifying and evaluating potential opportunities, negotiating purchase terms, and navigating the transaction process. Any decisions to purchase, sell, or invest in real estate should be made after careful consideration and consultation with appropriate financial, legal, and tax advisors. By engaging our services, you acknowledge that you have read and understood this disclaimer and agree to take full responsibility for your property-related decisions. Always conduct your own research and due diligence to ensure that any property transaction aligns with your financial objectives and risk profile.
        </div>
      </div>
    </body>
    </html>
  `;
}
