import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, X, LogOut, Settings, Moon, Sun, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSearch } from '@/contexts/SearchContext';
import { useAuth } from '@/hooks/useAuth';
import { useWhiteLabel } from '@/contexts/WhiteLabelContext';
import { NotificationsDropdown } from './NotificationsDropdown';
import { MobileSidebar } from './MobileSidebar';
import { cn } from '@/lib/utils';
import { Database } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

interface MobileHeaderProps {
  theme: Theme;
  isDark: boolean;
  onCycleTheme: () => void;
}

export function MobileHeader({ theme, isDark, onCycleTheme }: MobileHeaderProps) {
  const { globalSearchQuery, setGlobalSearchQuery } = useSearch();
  const { user, signOut } = useAuth();
  const { settings } = useWhiteLabel();
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGlobalSearchQuery(e.target.value);
  };

  const handleSearchSubmit = () => {
    if (globalSearchQuery.trim()) {
      navigate('/listings');
      setIsSearchOpen(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const getThemeIcon = () => {
    if (theme === 'system') {
      return isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />;
    }
    return theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />;
  };

  return (
    <>
      {/* Search Overlay */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSearchOpen(false)}
              className="shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
            <Input
              type="text"
              placeholder="Search properties..."
              value={globalSearchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              className="flex-1"
              autoFocus
            />
            <Button 
              variant="default" 
              size="sm"
              onClick={handleSearchSubmit}
            >
              Search
            </Button>
          </div>
          
          {/* Quick Search Suggestions */}
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-3">Quick filters</p>
            <div className="flex flex-wrap gap-2">
              {['NSW', 'VIC', 'QLD', 'House', 'Apartment'].map((term) => (
                <Button
                  key={term}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGlobalSearchQuery(term);
                    navigate('/listings');
                    setIsSearchOpen(false);
                  }}
                >
                  {term}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border md:hidden">
        <div className="flex items-center justify-between h-14 px-3">
          {/* Left: Menu + Logo */}
          <div className="flex items-center gap-2">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px]">
                <MobileSidebar onNavigate={() => setIsSidebarOpen(false)} />
              </SheetContent>
            </Sheet>
            
            <div className="flex items-center gap-2">
              {settings.sidebarIcon || settings.sidebarLogo ? (
                <img 
                  src={settings.sidebarIcon || settings.sidebarLogo} 
                  alt={settings.companyName} 
                  className="h-7 w-7 object-contain"
                />
              ) : (
                <Database className="h-6 w-6 text-primary" />
              )}
              <span className="font-semibold text-sm text-foreground truncate max-w-[120px]">
                {settings.companyName}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSearchOpen(true)}
              className="h-11 w-11"
            >
              <Search className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onCycleTheme}
              className="h-11 w-11"
            >
              {getThemeIcon()}
            </Button>

            <NotificationsDropdown />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {user?.username?.substring(0, 2).toUpperCase() || 'AD'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.username || 'Admin'}</p>
                    <p className="text-xs text-muted-foreground">{user?.role || 'Administrator'}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}
