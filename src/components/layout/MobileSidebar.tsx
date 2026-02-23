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
  FileStack,
  Palette,
  Users,
  History,
  ChevronRight,
  Plug,
  UserCircle,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface MobileSidebarProps {
  onNavigate?: () => void;
}

const navigationItems = [
  { title: 'Overview', url: '/', icon: Home, moduleKey: 'overview' },
  { title: 'Listings', url: '/listings', icon: Building2, moduleKey: 'listings' },
  { title: 'Calendar', url: '/calendar', icon: Calendar, moduleKey: 'calendar' },
  { title: 'Sources', url: '/sources', icon: Mail, moduleKey: 'sources' },
  { title: 'Reports', url: '/reports', icon: BarChart3, moduleKey: 'reports' },
  { title: 'Generated Reports', url: '/generated-reports', icon: FileText, moduleKey: 'generated_reports' },
  { title: 'Cash Flow Analysis', url: '/cash-flow-analysis', icon: Activity, moduleKey: 'cash_flow' },
  { title: 'Report Q&A', url: '/report-qa', icon: MessageSquareText, moduleKey: 'report_qa' },
  { title: 'Email Copilot', url: '/email-copilot', icon: Sparkles, moduleKey: 'email_copilot' },
  { title: 'Call Logs', url: '/call-logs', icon: Phone, moduleKey: 'call_logs' },
  { title: 'Clients', url: '/clients', icon: UserCircle, moduleKey: 'clients' },
  { title: 'Client Tracker', url: '/client-tracker', icon: Target, moduleKey: 'client_tracker' },
  { title: 'Portfolio Reports', url: '/portfolio-reports', icon: FileText, moduleKey: 'portfolio_reports' },
  { title: 'Charts', url: '/charts', icon: BarChart3, moduleKey: 'charts' },
  { title: 'User Guide', url: '/user-guide', icon: BookOpen, moduleKey: 'user_guide' },
];

const adminItems = [
  { title: 'Automation', url: '/automation', icon: Zap, moduleKey: 'automation' },
  { title: 'Templates', url: '/templates', icon: FileStack, moduleKey: 'templates' },
  { title: 'Branding', url: '/white-label', icon: Palette, moduleKey: 'white_label' },
  { title: 'Integrations', url: '/integrations', icon: Plug, moduleKey: 'integrations' },
  { title: 'Monitoring', url: '/monitoring', icon: Activity, moduleKey: 'monitoring' },
  { title: 'Quality Assurance', url: '/quality-assurance', icon: ShieldCheck, moduleKey: 'quality_assurance' },
  { title: 'Data Import', url: '/data-import', icon: Upload, moduleKey: 'data_import' },
  { title: 'Depreciation Comps', url: '/admin/depreciation-comps', icon: Database, moduleKey: 'depreciation_comps' },
  { title: 'Error Logs', url: '/error-logs', icon: AlertTriangle, moduleKey: 'error_logs' },
  { title: 'Activity Logs', url: '/admin/activity-logs', icon: History, moduleKey: 'activity_logs' },
  { title: 'Settings', url: '/settings', icon: Settings, moduleKey: 'settings' },
  { title: 'User Management', url: '/admin/users', icon: Users, moduleKey: 'user_management' },
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
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        {settings.sidebarLogo ? (
          <img 
            src={settings.sidebarLogo} 
            alt={settings.companyName} 
            className="h-8 max-w-[100px] object-contain"
          />
        ) : (
          <Database className="h-7 w-7 text-primary" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground truncate text-sm">
            {settings.companyName}
          </span>
          <span className="text-[10px] text-muted-foreground">Dashboard</span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Main Navigation */}
          <div className="mb-4">
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dashboard
            </p>
            <div className="space-y-0.5">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  onClick={handleClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                    "active:scale-[0.98]",
                    isActive(item.url)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-sm">{item.title}</span>
                  {isActive(item.url) && (
                    <ChevronRight className="h-4 w-4 text-primary" />
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          {/* Admin Section */}
          {visibleAdminItems.length > 0 && (
            <>
              <Separator className="my-2" />
              <div>
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Administration
                </p>
                <div className="space-y-0.5">
                  {visibleAdminItems.map((item) => (
                    <NavLink
                      key={item.url}
                      to={item.url}
                      onClick={handleClick}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                        "active:scale-[0.98]",
                        isActive(item.url)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1 text-sm">{item.title}</span>
                      {isActive(item.url) && (
                        <ChevronRight className="h-4 w-4 text-primary" />
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
