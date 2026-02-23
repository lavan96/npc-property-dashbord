import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Building2, BarChart3, FileText, MoreHorizontal, UserCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { MobileSidebar } from './MobileSidebar';

const mobileNavItems = [
  { title: 'Overview', url: '/', icon: Home },
  { title: 'Listings', url: '/listings', icon: Building2 },
  { title: 'Clients', url: '/clients', icon: UserCircle },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
  { title: 'Generated', url: '/generated-reports', icon: FileText },
];

export function MobileNav() {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isMoreActive = !mobileNavItems.some(item => isActive(item.url));

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Toggle pill - always visible */}
      <div className="flex justify-center">
        <button
          onClick={() => setIsCollapsed(prev => !prev)}
          className={cn(
            "flex items-center justify-center",
            "w-10 h-5 rounded-t-xl",
            "bg-card/90 backdrop-blur-xl border border-b-0 border-border/50",
            "text-muted-foreground hover:text-foreground",
            "transition-all duration-300 ease-out",
            "shadow-[0_-2px_12px_rgba(0,0,0,0.08)]",
            "hover:shadow-[0_-4px_16px_rgba(0,0,0,0.12)]",
            "active:scale-95"
          )}
          aria-label={isCollapsed ? 'Show navigation' : 'Hide navigation'}
        >
          {isCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5 animate-[pulse_2s_ease-in-out_infinite]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Nav bar */}
      <nav
        className={cn(
          "bg-card/90 backdrop-blur-xl border-t border-border/50 safe-area-bottom",
          "shadow-[0_-4px_24px_rgba(0,0,0,0.06)]",
          "transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "overflow-hidden",
          isCollapsed ? "max-h-0 border-t-0" : "max-h-20"
        )}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-all duration-200",
                "active:scale-90 rounded-xl mx-0.5 relative",
                isActive(item.url)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "relative p-1 rounded-lg transition-all duration-200",
                isActive(item.url) && "bg-primary/10"
              )}>
                <item.icon className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  isActive(item.url) && "scale-110"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-medium truncate max-w-[60px] mt-0.5",
                isActive(item.url) && "font-semibold"
              )}>
                {item.title}
              </span>
              {isActive(item.url) && (
                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
              )}
            </NavLink>
          ))}

          {/* More Menu */}
          <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-all duration-200",
                  "active:scale-90 rounded-xl mx-0.5 relative",
                  isMoreActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "relative p-1 rounded-lg transition-all duration-200",
                  isMoreActive && "bg-primary/10"
                )}>
                  <MoreHorizontal className={cn(
                    "h-5 w-5 transition-transform duration-200",
                    isMoreActive && "scale-110"
                  )} />
                </div>
                <span className={cn(
                  "text-[10px] font-medium mt-0.5",
                  isMoreActive && "font-semibold"
                )}>
                  More
                </span>
                {isMoreActive && (
                  <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px]" hideClose>
              <MobileSidebar onNavigate={() => setIsMoreOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
