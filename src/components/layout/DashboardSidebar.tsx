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
  Plug,
  UserCircle,
  Target,
  Cloud,
  Gauge,
  TrendingUp,
  Bell,
  ClipboardList,
  FileSignature,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { usePermissions } from '@/hooks/usePermissions';

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
  { title: 'Deal Pipeline', url: '/deal-pipeline', icon: TrendingUp, moduleKey: 'deal_pipeline' },
  { title: 'Reminders', url: '/reminders', icon: Bell, moduleKey: 'reminders' },
  { title: 'Checklists', url: '/checklists', icon: ClipboardList, moduleKey: 'checklists' },
  { title: 'Agreements', url: '/agreements', icon: FileSignature, moduleKey: 'agreements' },
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
  { title: 'Monitoring', url: '/monitoring', icon: Activity, moduleKey: 'monitoring' },
  { title: 'Quality Assurance', url: '/quality-assurance', icon: ShieldCheck, moduleKey: 'quality_assurance' },
  { title: 'Data Import', url: '/data-import', icon: Upload, moduleKey: 'data_import' },
  { title: 'Depreciation Comps', url: '/admin/depreciation-comps', icon: Database, moduleKey: 'depreciation_comps' },
  { title: 'Error Logs', url: '/error-logs', icon: AlertTriangle, moduleKey: 'error_logs' },
  { title: 'Activity Logs', url: '/admin/activity-logs', icon: History, moduleKey: 'activity_logs' },
  { title: 'Settings', url: '/settings', icon: Settings, moduleKey: 'settings' },
  { title: 'User Management', url: '/admin/users', icon: Users, moduleKey: 'user_management' },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  const { settings } = useWhiteLabel();
  const { hasModuleAccess, isSuperadmin, loading: permissionsLoading } = usePermissions();
  const isCollapsed = state === 'collapsed';
  
  const isActive = (path: string) => currentPath === path;

  // While permissions are loading, show all items to prevent flash
  // Once loaded, filter based on actual permissions
  const visibleNavItems = permissionsLoading 
    ? navigationItems 
    : navigationItems.filter(item => isSuperadmin || hasModuleAccess(item.moduleKey));
  
  const visibleAdminItems = permissionsLoading
    ? [] // Hide admin items while loading for security
    : adminItems.filter(item => isSuperadmin || hasModuleAccess(item.moduleKey));

  // Determine which logo to show based on sidebar state
  const currentLogo = isCollapsed 
    ? (settings.sidebarIcon || settings.sidebarLogo) 
    : settings.sidebarLogo;

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-card">
      <SidebarContent>
        {/* Brand */}
        <div className={`border-b border-border ${isCollapsed ? 'p-3' : 'p-6'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            {currentLogo ? (
              <img 
                src={currentLogo} 
                alt={settings.companyName} 
                className={`object-contain ${isCollapsed ? 'h-8 w-8' : 'h-10 max-w-[120px]'}`}
              />
            ) : (
              <Database className={`text-primary ${isCollapsed ? 'h-6 w-6' : 'h-8 w-8'}`} />
            )}
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-foreground truncate">{settings.companyName}</span>
                <span className="text-xs text-muted-foreground">Intake Dashboard</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          {!isCollapsed && <SidebarGroupLabel>Dashboard</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section - only show if user has access to any admin items */}
        {visibleAdminItems.length > 0 && (
          <SidebarGroup>
            {!isCollapsed && <SidebarGroupLabel>Administration</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink 
                        to={item.url} 
                        className="flex items-center gap-2 text-sm font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}