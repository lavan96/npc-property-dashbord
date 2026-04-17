import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Loader2 } from 'lucide-react';

interface FinancePortalProtectedRouteProps {
  children: ReactNode;
}

export function FinancePortalProtectedRoute({ children }: FinancePortalProtectedRouteProps) {
  const { user, loading } = useFinancePortalAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Loading Finance Portal...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/finance/login" replace />;
  }

  return <>{children}</>;
}
