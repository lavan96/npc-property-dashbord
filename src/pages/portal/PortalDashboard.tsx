import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalDashboardData } from '@/hooks/usePortalData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2, User, Briefcase, Mail, FileText,
  DollarSign, Home, TrendingUp, Loader2, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

const quickLinks = [
  { to: '/client/profile', icon: User, label: 'My Profile', desc: 'View and update your personal details' },
  { to: '/client/properties', icon: Building2, label: 'Properties', desc: 'View your property portfolio' },
  { to: '/client/employment', icon: Briefcase, label: 'Employment & Finances', desc: 'Employment and income details' },
  { to: '/client/emails', icon: Mail, label: 'Correspondence', desc: 'View email communications' },
  { to: '/client/documents', icon: FileText, label: 'Documents', desc: 'Access your uploaded documents' },
];

function formatCurrency(val?: number | null): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function getDealStageBadge(stage?: string) {
  if (!stage) return null;
  const colors: Record<string, string> = {
    'New Lead': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'Initial Consultation': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'Pre-Approval': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    'Property Search': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    'Under Contract': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    'Settlement': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Settled': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  return <Badge className={colors[stage] || 'bg-muted text-muted-foreground'}>{stage}</Badge>;
}

export default function PortalDashboard() {
  const { user } = usePortalAuth();
  const { data, isLoading, error } = usePortalDashboardData();

  const client = data?.client;
  const properties = data?.properties || [];
  const deals = data?.deals || [];
  const borrowingCapacity = data?.borrowingCapacity;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Welcome back, {client?.primary_first_name || user?.name || 'Client'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's an overview of your property portfolio and account.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Unable to load your data. Please try again later.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Home className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Properties</p>
                    <p className="text-2xl font-bold text-foreground">{properties.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10">
                    <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Portfolio Value</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(client?.total_portfolio_value)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10">
                    <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Rental Income</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(client?.total_monthly_rental_income)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10">
                    <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Borrowing Power</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(borrowingCapacity?.borrowing_capacity || client?.borrowing_capacity)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Deals */}
          {deals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Deals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deals.slice(0, 5).map((deal: any) => (
                    <div key={deal.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/50">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-foreground">{deal.property_address || 'New Deal'}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{deal.deal_type?.replace(/_/g, ' ') || 'Purchase'}</span>
                          {deal.loan_amount && (
                            <>
                              <span>•</span>
                              <span>{formatCurrency(deal.loan_amount)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {getDealStageBadge(deal.current_stage)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Properties Preview */}
          {properties.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Your Properties</CardTitle>
                <Link to="/client/properties" className="text-sm text-primary hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {properties.slice(0, 4).map((prop: any) => (
                    <div key={prop.id} className="p-4 rounded-lg border border-border bg-card hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">{prop.address}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="capitalize">{prop.property_type?.replace(/_/g, ' ')}</span>
                            {prop.value && <span>• {formatCurrency(prop.value)}</span>}
                          </div>
                          {prop.monthly_rental_income && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                              {formatCurrency(prop.monthly_rental_income)}/mo rental
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Quick Links */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  <Card className="hover:shadow-md transition-all cursor-pointer h-full hover:border-primary/30">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <link.icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base">{link.label}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{link.desc}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
