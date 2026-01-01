import { NavLink, useLocation } from 'react-router-dom';
import { Home, Building2, BarChart3, FileText, MoreHorizontal, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { MobileSidebar } from './MobileSidebar';

const mobileNavItems = [
  { title: 'Overview', url: '/', icon: Home },
  { title: 'Listings', url: '/listings', icon: Building2 },
  { title: 'Clients', url: '/clients', icon: Users2 },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
  { title: 'Generated', url: '/generated-reports', icon: FileText },
];

export function MobileNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Check if current page is in the "More" menu
  const isMoreActive = !mobileNavItems.some(item => isActive(item.url));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors",
              "active:bg-muted/50 rounded-lg mx-0.5",
              isActive(item.url) 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <item.icon className={cn(
              "h-5 w-5 mb-1 transition-transform",
              isActive(item.url) && "scale-110"
            )} />
            <span className={cn(
              "text-[10px] font-medium truncate max-w-[60px]",
              isActive(item.url) && "font-semibold"
            )}>
              {item.title}
            </span>
            {isActive(item.url) && (
              <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
            )}
          </NavLink>
        ))}

        {/* More Menu - Opens Full Sidebar */}
        <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors",
                "active:bg-muted/50 rounded-lg mx-0.5",
                isMoreActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className={cn(
                "h-5 w-5 mb-1 transition-transform",
                isMoreActive && "scale-110"
              )} />
              <span className={cn(
                "text-[10px] font-medium",
                isMoreActive && "font-semibold"
              )}>
                More
              </span>
              {isMoreActive && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[280px]">
            <MobileSidebar onNavigate={() => setIsMoreOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
