import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Building2, User, Home as HomeIcon, Briefcase, Mail,
  FileText, LogOut, Menu, X
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const portalNavItems = [
  { to: '/client', icon: HomeIcon, label: 'Dashboard', end: true },
  { to: '/client/profile', icon: User, label: 'My Profile' },
  { to: '/client/properties', icon: Building2, label: 'Properties' },
  { to: '/client/employment', icon: Briefcase, label: 'Employment & Finances' },
  { to: '/client/emails', icon: Mail, label: 'Correspondence' },
  { to: '/client/documents', icon: FileText, label: 'Documents' },
];

export function PortalLayout() {
  const { user, signOut } = usePortalAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/client/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6">
          {settings.authLogo ? (
            <img src={settings.authLogo} alt={settings.companyName} className="h-10 max-w-[200px] object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary" />
              <span className="font-semibold text-lg text-foreground">Client Portal</span>
            </div>
          )}
        </div>
        <Separator />
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-3">
            {portalNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </ScrollArea>
        <Separator />
        <div className="p-4 space-y-3">
          <div className="text-sm">
            <p className="font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-semibold text-foreground">Client Portal</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-card border-b border-border shadow-lg p-4" onClick={(e) => e.stopPropagation()}>
            <nav className="space-y-1">
              {portalNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <Separator className="my-3" />
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
