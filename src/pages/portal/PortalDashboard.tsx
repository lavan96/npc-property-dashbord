import { usePortalAuth } from '@/hooks/usePortalAuth';
import { usePortalDashboardData } from '@/hooks/usePortalData';
import { smartCapitalize } from '@/lib/nameUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Building2, User, Briefcase, Mail, FileText,
  DollarSign, Home, TrendingUp, Loader2, ArrowRight,
  Sparkles, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

const quickLinks = [
  { to: '/client/profile', icon: User, label: 'My Profile', desc: 'View and update your personal details', color: 'from-blue-500/10 to-indigo-500/10' },
  { to: '/client/properties', icon: Building2, label: 'Properties', desc: 'View your property portfolio', color: 'from-emerald-500/10 to-teal-500/10' },
  { to: '/client/employment', icon: Briefcase, label: 'Employment & Finances', desc: 'Employment and income details', color: 'from-amber-500/10 to-orange-500/10' },
  { to: '/client/emails', icon: Mail, label: 'Correspondence', desc: 'View email communications', color: 'from-purple-500/10 to-fuchsia-500/10' },
  { to: '/client/documents', icon: FileText, label: 'Documents', desc: 'Access your uploaded documents', color: 'from-rose-500/10 to-pink-500/10' },
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

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function PortalDashboard() {
  const { user } = usePortalAuth();
  const { data, isLoading, error } = usePortalDashboardData();

  const client = data?.client;
  const properties = data?.properties || [];
  const deals = data?.deals || [];
  const borrowingCapacity = data?.borrowingCapacity;
  const displayName = smartCapitalize(client?.primary_first_name || user?.name);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6 md:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <Avatar className="h-14 w-14 border-2 border-primary/20 shadow-lg hidden sm:flex">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary/60" />
              <span className="text-xs font-medium text-primary/70 uppercase tracking-widest">Welcome back</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {displayName || 'Client'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Here's an overview of your property portfolio and account.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
          </div>
        </div>
      ) : error ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-8 text-center">
            <p className="text-destructive font-medium">Unable to load your data.</p>
            <p className="text-muted-foreground text-sm mt-1">Please try refreshing the page.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Properties', value: properties.length.toString(), icon: Home, gradient: 'from-primary/10 to-primary/5', iconColor: 'text-primary' },
              { label: 'Portfolio Value', value: formatCurrency(client?.total_portfolio_value), icon: DollarSign, gradient: 'from-emerald-500/10 to-emerald-500/5', iconColor: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Rental Income', value: formatCurrency(client?.total_monthly_rental_income), suffix: '/mo', icon: TrendingUp, gradient: 'from-blue-500/10 to-blue-500/5', iconColor: 'text-blue-600 dark:text-blue-400' },
              { label: 'Borrowing Power', value: formatCurrency(borrowingCapacity?.borrowing_capacity || client?.borrowing_capacity), icon: Briefcase, gradient: 'from-purple-500/10 to-purple-500/5', iconColor: 'text-purple-600 dark:text-purple-400' },
            ].map((stat) => (
              <Card key={stat.label} className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6 relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-50`} />
                  <div className="relative flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-background/80 shadow-sm">
                      <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{stat.label}</p>
                      <p className="text-xl font-bold text-foreground mt-0.5">
                        {stat.value}
                        {stat.suffix && <span className="text-xs text-muted-foreground font-normal">{stat.suffix}</span>}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Active Deals */}
          {deals.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Active Deals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deals.slice(0, 5).map((deal: any) => (
                    <div key={deal.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-foreground">{deal.property_address || 'New Deal'}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{deal.deal_type?.replace(/_/g, ' ') || 'Purchase'}</span>
                          {deal.loan_amount && (
                            <>
                              <span className="text-border">•</span>
                              <span className="font-medium">{formatCurrency(deal.loan_amount)}</span>
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
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg font-semibold">Your Properties</CardTitle>
                <Link to="/client/properties" className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {properties.slice(0, 4).map((prop: any) => (
                    <div key={prop.id} className="p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/20 transition-all duration-200 group">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 shrink-0 group-hover:bg-primary/15 transition-colors">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-foreground truncate">{prop.address}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="capitalize">{prop.property_type?.replace(/_/g, ' ')}</span>
                            {prop.value && <span>• {formatCurrency(prop.value)}</span>}
                          </div>
                          {prop.monthly_rental_income && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">
                              {formatCurrency(prop.monthly_rental_income)}/mo rental
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-1" />
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
                  <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer h-full hover:border-primary/20 hover:-translate-y-0.5 group overflow-hidden border-0 shadow-sm">
                    <div className={`absolute inset-0 bg-gradient-to-br ${link.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                    <CardHeader className="pb-2 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                            <link.icon className="h-5 w-5 text-primary" />
                          </div>
                          <CardTitle className="text-base font-semibold">{link.label}</CardTitle>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardHeader>
                    <CardContent className="relative">
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