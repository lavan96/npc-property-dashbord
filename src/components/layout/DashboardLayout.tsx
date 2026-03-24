import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { MobileHeader } from './MobileHeader';
import { MobileNav } from './MobileNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { AgentChatWidget } from '@/components/agent/AgentChatWidget';

// Error fallback component that captures and displays the error for debugging
class MainContentErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("MainContentErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="m-6">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
              <p className="text-muted-foreground mb-4">
                This page encountered an error. Please try refreshing or navigate to a different page.
              </p>
              {this.state.error && (
                <details className="mb-4 w-full max-w-lg text-left">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground text-center">
                    Show error details
                  </summary>
                  <pre className="mt-2 text-xs text-destructive whitespace-pre-wrap break-all bg-muted p-3 rounded max-h-48 overflow-auto">
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                </details>
              )}
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Refresh Page
              </button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

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
          <ErrorBoundary fallback={<MainContentErrorFallback />}>
            <Outlet />
          </ErrorBoundary>
        </main>

        <MobileNav />
        <AgentChatWidget />
      </div>
    );
  }

  // Desktop Layout
  return (
    <SidebarProvider>
      <div className="min-h-svh h-svh flex w-full bg-background overflow-hidden">
        {/* Sidebar is outside error boundary to prevent it from disappearing on page errors */}
        <DashboardSidebar />
        
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardHeader 
            theme={theme}
            isDark={isDark}
            onCycleTheme={cycleTheme}
          />
          
          <main className="flex-1 p-6 overflow-auto">
            <ErrorBoundary fallback={<MainContentErrorFallback />}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <AgentChatWidget />
    </SidebarProvider>
  );
}
