import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { ClientNotes } from './ClientNotes';
import { ClientTags } from './ClientTags';
import { ClientReminders } from './ClientReminders';
import { ClientActivityTimeline } from './ClientActivityTimeline';
import { ClientFiles } from './ClientFiles';
import { ClientScoreCard } from './ClientScoreCard';
import { ClientAIInsights } from './ClientAIInsights';

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
  // Fetch full client details
  const { data: fullClient } = useQuery({
    queryKey: ['client-details', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ['client-properties', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch employment
  const { data: employment = [] } = useQuery({
    queryKey: ['client-employment', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_employment')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch income
  const { data: income = [] } = useQuery({
    queryKey: ['client-income', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_income')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch assets
  const { data: assets = [] } = useQuery({
    queryKey: ['client-assets', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_assets')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch liabilities
  const { data: liabilities = [] } = useQuery({
    queryKey: ['client-liabilities', client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_liabilities')
        .select('*')
        .eq('client_id', client.id);
      if (error) throw error;
      return data;
    },
    enabled: open
  });

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {client.primary_first_name} {client.primary_surname}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="properties">Properties ({properties.length})</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="reminders">Reminders</TabsTrigger>
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

            <TabsContent value="properties" className="space-y-4 mt-4">
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
                          <Badge variant={property.property_type === 'owner_occupied' ? 'default' : 'secondary'}>
                            {property.property_type === 'owner_occupied' ? 'Owner Occupied' : 'Investment'}
                          </Badge>
                          <CardTitle className="text-base font-medium mt-2 flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {property.address}
                          </CardTitle>
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
                      {property.property_type === 'investment' && (
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
            </TabsContent>

            <TabsContent value="employment" className="space-y-4 mt-4">
              {employment.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No employment records
                  </CardContent>
                </Card>
              ) : (
                employment.map((emp) => (
                  <Card key={emp.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="mb-2">
                            {emp.contact_type === 'primary' ? 'Primary' : 'Secondary'} Contact
                          </Badge>
                          <h4 className="font-medium">{emp.employer_name || 'Unknown Employer'}</h4>
                          <p className="text-sm text-muted-foreground">{emp.occupation_role}</p>
                        </div>
                        <Badge>{emp.employment_type}</Badge>
                      </div>
                      {emp.start_date && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Started: {formatDate(emp.start_date)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="financials" className="space-y-4 mt-4">
              {/* Income */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Income
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {income.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No income records</p>
                  ) : (
                    <div className="space-y-3">
                      {income.map((inc) => (
                        <div key={inc.id} className="border-b pb-3 last:border-0">
                          <Badge variant="outline" className="mb-2">
                            {inc.contact_type === 'primary' ? 'Primary' : 'Secondary'} Contact
                          </Badge>
                          <div className="grid gap-2 md:grid-cols-4 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Gross Salary</p>
                              <p className="font-medium">{formatCurrency(Number(inc.gross_salary))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Bonus</p>
                              <p className="font-medium">{formatCurrency(Number(inc.bonus))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Commission</p>
                              <p className="font-medium">{formatCurrency(Number(inc.commission))}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Other Income</p>
                              <p className="font-medium">{formatCurrency(Number(inc.other_taxable_income))}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Assets */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <PiggyBank className="h-4 w-4" />
                    Assets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {assets.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No assets recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {assets.map((asset) => (
                        <div key={asset.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <Badge variant="secondary" className="mb-1">{asset.asset_type}</Badge>
                            <p className="text-sm">{asset.description || asset.make_model || asset.institution_name || '-'}</p>
                          </div>
                          <p className="font-medium">{formatCurrency(Number(asset.value))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Liabilities */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Liabilities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {liabilities.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No liabilities recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {liabilities.map((liability) => (
                        <div key={liability.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <Badge variant="destructive" className="mb-1">{liability.liability_type}</Badge>
                            <p className="text-sm">{liability.provider_name || '-'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-red-600">{formatCurrency(Number(liability.current_balance))}</p>
                            {liability.monthly_repayment && (
                              <p className="text-xs text-muted-foreground">{formatCurrency(Number(liability.monthly_repayment))}/mo</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
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

            <TabsContent value="files" className="mt-4">
              <ClientFiles clientId={client.id} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ClientActivityTimeline clientId={client.id} />
            </TabsContent>

            <TabsContent value="insights" className="mt-4 space-y-4">
              <ClientScoreCard clientId={client.id} />
              <ClientTags clientId={client.id} />
              <ClientAIInsights clientId={client.id} />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
