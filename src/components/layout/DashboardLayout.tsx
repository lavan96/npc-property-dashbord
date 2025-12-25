import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { MobileHeader } from './MobileHeader';
import { MobileNav } from './MobileNav';
import { useIsMobile } from '@/hooks/use-mobile';

type Theme = 'light' | 'dark' | 'system';

const getSystemTheme = () => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  if (resolvedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  return resolvedTheme === 'dark';
};

export function DashboardLayout() {
  const isMobile = useIsMobile();
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as Theme) || 'system';
    }
    return 'system';
  });
  const [isDark, setIsDark] = useState(() => applyTheme(theme));

  // Apply theme and listen for system preference changes
  useEffect(() => {
    setIsDark(applyTheme(theme));
    localStorage.setItem('theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        setIsDark(applyTheme('system'));
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((current) => {
      if (current === 'dark') return 'light';
      if (current === 'light') return 'system';
      return 'dark';
    });
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <MobileHeader 
          theme={theme} 
          isDark={isDark} 
          onCycleTheme={cycleTheme} 
        />
        
        <main className="flex-1 p-4 pb-20 overflow-auto">
          <Outlet />
        </main>

        <MobileNav />
      </div>
    );
  }

  // Desktop Layout
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />
        
        <div className="flex-1 flex flex-col">
          <DashboardHeader 
            theme={theme}
            isDark={isDark}
            onCycleTheme={cycleTheme}
          />
          
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
