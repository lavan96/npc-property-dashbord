// App configuration - updated Mar 9, 2026
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SearchProvider } from "@/contexts/SearchContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ComparisonProvider } from "@/contexts/ComparisonContext";
import { WhiteLabelProvider } from "@/contexts/WhiteLabelContext";
import { AuthProvider } from "@/hooks/useAuth";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { BackgroundJobTracker } from "./components/BackgroundJobTracker";
import { ReportGenerationProgress } from "./components/reports/ReportGenerationProgress";
import { CallNotificationListener } from "./components/CallNotificationListener";
import { Phase1NotificationListeners } from "./components/Phase1NotificationListeners";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { HarveyCountdown } from "@/components/HarveyCountdown";
import { Button } from "@/components/ui/button";
import Overview from "./pages/Overview";
import Listings from "./pages/Listings";
import Calendar from "./pages/Calendar";
import Sources from "./pages/Sources";
import Reports from "./pages/Reports";
import Charts from "./pages/Charts";
import GeneratedReports from "./pages/GeneratedReports";
import ReportViewer from "./pages/ReportViewer";
import Settings from "./pages/Settings";
import UserGuide from "./pages/UserGuide";
import DataImport from './pages/DataImport';
import Monitoring from './pages/Monitoring';
import QualityAssurance from './pages/QualityAssurance';
import ErrorLogs from './pages/ErrorLogs';
import Automation from './pages/Automation';
import EmailCopilot from './pages/EmailCopilot';
import CallLogs from './pages/CallLogs';
import Conversations from './pages/Conversations';
import CashFlowAnalysis from './pages/CashFlowAnalysis';
import ReportQA from './pages/ReportQA';
import InvestmentReportView from './pages/InvestmentReportView';
import Templates from './pages/Templates';
import WhiteLabel from './pages/WhiteLabel';
import Auth from "./pages/Auth";
import AcceptInvite from "./pages/AcceptInvite";
import UserManagement from "./pages/admin/UserManagement";
import ActivityLogs from "./pages/ActivityLogs";
import { DepreciationCompsAdmin } from "./components/admin/DepreciationCompsAdmin";
import Integrations from "./pages/Integrations";
import MarketingAnalytics from "./pages/MarketingAnalytics";
import CloudflareManagement from "./pages/CloudflareManagement";
import ClientManagement from "./pages/ClientManagement";
import ClientTracker from "./pages/ClientTracker";
import PortfolioReports from "./pages/PortfolioReports";
import ReportRequests from "./pages/ReportRequests";
import ApiUsage from "./pages/ApiUsage";
import DealPipeline from "./pages/DealPipeline";
import RemindersHub from "./pages/RemindersHub";
import Checklists from "./pages/Checklists";
import Agreements from "./pages/Agreements";
import GamePlan from "./pages/GamePlan";
import NotFound from "./pages/NotFound";
import { PortalAuthProvider } from "@/hooks/usePortalAuth";
import { PortalProtectedRoute } from "@/components/portal/PortalProtectedRoute";
import { PortalLayout } from "@/components/portal/PortalLayout";
import PortalAuth from "./pages/portal/PortalAuth";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalProfile from "./pages/portal/PortalProfile";
import PortalProperties from "./pages/portal/PortalProperties";
import PortalEmployment from "./pages/portal/PortalEmployment";
import PortalReports from "./pages/portal/PortalReports";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalAcceptInvite from "./pages/portal/PortalAcceptInvite";
import PortalNotifications from "./pages/portal/PortalNotifications";
import PortalDealProgress from "./pages/portal/PortalDealProgress";
import PortalMessages from "./pages/portal/PortalMessages";
import PortalPropertyInsights from "./pages/portal/PortalPropertyInsights";
import PortalBooking from "./pages/portal/PortalBooking";
import PortalAppointments from "./pages/portal/PortalAppointments";
import PortalConfig from "./pages/PortalConfig";
import { PortalConsentWall } from "@/components/portal/PortalConsentWall";

const queryClient = new QueryClient();

const CalendarErrorFallback = () => (
  <div className="p-6">
    <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
      <div className="font-medium text-foreground">Calendar failed to load.</div>
      <div className="mt-1 text-muted-foreground">
        A malformed appointment may have caused this section to crash.
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  </div>
);

const PathNormalizer = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const normalizedPath = location.pathname.replace(/\/{2,}/g, '/');
    if (normalizedPath !== location.pathname) {
      navigate(`${normalizedPath}${location.search}${location.hash}`, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <WhiteLabelProvider>
          <AuthProvider>
            <PermissionsProvider>
              <BrowserRouter>
                <PathNormalizer />
                <NotificationsProvider>
                  <BackgroundJobTracker />
                  <ReportGenerationProgress />
                  <CallNotificationListener />
                  <Phase1NotificationListeners />
                  <ComparisonProvider>
                    <SearchProvider>
                      <Toaster />
                      <Sonner />
                      <Routes>
                        {/* Client Portal Routes */}
                        <Route path="/client/login" element={
                          <PortalAuthProvider>
                            <PortalAuth />
                          </PortalAuthProvider>
                        } />
                        <Route path="/client/accept-invite" element={
                          <PortalAcceptInvite />
                        } />
                        <Route path="/portal/accept-invite" element={
                          <PortalAcceptInvite />
                        } />
                        <Route path="/client/consent" element={
                          <PortalAuthProvider>
                            <PortalConsentWall />
                          </PortalAuthProvider>
                        } />
                        <Route path="/client" element={
                          <PortalAuthProvider>
                            <PortalProtectedRoute>
                              <PortalLayout />
                            </PortalProtectedRoute>
                          </PortalAuthProvider>
                        }>
                          <Route index element={<PortalDashboard />} />
                          <Route path="profile" element={<PortalProfile />} />
                          <Route path="properties" element={<PortalProperties />} />
                          <Route path="employment" element={<PortalEmployment />} />
                          <Route path="emails" element={<PortalReports />} />
                          <Route path="reports" element={<PortalReports />} />
                          <Route path="request-report" element={<PortalReports />} />
                          <Route path="documents" element={<PortalDocuments />} />
                          <Route path="notifications" element={<PortalNotifications />} />
                          <Route path="deal-progress" element={<PortalDealProgress />} />
                          <Route path="messages" element={<PortalMessages />} />
                          <Route path="property-insights" element={<PortalPropertyInsights />} />
                          <Route path="booking" element={<PortalBooking />} />
                          <Route path="appointments" element={<PortalAppointments />} />
                        </Route>

                        {/* Internal Dashboard Routes */}
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/accept-invite" element={<AcceptInvite />} />
                        <Route path="/" element={
                          <ProtectedRoute>
                            <HarveyCountdown />
                            <DashboardLayout />
                          </ProtectedRoute>
                        }>
                <Route index element={<Overview />} />
                <Route path="listings" element={<ModuleGuard moduleKey="listings"><Listings /></ModuleGuard>} />
                <Route
                  path="calendar"
                  element={
                    <ModuleGuard moduleKey="calendar">
                      <ErrorBoundary fallback={<CalendarErrorFallback />}>
                        <Calendar />
                      </ErrorBoundary>
                    </ModuleGuard>
                  }
                />
                <Route path="sources" element={<ModuleGuard moduleKey="sources"><Sources /></ModuleGuard>} />
                <Route path="reports" element={<ModuleGuard moduleKey="reports"><Reports /></ModuleGuard>} />
                <Route path="charts" element={<ModuleGuard moduleKey="charts"><Charts /></ModuleGuard>} />
                <Route path="generated-reports" element={<ModuleGuard moduleKey="generated_reports"><GeneratedReports /></ModuleGuard>} />
                <Route path="generated-reports/:reportId" element={<ModuleGuard moduleKey="generated_reports"><ReportViewer /></ModuleGuard>} />
                <Route path="user-guide" element={<UserGuide />} />
                <Route path="monitoring" element={<ModuleGuard moduleKey="monitoring"><Monitoring /></ModuleGuard>} />
                <Route path="quality-assurance" element={<ModuleGuard moduleKey="quality_assurance"><QualityAssurance /></ModuleGuard>} />
                <Route path="data-import" element={<ModuleGuard moduleKey="data_import"><DataImport /></ModuleGuard>} />
                <Route path="automation" element={<ModuleGuard moduleKey="automation"><Automation /></ModuleGuard>} />
                <Route path="email-copilot" element={<ModuleGuard moduleKey="email_copilot"><EmailCopilot /></ModuleGuard>} />
                <Route path="call-logs" element={<ModuleGuard moduleKey="call_logs"><CallLogs /></ModuleGuard>} />
                <Route path="cash-flow-analysis" element={<ModuleGuard moduleKey="cash_flow"><CashFlowAnalysis /></ModuleGuard>} />
                <Route path="report-qa" element={<ModuleGuard moduleKey="report_qa"><ReportQA /></ModuleGuard>} />
                <Route path="investment-report/:id" element={<ModuleGuard moduleKey="reports"><InvestmentReportView /></ModuleGuard>} />
                <Route path="templates" element={<ModuleGuard moduleKey="templates"><Templates /></ModuleGuard>} />
                <Route path="white-label" element={<ModuleGuard moduleKey="white_label"><WhiteLabel /></ModuleGuard>} />
                <Route path="error-logs" element={<ModuleGuard moduleKey="error_logs"><ErrorLogs /></ModuleGuard>} />
                <Route path="settings" element={<ModuleGuard moduleKey="settings"><Settings /></ModuleGuard>} />
                <Route path="admin/users" element={<ModuleGuard moduleKey="user_management"><UserManagement /></ModuleGuard>} />
                <Route path="admin/activity-logs" element={<ModuleGuard moduleKey="activity_logs"><ActivityLogs /></ModuleGuard>} />
                <Route path="admin/depreciation-comps" element={<ModuleGuard moduleKey="depreciation_comps"><DepreciationCompsAdmin /></ModuleGuard>} />
                <Route path="integrations" element={<ModuleGuard moduleKey="integrations"><Integrations /></ModuleGuard>} />
                <Route path="cloudflare" element={<ModuleGuard moduleKey="cloudflare"><CloudflareManagement /></ModuleGuard>} />
                <Route path="api-usage" element={<ModuleGuard moduleKey="api_usage"><ApiUsage /></ModuleGuard>} />
                <Route path="clients" element={<ModuleGuard moduleKey="clients"><ClientManagement /></ModuleGuard>} />
                <Route path="client-tracker" element={<ModuleGuard moduleKey="client_tracker"><ClientTracker /></ModuleGuard>} />
                <Route path="portfolio-reports" element={<ModuleGuard moduleKey="portfolio_reports"><PortfolioReports /></ModuleGuard>} />
                <Route path="report-requests" element={<ModuleGuard moduleKey="reports"><ReportRequests /></ModuleGuard>} />
                <Route path="deal-pipeline" element={<ModuleGuard moduleKey="deal_pipeline"><DealPipeline /></ModuleGuard>} />
                <Route path="reminders" element={<ModuleGuard moduleKey="reminders"><RemindersHub /></ModuleGuard>} />
                <Route path="checklists" element={<ModuleGuard moduleKey="checklists"><Checklists /></ModuleGuard>} />
                <Route path="agreements" element={<ModuleGuard moduleKey="agreements"><Agreements /></ModuleGuard>} />
                <Route path="game-plan" element={<ModuleGuard moduleKey="game_plans"><GamePlan /></ModuleGuard>} />
                <Route path="portal-config" element={<ModuleGuard moduleKey="portal_config"><PortalConfig /></ModuleGuard>} />
                <Route path="marketing-analytics" element={<ModuleGuard moduleKey="marketing_analytics"><MarketingAnalytics /></ModuleGuard>} />
                        </Route>
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </SearchProvider>
                  </ComparisonProvider>
                </NotificationsProvider>
              </BrowserRouter>
            </PermissionsProvider>
          </AuthProvider>
        </WhiteLabelProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
