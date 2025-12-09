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
  Sparkles
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

const navigationItems = [
  { title: 'Overview', url: '/', icon: Home },
  { title: 'Listings', url: '/listings', icon: Building2 },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
  { title: 'Sources', url: '/sources', icon: Mail },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
  { title: 'Generated Reports', url: '/generated-reports', icon: FileText },
  { title: 'Email Copilot', url: '/email-copilot', icon: Sparkles },
  { title: 'Charts', url: '/charts', icon: BarChart3 },
  { title: 'User Guide', url: '/user-guide', icon: BookOpen },
];

const adminItems = [
  { title: 'Automation', url: '/automation', icon: Zap },
  { title: 'Monitoring', url: '/monitoring', icon: Activity },
  { title: 'Quality Assurance', url: '/quality-assurance', icon: ShieldCheck },
  { title: 'Data Import', url: '/data-import', icon: Upload },
  { title: 'Errors', url: '/errors', icon: AlertTriangle },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;
  
  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar className="border-r border-border bg-card">
      <SidebarContent>
        {/* Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">NPC Property</span>
              <span className="text-xs text-muted-foreground">Intake Dashboard</span>
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}