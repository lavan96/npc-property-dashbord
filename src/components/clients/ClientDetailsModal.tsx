import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { useSecureClientData } from '@/hooks/useSecureClientData';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PortfolioAnalysisConfig, PortfolioAnalysisSettings, DEFAULT_SETTINGS } from '@/components/clients/review-wizard/PortfolioAnalysisConfig';
import {
  User,
  Building2,
  Briefcase,
  DollarSign,
  PiggyBank,
  CreditCard,
  TrendingUp,
  TrendingDown,
  MapPin,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Tag,
  Bell,
  Activity,
  FileUp,
  Sparkles,
  UserCog,
  Send,
  Loader2,
  Settings,
  Edit,
  Landmark,
  ClipboardCheck,
  Inbox,
} from 'lucide-react';
import { format } from 'date-fns';
import { ClientNotes } from './ClientNotes';
import { ClientTags } from './ClientTags';
import { ClientReminders } from './ClientReminders';
import { ClientActivityTimeline } from './ClientActivityTimeline';
import { ClientFiles } from './ClientFiles';
import { ClientScoreCard } from './ClientScoreCard';
import { BorrowingCapacityCard, BorrowingCapacityModal } from '@/components/borrowing-capacity';
import { ClientAIInsights } from './ClientAIInsights';
import { ClientVownetUpload } from './ClientVownetUpload';
import { ClientVownetForms } from './ClientVownetForms';
import { PropertyManualEntry } from './PropertyManualEntry';
import { PersonalDetailsManualEntry } from './PersonalDetailsManualEntry';
import { EmploymentManualEntry } from './EmploymentManualEntry';
import { useClientContacts } from './hooks/useClientContacts';
import { IncomeManualEntry } from './IncomeManualEntry';
import { AssetManualEntry } from './AssetManualEntry';
import { LiabilityManualEntry } from './LiabilityManualEntry';
import { ExpenseManualEntry } from './ExpenseManualEntry';
import { ExportVownetButton } from './ExportVownetButton';
import { ClientEmailCompose } from './ClientEmailCompose';
import { ClientReportsTab } from './ClientReportsTab';
import { VownetPDFGenerator } from './VownetPDFGenerator';
import { PropertyEditSheet } from './PropertyEditSheet';
import { ClientPropertyInvestmentReport } from './ClientPropertyInvestmentReport';
import { CGTCalculator } from './CGTCalculator';
import { ClientPortfolioActions } from './ClientPortfolioActions';
import { ReviewWizard } from './review-wizard';
import { ClientEmailsTab } from './ClientEmailsTab';
import { toast } from 'sonner';
interface ClientDetailsModalProps {
  client: {
    id: string;
    primary_first_name: string;
    primary_surname: string;
    primary_email: string | null;
    primary_mobile: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientDetailsModal({ client, open, onOpenChange }: ClientDetailsModalProps) {
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [pdfAttachment, setPdfAttachment] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [isGeneratingPortfolio, setIsGeneratingPortfolio] = useState(false);
  const [portfolioAnalysisConfig, setPortfolioAnalysisConfig] = useState<PortfolioAnalysisSettings>(DEFAULT_SETTINGS);
  const [showPortfolioConfig, setShowPortfolioConfig] = useState(false);
  const [portfolioEmailSubject, setPortfolioEmailSubject] = useState('');
  const [portfolioEmailBody, setPortfolioEmailBody] = useState('');
  const [editingProperty, setEditingProperty] = useState<any>(null);
  const [showReviewWizard, setShowReviewWizard] = useState(false);
  const [showBorrowingCalculator, setShowBorrowingCalculator] = useState(false);

  // Handle PDF email callback (for finance)
  const handlePdfEmailClick = (pdfBlob: Blob, fileName: string) => {
    setPdfAttachment({ blob: pdfBlob, fileName });
    setShowEmailCompose(true);
    toast.success('PDF attached to email');
  };

  // Handle "Send Portfolio to Client" - generates portfolio PDF and opens email with template
  const handleSendPortfolioToClient = async () => {
    if (!client.primary_email) {
      toast.error('Client does not have an email address');
      return;
    }

    if (properties.length === 0) {
      toast.error('Client has no properties for portfolio analysis');
      return;
    }

    setIsGeneratingPortfolio(true);
    
    try {
      // Generate portfolio analysis
      const { data, error } = await invokeSecureFunction('generate-portfolio-analysis', {
        clientId: client.id,
        investorProfile: 'general',
        analysisDepth: 'comprehensive',
        includeProjections: true,
        projectionYears: portfolioAnalysisConfig?.projectionPeriod || 10,
        analysisConfig: portfolioAnalysisConfig,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Analysis generation failed');

      // Set templated email content
      const clientFirstName = client.primary_first_name;
      setPortfolioEmailSubject(`Your Portfolio Analysis Report - ${clientFirstName} ${client.primary_surname}`);
      setPortfolioEmailBody(
`Dear ${clientFirstName},

Please find attached your comprehensive Portfolio Performance Analysis report.

This report includes:
• Executive summary of your portfolio health
• Detailed analysis of each property
• Risk assessment and mitigation strategies
• 10-year growth projections
• Strategic recommendations

If you have any questions about the report or would like to discuss your investment strategy, please don't hesitate to reach out.

Best regards,
NPC Team`
      );

      // Generate PDF from analysis data - store in session for email attachment
      toast.success('Portfolio analysis ready. Preparing email...');
      
      // Open email compose with template
      setPdfAttachment(null); // Clear any existing attachment
      setShowEmailCompose(true);
      
    } catch (error: any) {
      console.error('Portfolio generation error:', error);
      toast.error('Failed to generate portfolio: ' + error.message);
    } finally {
      setIsGeneratingPortfolio(false);
    }
  };

  const queryClient = useQueryClient();

  // Use secure data fetching hook - fetches all client data via Edge Function with fallback
  const { data: secureData, refetch: refetchSecureData } = useSecureClientData({
    clientId: client.id,
    include: {
      client: true,
      properties: true,
      employment: true,
      income: true,
      assets: true,
      liabilities: true,
      additionalContacts: true,
    },
    enabled: open,
  });

  // Extract data from secure response
  const fullClient = secureData?.client || null;
  const properties = secureData?.properties || [];
  const employment = secureData?.employment || [];
  const income = secureData?.income || [];
  const assets = secureData?.assets || [];
  const liabilities = secureData?.liabilities || [];
  const additionalContacts = secureData?.additionalContacts || [];

  // Build dynamic contact list for employment/income tabs
  const contacts = useClientContacts(fullClient || undefined, additionalContacts);

  // Refetch function for backward compatibility
  const refetchClient = () => {
    refetchSecureData();
    // Also invalidate legacy query keys for components that might still use them
    queryClient.invalidateQueries({ queryKey: ['client-details', client.id] });
    queryClient.invalidateQueries({ queryKey: ['client-properties', client.id] });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd MMM yyyy');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {client.primary_first_name} {client.primary_surname}
              </DialogTitle>
              <DialogDescription className="sr-only">
                View and manage client details, properties, and reports
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              {/* Send to Finance - Vownet Form */}
              <VownetPDFGenerator
                data={{
                  client: (fullClient || {
                    id: client.id,
                    primary_first_name: client.primary_first_name,
                    primary_surname: client.primary_surname,
                    primary_email: client.primary_email,
                    primary_mobile: client.primary_mobile,
                  }) as any,
                  properties: properties as any[],
                  employment: employment as any[],
                  income: income as any[],
                  assets: assets as any[],
                  liabilities: liabilities as any[],
                }}
                clientName={`${client.primary_first_name} ${client.primary_surname}`}
                onEmailClick={handlePdfEmailClick}
                buttonLabel="Send to Finance"
              />
              
              {/* Start Portfolio Review */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReviewWizard(true)}
                disabled={properties.length === 0}
                title={properties.length === 0 ? 'Add properties to start a review' : 'Start portfolio review wizard'}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Start Review
              </Button>
              
              {/* Send Portfolio to Client */}
              <Button
                variant="default"
                size="sm"
                onClick={handleSendPortfolioToClient}
                disabled={isGeneratingPortfolio || properties.length === 0 || !client.primary_email}
                title={!client.primary_email ? 'Client has no email' : properties.length === 0 ? 'No properties to analyze' : 'Send portfolio analysis to client'}
              >
                {isGeneratingPortfolio ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Portfolio to Client
              </Button>
            </div>
          </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="personal">Personal Details</TabsTrigger>
              <TabsTrigger value="properties">Properties ({properties.length})</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="emails">
                <Inbox className="h-3 w-3 mr-1" />
                Emails
              </TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="reminders">Reminders</TabsTrigger>
              <TabsTrigger value="vownet-forms">VowNet Forms</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="insights">AI Insights</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Contact Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Primary Contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{fullClient?.primary_first_name} {fullClient?.primary_middle_name} {fullClient?.primary_surname}</span>
                    </div>
                    {fullClient?.primary_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{fullClient.primary_email}</span>
                      </div>
                    )}
                    {fullClient?.primary_mobile && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{fullClient.primary_mobile}</span>
                      </div>
                    )}
                    {fullClient?.primary_dob && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(fullClient.primary_dob)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {fullClient?.secondary_first_name && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Secondary Contact</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{fullClient.secondary_first_name} {fullClient.secondary_middle_name} {fullClient.secondary_surname}</span>
                      </div>
                      {fullClient.secondary_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{fullClient.secondary_email}</span>
                        </div>
                      )}
                      {fullClient.secondary_mobile && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{fullClient.secondary_mobile}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Portfolio Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Portfolio Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
                      <p className="text-xl font-bold">{formatCurrency(Number(fullClient?.total_portfolio_value))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Debt</p>
                      <p className="text-xl font-bold">{formatCurrency(Number(fullClient?.total_debt))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Monthly Cash Flow</p>
                      <p className={`text-xl font-bold flex items-center gap-1 ${Number(fullClient?.net_monthly_cash_flow) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Number(fullClient?.net_monthly_cash_flow) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {formatCurrency(Number(fullClient?.net_monthly_cash_flow))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Personal Details Tab - Vownet Mirror */}
            <TabsContent value="personal" className="mt-4">
              <PersonalDetailsManualEntry 
                clientId={client.id} 
                clientData={fullClient ? {
                  primary_first_name: fullClient.primary_first_name,
                  primary_middle_name: fullClient.primary_middle_name,
                  primary_surname: fullClient.primary_surname,
                  primary_mobile: fullClient.primary_mobile,
                  primary_email: fullClient.primary_email,
                  primary_gender: fullClient.primary_gender,
                  primary_dob: fullClient.primary_dob,
                  secondary_first_name: fullClient.secondary_first_name,
                  secondary_middle_name: fullClient.secondary_middle_name,
                  secondary_surname: fullClient.secondary_surname,
                  secondary_mobile: fullClient.secondary_mobile,
                  secondary_email: fullClient.secondary_email,
                  secondary_gender: fullClient.secondary_gender,
                  secondary_dob: fullClient.secondary_dob,
                  current_address: fullClient.current_address,
                  country: fullClient.country,
                  living_situation: fullClient.living_situation,
                  residential_status: fullClient.residential_status,
                  marital_status: fullClient.marital_status,
                  dependents_count: fullClient.dependents_count,
                } : undefined}
                additionalContacts={additionalContacts.map(c => ({
                  id: c.id,
                  client_id: c.client_id,
                  relationship: c.relationship,
                  first_name: c.first_name,
                  surname: c.surname,
                  middle_name: c.middle_name,
                  email: c.email,
                  mobile: c.mobile,
                  dob: c.dob,
                  gender: c.gender,
                  display_order: c.display_order,
                }))}
                onComplete={() => refetchClient()} 
              />
            </TabsContent>

            <TabsContent value="properties" className="space-y-4 mt-4">
              {/* Property Actions Bar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <PropertyManualEntry 
                    clientId={client.id} 
                    onComplete={() => {
                      refetchClient();
                    }} 
                  />
                  <ExportVownetButton 
                    clientId={client.id} 
                    clientName={`${client.primary_first_name} ${client.primary_surname}`}
                  />
                </div>
              </div>

              {/* Vownet Upload Section */}
              <ClientVownetUpload
                clientId={client.id}
                clientName={`${client.primary_first_name} ${client.primary_surname}`}
                existingProperties={properties.map(p => ({
                  id: p.id,
                  address: p.address,
                  property_type: p.property_type,
                  value: p.value ? Number(p.value) : null
                }))}
                onComplete={() => {
                  refetchClient();
                }}
              />

              {/* Portfolio Actions - Analysis & Comparison */}
              <ClientPortfolioActions
                clientId={client.id}
                clientName={`${client.primary_first_name} ${client.primary_surname}`}
                properties={properties.map(p => ({
                  id: p.id,
                  address: p.address,
                  property_type: p.property_type,
                  value: p.value ? Number(p.value) : null
                }))}
              />

              {properties.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No properties recorded
                  </CardContent>
                </Card>
              ) : (
                properties.map((property) => (
                  <Card key={property.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge 
                            variant={property.property_type === 'owner_occupied' ? 'default' : property.property_type === 'smsf' ? 'outline' : 'secondary'}
                            className={property.property_type === 'smsf' ? 'border-amber-500 text-amber-700 bg-amber-50' : ''}
                          >
                            {property.property_type === 'owner_occupied' ? (
                              <>Owner Occupied</>
                            ) : property.property_type === 'smsf' ? (
                              <span className="flex items-center gap-1">
                                <Landmark className="h-3 w-3" />
                                SMSF
                              </span>
                            ) : (
                              'Investment'
                            )}
                          </Badge>
                          {/* Sourced By Badge */}
                          {property.sourced_by && property.sourced_by !== 'unknown' && (
                            <Badge 
                              variant={property.sourced_by === 'npc' ? 'default' : 'outline'}
                              className={
                                property.sourced_by === 'npc' 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                  : property.sourced_by === 'self_sourced'
                                    ? 'border-blue-500 text-blue-700 bg-blue-50'
                                    : 'border-orange-500 text-orange-700 bg-orange-50'
                              }
                            >
                              {property.sourced_by === 'npc' ? '🏆 NPC Sourced' 
                                : property.sourced_by === 'self_sourced' ? 'Self Sourced' 
                                : property.sourced_by === 'other_agency' ? 'Other Agency' 
                                : property.sourced_by}
                            </Badge>
                          )}
                          <CardTitle className="text-base font-medium mt-2 flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {property.address}
                          </CardTitle>
                          {property.property_type === 'smsf' && property.smsf_fund_name && (
                            <p className="text-xs text-muted-foreground mt-1">{property.smsf_fund_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Investment Report Button - only for investment properties */}
                          {(property.property_type === 'investment' || property.property_type === 'smsf') && (
                            <ClientPropertyInvestmentReport
                              property={property as any}
                              clientId={client.id}
                              clientName={`${client.primary_first_name} ${client.primary_surname}`}
                            />
                          )}
                          <CGTCalculator
                            property={property as any}
                            clientGrossAnnualIncome={income.reduce((sum: number, inc: any) => sum + (Number(inc.gross_salary) || 0), 0) || Number(fullClient?.total_monthly_income || 0) * 12}
                          />
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingProperty(property)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Value</p>
                          <p className="font-medium">{formatCurrency(Number(property.value))}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Loan Remaining</p>
                          <p className="font-medium">{formatCurrency(Number(property.loan_remaining))}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Interest Rate</p>
                          <p className="font-medium">{property.interest_rate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Ownership</p>
                          <p className="font-medium">{property.ownership_percentage}%</p>
                        </div>
                      </div>
                      {(property.property_type === 'investment' || property.property_type === 'smsf') && (
                        <>
                          <Separator className="my-4" />
                          <div className="grid gap-4 md:grid-cols-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Monthly Rental Income</p>
                              <p className="font-medium text-green-600">{formatCurrency(Number(property.monthly_rental_income))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Monthly Expenses</p>
                              <p className="font-medium text-red-600">{formatCurrency(Number(property.total_monthly_expenditure))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Net Cash Flow</p>
                              <p className={`font-medium ${Number(property.net_monthly_cashflow) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(Number(property.net_monthly_cashflow))}
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Property Edit Sheet */}
              {editingProperty && (
                <PropertyEditSheet
                  property={editingProperty}
                  open={!!editingProperty}
                  onOpenChange={(open) => !open && setEditingProperty(null)}
                  onComplete={() => {
                    setEditingProperty(null);
                    refetchClient();
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="employment" className="space-y-4 mt-4">
              <EmploymentManualEntry clientId={client.id} contacts={contacts} onComplete={() => refetchClient()} />
            </TabsContent>

            <TabsContent value="financials" className="space-y-6 mt-4">
              {/* Income Section */}
              <IncomeManualEntry clientId={client.id} contacts={contacts} onComplete={() => refetchClient()} />
              
              <Separator />
              
              {/* Living Expenses Section */}
              <ExpenseManualEntry clientId={client.id} onComplete={() => refetchClient()} />
              
              <Separator />
              
              {/* Assets Section */}
              <AssetManualEntry clientId={client.id} onComplete={() => refetchClient()} />
              
              <Separator />
              
              {/* Liabilities Section */}
              <LiabilityManualEntry clientId={client.id} onComplete={() => refetchClient()} />
            </TabsContent>

            <TabsContent value="reports" className="mt-4">
              <ClientReportsTab
                clientId={client.id}
                clientName={`${client.primary_first_name} ${client.primary_surname}`}
                clientEmail={client.primary_email}
                fullClient={fullClient}
                properties={properties}
                employment={employment}
                income={income}
                assets={assets}
                liabilities={liabilities}
                onEmailClick={handlePdfEmailClick}
                onOpenEmailCompose={() => { setPdfAttachment(null); setShowEmailCompose(true); }}
              />
            </TabsContent>

            <TabsContent value="emails" className="mt-4">
              <ClientEmailsTab clientId={client.id} clientName={`${client.primary_first_name} ${client.primary_surname}`} />
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Activity Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ClientNotes clientId={client.id} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reminders" className="mt-4">
              <ClientReminders clientId={client.id} />
            </TabsContent>

            <TabsContent value="vownet-forms" className="mt-4">
              <ClientVownetForms 
                clientId={client.id}
                clientName={`${client.primary_first_name} ${client.primary_surname}`}
              />
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <ClientFiles 
                clientId={client.id} 
                onSendEmail={(attachment) => {
                  setShowEmailCompose(true);
                }}
              />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ClientActivityTimeline clientId={client.id} />
            </TabsContent>

            <TabsContent value="insights" className="mt-4 space-y-4">
              <ClientScoreCard clientId={client.id} />
              <BorrowingCapacityCard 
                clientId={client.id}
                clientName={`${client.primary_first_name || ''} ${client.primary_surname || ''}`.trim()}
                onOpenCalculator={() => setShowBorrowingCalculator(true)}
              />
              <ClientTags clientId={client.id} />
              <ClientAIInsights clientId={client.id} />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Email Compose Modal */}
    <ClientEmailCompose
      open={showEmailCompose}
      onOpenChange={(open) => {
        setShowEmailCompose(open);
        if (!open) {
          // Clear template when modal closes
          setPortfolioEmailSubject('');
          setPortfolioEmailBody('');
        }
      }}
      clientId={client.id}
      clientEmail={client.primary_email}
      clientName={`${client.primary_first_name} ${client.primary_surname}`}
      defaultSubject={portfolioEmailSubject || undefined}
      defaultBody={portfolioEmailBody || undefined}
    />

    {/* Portfolio Review Wizard */}
    <ReviewWizard
      clientId={client.id}
      clientName={`${client.primary_first_name} ${client.primary_surname}`}
      properties={properties}
      clientData={fullClient}
      isOpen={showReviewWizard}
      onClose={() => setShowReviewWizard(false)}
      onComplete={(reviewId) => {
        setShowReviewWizard(false);
        refetchClient();
        toast.success('Portfolio review completed successfully');
      }}
    />

    {/* Borrowing Capacity Calculator Modal */}
    <BorrowingCapacityModal
      clientId={client.id}
      open={showBorrowingCalculator}
      onOpenChange={setShowBorrowingCalculator}
    />
  </>
  );
}
