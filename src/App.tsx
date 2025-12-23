// App configuration - last updated for deployment
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
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { BackgroundJobTracker } from "./components/BackgroundJobTracker";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <WhiteLabelProvider>
          <AuthProvider>
            <BrowserRouter>
              <NotificationsProvider>
                <BackgroundJobTracker />
                <ComparisonProvider>
                  <SearchProvider>
                  <Toaster />
                  <Sonner />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Overview />} />
                <Route path="listings" element={<Listings />} />
                <Route path="calendar" element={<Calendar />} />
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
                <Route path="errors" element={<ErrorLogs />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
                  </SearchProvider>
                </ComparisonProvider>
              </NotificationsProvider>
            </BrowserRouter>
          </AuthProvider>
        </WhiteLabelProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
