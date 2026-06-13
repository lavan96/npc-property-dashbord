import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  Building2,
  Calendar,
  Mail,
  AlertTriangle,
  Settings,
  Database,
  BarChart3,
  FileText,
  BookOpen,
  Activity,
  Upload,
  ShieldCheck,
  Zap,
  Sparkles,
  Phone,
  MessageSquareText,
  MessageSquare,
  Inbox,
  FileStack,
  Palette,
  Users,
  History,
  ChevronRight,
  Plug,
  UserCircle,
  Target,
  Cloud,
  Gauge,
  TrendingUp,
  Bell,
  ClipboardList,
  FileSignature,
  Globe,
  Map,
  Send,
  Cpu,
  Factory,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BrandLockup } from '@/components/branding/BrandAssets';

interface MobileSidebarProps {
  onNavigate?: () => void;
}

const navigationItems = [
  { title: 'Overview', url: '/', icon: Home, moduleKey: 'overview' },
  { title: 'Listings', url: '/listings', icon: Building2, moduleKey: 'listings' },
  { title: 'Commercial', url: '/commercial', icon: Building2, moduleKey: '__always__' },
  { title: 'Industrial', url: '/industrial', icon: Factory, moduleKey: '__always__' },
  { title: 'Calendar', url: '/calendar', icon: Calendar, moduleKey: 'calendar' },
  { title: 'Sources', url: '/sources', icon: Mail, moduleKey: 'sources' },
  { title: 'Reports', url: '/reports', icon: BarChart3, moduleKey: 'reports' },
  { title: 'Generated Reports', url: '/generated-reports', icon: FileText, moduleKey: 'generated_reports' },
  { title: 'Cash Flow Analysis', url: '/cash-flow-analysis', icon: Activity, moduleKey: 'cash_flow' },
  { title: 'Report Q&A', url: '/report-qa', icon: MessageSquareText, moduleKey: 'report_qa' },
  { title: 'Email Copilot', url: '/email-copilot', icon: Sparkles, moduleKey: 'email_copilot' },
  { title: 'Call Logs', url: '/call-logs', icon: Phone, moduleKey: 'call_logs' },
  { title: 'Portal Messages', url: '/messages', icon: Inbox, moduleKey: '__always__' },
  { title: 'CRM Conversations', url: '/conversations', icon: MessageSquare, moduleKey: 'conversations' },
  { title: 'Clients', url: '/clients', icon: UserCircle, moduleKey: 'clients' },
  { title: 'Client Tracker', url: '/client-tracker', icon: Target, moduleKey: 'client_tracker' },
  { title: 'Portfolio Reports', url: '/portfolio-reports', icon: FileText, moduleKey: 'portfolio_reports' },
  { title: 'Report Requests', url: '/report-requests', icon: Send, moduleKey: 'report_requests' },
  { title: 'Deal Pipeline', url: '/deal-pipeline', icon: TrendingUp, moduleKey: 'deal_pipeline' },
  { title: 'Reminders', url: '/reminders', icon: Bell, moduleKey: 'reminders' },
  { title: 'Checklists', url: '/checklists', icon: ClipboardList, moduleKey: 'checklists' },
  { title: 'Agreements', url: '/agreements', icon: FileSignature, moduleKey: 'agreements' },
  { title: 'Game Plan', url: '/game-plan', icon: Map, moduleKey: 'game_plan' },
  { title: 'Marketing', url: '/marketing-analytics', icon: TrendingUp, moduleKey: 'marketing_analytics' },
  { title: 'Charts', url: '/charts', icon: BarChart3, moduleKey: 'charts' },
  { title: 'User Guide', url: '/user-guide', icon: BookOpen, moduleKey: 'user_guide' },
];

const adminItems = [
  { title: 'Automation', url: '/automation', icon: Zap, moduleKey: 'automation' },
  { title: 'Templates', url: '/templates', icon: FileStack, moduleKey: 'templates' },
  { title: 'Branding', url: '/white-label', icon: Palette, moduleKey: 'white_label' },
  { title: 'Integrations', url: '/integrations', icon: Plug, moduleKey: 'integrations' },
  { title: 'Cloudflare', url: '/cloudflare', icon: Cloud, moduleKey: 'cloudflare' },
  { title: 'API Usage', url: '/api-usage', icon: Gauge, moduleKey: 'api_usage' },
  { title: 'Model Hub', url: '/model-hub', icon: Cpu, moduleKey: 'integrations' },
  { title: 'Monitoring', url: '/monitoring', icon: Activity, moduleKey: 'monitoring' },
  { title: 'Quality Assurance', url: '/quality-assurance', icon: ShieldCheck, moduleKey: 'quality_assurance' },
  { title: 'Data Import', url: '/data-import', icon: Upload, moduleKey: 'data_import' },
  { title: 'Depreciation Comps', url: '/admin/depreciation-comps', icon: Database, moduleKey: 'depreciation_comps' },
  { title: 'Error Logs', url: '/error-logs', icon: AlertTriangle, moduleKey: 'error_logs' },
  { title: 'Activity Logs', url: '/admin/activity-logs', icon: History, moduleKey: 'activity_logs' },
  { title: 'Settings', url: '/settings', icon: Settings, moduleKey: 'settings' },
  { title: 'User Management', url: '/admin/users', icon: Users, moduleKey: 'user_management' },
  { title: 'Finance Portal', url: '/admin/finance-portal', icon: ShieldCheck, moduleKey: 'finance_portal_admin' },
  { title: 'Portal Config', url: '/portal-config', icon: Globe, moduleKey: 'portal_config' },
  { title: 'PDF Import Engine', url: '/admin/pdf-import-engine', icon: Cpu, moduleKey: '__superadmin_only__' },
  { title: 'PDF Import Diagnostics', url: '/admin/pdf-import-diagnostics', icon: Activity, moduleKey: '__superadmin_only__' },
  { title: 'BC Segment Engine', url: '/admin/bc-segment-engine', icon: Gauge, moduleKey: '__superadmin_only__' },
  { title: 'Reclassify Property', url: '/admin/reclassify-property', icon: Database, moduleKey: '__superadmin_only__' },
];

export function MobileSidebar({ onNavigate }: MobileSidebarProps) {
  const location = useLocation();
  const { settings } = useWhiteLabel();
  const { hasModuleAccess, isSuperadmin, loading: permissionsLoading } = usePermissions();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // While permissions are loading, show nav items to prevent flash
  // Once loaded, filter based on actual permissions
  const visibleNavItems = permissionsLoading 
    ? navigationItems 
    : navigationItems.filter(item => isSuperadmin || hasModuleAccess(item.moduleKey));
  
  const visibleAdminItems = permissionsLoading
    ? [] // Hide admin items while loading for security
    : adminItems.filter(item => isSuperadmin || hasModuleAccess(item.moduleKey));

  const handleClick = () => {
    onNavigate?.();
  };

  return (
      <div className="dashboard-sidebar-surface flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="dashboard-sidebar-header p-4">
        <BrandLockup
          slot="sidebar"
          meta="Internal dashboard"
          className="dashboard-brand-lockup"
          logoClassName="h-8 max-w-[100px] object-contain"
          fallbackClassName="h-8 w-8"
          companyClassName="text-sm"
          metaClassName="tracking-[0.16em]"
        />
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Main Navigation */}
          <div className="mb-4">
            <p className="dashboard-section-label">
              Dashboard
            </p>
              <div className="space-y-1">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  onClick={handleClick}
                  className={cn(
                    'dashboard-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5',
                    'active:scale-[0.98]',
                    isActive(item.url) && 'dashboard-nav-item-active font-medium'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-sm">{item.title}</span>
                  {isActive(item.url) && (
                      <ChevronRight className="h-4 w-4" />
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          {/* Admin Section */}
          {visibleAdminItems.length > 0 && (
            <>
              <Separator className="my-2 bg-border/60" />
              <div>
            <p className="dashboard-section-label">
                  Administration
                </p>
                <div className="space-y-1">
                  {visibleAdminItems.map((item) => (
                    <NavLink
                      key={item.url}
                      to={item.url}
                      onClick={handleClick}
                     className={cn(
                        'dashboard-nav-item flex items-center gap-3 rounded-xl px-3 py-2.5',
                        'active:scale-[0.98]',
                        isActive(item.url) && 'dashboard-nav-item-active font-medium'
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1 text-sm">{item.title}</span>
                      {isActive(item.url) && (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
