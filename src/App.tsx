// App configuration - updated Mar 9, 2026
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SearchProvider } from "@/contexts/SearchContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ComparisonProvider } from "@/contexts/ComparisonContext";
import { WhiteLabelProvider } from "@/contexts/WhiteLabelContext";
import { AuthProvider } from "@/hooks/useAuth";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import CloudflareManagement from "./pages/CloudflareManagement";
import ClientManagement from "./pages/ClientManagement";
import ClientTracker from "./pages/ClientTracker";
import PortfolioReports from "./pages/PortfolioReports";
import ApiUsage from "./pages/ApiUsage";
import DealPipeline from "./pages/DealPipeline";
import RemindersHub from "./pages/RemindersHub";
import Checklists from "./pages/Checklists";
import Agreements from "./pages/Agreements";
import NotFound from "./pages/NotFound";
import { PortalAuthProvider } from "@/hooks/usePortalAuth";
import { PortalProtectedRoute } from "@/components/portal/PortalProtectedRoute";
import { PortalLayout } from "@/components/portal/PortalLayout";
import PortalAuth from "./pages/portal/PortalAuth";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalProfile from "./pages/portal/PortalProfile";
import PortalProperties from "./pages/portal/PortalProperties";
import PortalEmployment from "./pages/portal/PortalEmployment";
import PortalEmails from "./pages/portal/PortalEmails";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalAcceptInvite from "./pages/portal/PortalAcceptInvite";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <WhiteLabelProvider>
          <AuthProvider>
            <PermissionsProvider>
              <BrowserRouter>
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
                          <Route path="emails" element={<PortalEmails />} />
                          <Route path="documents" element={<PortalDocuments />} />
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
                <Route path="listings" element={<Listings />} />
                <Route
                  path="calendar"
                  element={
                    <ErrorBoundary fallback={<CalendarErrorFallback />}>
                      <Calendar />
                    </ErrorBoundary>
                  }
                />
                <Route path="sources" element={<Sources />} />
                <Route path="reports" element={<Reports />} />
                <Route path="charts" element={<Charts />} />
                <Route path="generated-reports" element={<GeneratedReports />} />
                <Route path="generated-reports/:reportId" element={<ReportViewer />} />
                <Route path="user-guide" element={<UserGuide />} />
                <Route path="monitoring" element={<Monitoring />} />
                <Route path="quality-assurance" element={<QualityAssurance />} />
                <Route path="data-import" element={<DataImport />} />
                <Route path="automation" element={<Automation />} />
                <Route path="email-copilot" element={<EmailCopilot />} />
                <Route path="call-logs" element={<CallLogs />} />
                <Route path="cash-flow-analysis" element={<CashFlowAnalysis />} />
                <Route path="report-qa" element={<ReportQA />} />
                <Route path="investment-report/:id" element={<InvestmentReportView />} />
                <Route path="templates" element={<Templates />} />
                <Route path="white-label" element={<WhiteLabel />} />
                <Route path="error-logs" element={<ErrorLogs />} />
                          <Route path="settings" element={<Settings />} />
                          <Route path="admin/users" element={<UserManagement />} />
                          <Route path="admin/activity-logs" element={<ActivityLogs />} />
                          <Route path="admin/depreciation-comps" element={<DepreciationCompsAdmin />} />
                          <Route path="integrations" element={<Integrations />} />
                          <Route path="cloudflare" element={<CloudflareManagement />} />
                          <Route path="api-usage" element={<ApiUsage />} />
                          <Route path="clients" element={<ClientManagement />} />
                          <Route path="client-tracker" element={<ClientTracker />} />
                          <Route path="portfolio-reports" element={<PortfolioReports />} />
                           <Route path="deal-pipeline" element={<DealPipeline />} />
                           <Route path="reminders" element={<RemindersHub />} />
                           <Route path="checklists" element={<Checklists />} />
                           <Route path="agreements" element={<Agreements />} />
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
