import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { useCountUp } from '@/hooks/useCountUp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users, ArrowRight, Loader2, ShieldCheck, Wallet, MessageSquare, FileText, TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useBrand } from '@/branding/useBrand';
import { smartCapitalize } from '@/lib/nameUtils';

/* ── Skeleton loaders ── */
function KpiSkeleton() {
  return (
    <Card className="relative overflow-hidden border border-border">
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      <CardHeader className="pb-2 flex flex-row items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12" />
        </div>
      </CardHeader>
    </Card>
  );
}

function QuickActionSkeleton() {
  return (
    <Card className="border border-border">
      <CardContent className="p-4 flex items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Animated KPI Card ── */
function KpiCard({
  label,
  value,
  icon: Icon,
  tooltip,
  accent = false,
  index = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tooltip: string;
  accent?: boolean;
  index?: number;
}) {
  const isNumber = typeof value === 'number';
  const animatedValue = useCountUp(isNumber ? value : 0, 1000, isNumber);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              'relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-default',
              accent
                ? 'border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card'
                : 'border-border bg-card'
            )}
          >
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardHeader className="pb-2 flex flex-row items-center gap-3">
              <div className={cn(
                'flex items-center justify-center h-10 w-10 rounded-xl shrink-0',
                accent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardDescription className="text-xs">{label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums mt-0.5">
                  {isNumber ? animatedValue : value}
                </CardTitle>
              </div>
            </CardHeader>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </motion.div>
  );
}

/* ── Quick Action Tile ── */
function QuickAction({
  to,
  icon: Icon,
  label,
  description,
  badge,
  index = 0,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  description: string;
  badge?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 + index * 0.08 }}
    >
      <Link to={to}>
        <Card className="group relative overflow-hidden border border-border bg-card hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all duration-300" />
          <CardContent className="p-4 flex items-center gap-4 relative">
            <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                {badge && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    {badge}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

/* ── Main Dashboard ── */
export default function FinancePortalDashboard() {
  const { user, invokeFinanceFunction } = useFinancePortalAuth();
  const { settings: brandSettings } = useBrand();
  const brandName = brandSettings.companyName || 'the team';

  const { data, isLoading } = useQuery({
    queryKey: ['finance-portal-clients', user?.id],
    queryFn: async () => {
      const { data, error } = await invokeFinanceFunction('finance-portal-client-data', {
        operation: 'list_assigned_clients',
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
  });

  const records = data?.records || [];
  const firstName = user?.name?.split(' ')[0] || 'Partner';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
        {/* Welcome header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Welcome back, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user?.company || 'Independent Finance Partner'} · {user?.email}
          </p>
        </motion.div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                label="Assigned Clients"
                value={records.length}
                icon={Users}
                tooltip={`Total clients currently assigned to you. Updated in real-time as ${brandName} assigns or reassigns clients.`}
                accent
                index={0}
              />
              <KpiCard
                label="Account Status"
                value="Active"
                icon={ShieldCheck}
                tooltip="Your partner account status. Active means your credentials and permissions are current."
                index={1}
              />
              <KpiCard
                label="Onboarding"
                value={user?.has_completed_onboarding ? 'Complete' : 'In progress'}
                icon={FileText}
                tooltip="Tracks whether you have completed the portal terms acceptance and onboarding walkthrough."
                index={2}
              />
            </>
          )}
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            <>
              <QuickActionSkeleton />
              <QuickActionSkeleton />
              <QuickActionSkeleton />
              <QuickActionSkeleton />
            </>
          ) : (
            <>
              <QuickAction
                to="/finance/clients"
                icon={Users}
                label="View All Clients"
                description="Browse and manage your assigned clients"
                index={0}
              />
              <QuickAction
                to="/finance/messages"
                icon={MessageSquare}
                label="Messages"
                description={`Communicate with ${brandName}`}
                index={1}
              />
              <QuickAction
                to="/finance/earnings"
                icon={Wallet}
                label="Earnings"
                description="Track commissions and statements"
                index={2}
              />
              <QuickAction
                to="/finance/earnings?highlight=latest"
                icon={TrendingUp}
                label="Latest Statement"
                description="View your most recent earnings update"
                badge="New"
                index={3}
              />
            </>
          )}
        </div>

        {/* Recent Clients */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="border border-border overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-primary" />
                  Recent Clients
                </CardTitle>
                <CardDescription>Quick access to your assigned clients.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="hidden sm:flex">
                <Link to="/finance/clients">View all <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 border rounded-xl p-3">
                      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-xl text-sm text-muted-foreground bg-muted/20">
                  No clients have been assigned to you yet. {brandName} will assign clients when ready.
                </div>
              ) : (
                <div className="space-y-2">
                  {records.slice(0, 5).map((r: any, i: number) => (
                    <motion.div
                      key={r.assignment_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.55 + i * 0.06 }}
                    >
                      <Link
                        to={`/finance/clients/${r.client_id}`}
                        className="group flex items-center justify-between border rounded-xl p-3 hover:border-primary/20 hover:bg-primary/5 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                            {(smartCapitalize(r.client?.primary_contact_name) || '?')[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm">
                              {smartCapitalize(r.client?.primary_contact_name) || '—'}
                              {r.client?.secondary_contact_name && (
                                <span className="text-muted-foreground font-normal text-xs ml-2">
                                  & {smartCapitalize(r.client.secondary_contact_name)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.client?.primary_contact_email || ''}
                              {r.assigned_at && (
                                <span className="ml-2">· assigned {format(new Date(r.assigned_at), 'MMM d, yyyy')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}

              {records.length > 0 && (
                <div className="sm:hidden mt-4">
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <Link to="/finance/clients">View all clients <ArrowRight className="h-4 w-4 ml-1" /></Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </TooltipProvider>
  );
}
