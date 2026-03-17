import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { smartCapitalize } from '@/lib/nameUtils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Building2, User, Home as HomeIcon, Briefcase,
  FileText, LogOut, Menu, X, Shield, Bell, TrendingUp,
  MessageSquare, BarChart3, CalendarDays
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PortalOnboardingTour } from './PortalOnboardingTour';
import { PortalNotificationBell } from './PortalNotificationBell';
import { PortalNotificationProvider } from '@/contexts/PortalNotificationContext';

const portalNavItems = [
  { to: '/client', icon: HomeIcon, label: 'Dashboard', end: true, tourId: 'dashboard' },
  { to: '/client/profile', icon: User, label: 'My Profile', end: true, tourId: 'profile' },
  { to: '/client/deal-progress', icon: TrendingUp, label: 'Deal Progress', end: true, tourId: 'deal-progress' },
  { to: '/client/properties', icon: Building2, label: 'Properties', end: true, tourId: 'properties' },
  { to: '/client/property-insights', icon: BarChart3, label: 'Property Insights', end: true, tourId: 'property-insights' },
  { to: '/client/employment', icon: Briefcase, label: 'Finances', end: true, tourId: 'finances' },
  { to: '/client/documents', icon: FileText, label: 'Documents', end: true, tourId: 'documents' },
  { to: '/client/reports', icon: FileText, label: 'Reports', end: true, tourId: 'reports' },
  { to: '/client/messages', icon: MessageSquare, label: 'Messages', end: true, tourId: 'messages' },
  { to: '/client/notifications', icon: Bell, label: 'Notifications', end: true, tourId: 'notifications' },
  { to: '/client/appointments', icon: CalendarDays, label: 'My Appointments', end: true },
  { to: '/client/booking', icon: CalendarDays, label: 'Book Appointment', end: true },
];

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function PortalLayout() {
  const { user, signOut } = usePortalAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = smartCapitalize(user?.name);

  const handleSignOut = async () => {
    await signOut();
    navigate('/client/login', { replace: true });
  };

  return (
    <PortalNotificationProvider>
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border bg-card shadow-sm">
        {/* Logo Area */}
        <div className="p-6 pb-4 flex items-center justify-between">
          {settings.authLogo ? (
            <img src={settings.authLogo} alt={settings.companyName} className="h-10 max-w-[200px] object-contain" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <span className="font-bold text-lg text-foreground tracking-tight">Client Portal</span>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Secure Access</p>
              </div>
            </div>
          )}
        </div>
        <Separator />

        {/* User Profile Card */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/10">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground truncate">{displayName || 'Client'}</p>
              <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-3">
            {portalNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-tour={item.tourId}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="p-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl py-2.5"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Sign Out
          </Button>
          <div className="mt-3 flex items-center gap-1.5 px-3 text-[10px] text-muted-foreground/50">
            <Shield className="h-3 w-3" />
            <span>Secured Portal • End-to-end encrypted</span>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-b border-border px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold text-foreground">Client Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <PortalNotificationBell />
          <Avatar className="h-8 w-8 border border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} className="h-9 w-9">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-card border-b border-border shadow-xl rounded-b-2xl p-4 animate-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-3 mb-3 rounded-xl bg-primary/5 border border-primary/10">
              <Avatar className="h-9 w-9 border border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <nav className="space-y-1">
              {portalNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <Separator className="my-3" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-destructive rounded-xl py-2.5"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        <div className="p-4 md:p-8 lg:p-10 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Onboarding Tour */}
      <PortalOnboardingTour />
    </div>
  );
}