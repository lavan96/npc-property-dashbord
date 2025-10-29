import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SearchProvider } from "@/contexts/SearchContext";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardLayout } from "./components/layout/DashboardLayout";
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
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <AuthProvider>
          <SearchProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
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
              <Route path="data-import" element={<DataImport />} />
              <Route path="errors" element={<div className="p-6">Errors coming soon...</div>} />
              <Route path="settings" element={<Settings />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </SearchProvider>
      </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
