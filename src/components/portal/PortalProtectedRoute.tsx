import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Loader2 } from 'lucide-react';

export function PortalProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = usePortalAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/client/login" replace />;
  }

  return <>{children}</>;
}
