import React from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { MobileHeader } from './MobileHeader';
import { MobileNav } from './MobileNav';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { AgentChatWidget } from '@/components/agent/AgentChatWidget';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useDashboardTheme } from '@/hooks/useDashboardTheme';
import { DashboardPageShell } from './DashboardPageShell';
import { TokenBalanceBanner } from '@/components/billing/TokenBalanceBanner';

export function DashboardLayout() {
  const breakpoint = useBreakpoint();
  const { theme, isDark, cycleTheme } = useDashboardTheme();

  // Mobile + Tablet share the same chrome (top bar + bottom nav).
  // Desktop sidebar shell only mounts at >= 1024px.
  if (breakpoint !== 'desktop') {
    return (
      <div className="dashboard-shell flex min-h-screen flex-col">
        <MobileHeader
          theme={theme}
          isDark={isDark}
          onCycleTheme={cycleTheme}
        />

        <main className="dashboard-main flex-1 overflow-auto">
          <div className="dashboard-content">
            <ErrorBoundary>
              <DashboardPageShell>
                <TokenBalanceBanner />
                <Outlet />
              </DashboardPageShell>
            </ErrorBoundary>
          </div>
        </main>

        <MobileNav />
        <AgentChatWidget />
      </div>
    );
  }

  // Desktop Layout (>= 1024px)
  return (
    <SidebarProvider>
      <div className="dashboard-shell flex min-h-svh h-svh w-full overflow-hidden">
        <DashboardSidebar />

        <div className="dashboard-main flex flex-1 flex-col min-w-0">
          <DashboardHeader
            theme={theme}
            isDark={isDark}
            onCycleTheme={cycleTheme}
          />

          <main className="dashboard-main flex-1 overflow-auto">
            <div className="dashboard-content">
              <ErrorBoundary>
                <DashboardPageShell>
                  <TokenBalanceBanner />
                  <Outlet />
                </DashboardPageShell>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
      <AgentChatWidget />
    </SidebarProvider>
  );
}
