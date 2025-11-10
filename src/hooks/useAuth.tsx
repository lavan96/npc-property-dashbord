import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const sessionToken = localStorage.getItem('session_token');
    
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('custom-auth-verify', {
        body: { session_token: sessionToken }
      });

      // 401 errors are expected for expired sessions - handle silently
      if (error || !data?.valid) {
        localStorage.removeItem('session_token');
        setUser(null);
      } else {
        setUser(data.user);
      }
    } catch (error) {
      // Silently clear invalid session - this is expected behavior
      localStorage.removeItem('session_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (username: string, password: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('custom-auth-login', {
        body: { username, password }
      });

      if (error || !data?.success) {
        return { error: data?.error || 'Login failed' };
      }

      // Store session token
      localStorage.setItem('session_token', data.session_token);
      setUser(data.user);
      
      return {};
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: 'Login failed' };
    }
  };

  const signOut = async () => {
    const sessionToken = localStorage.getItem('session_token');
    
    if (sessionToken) {
      try {
        await supabase.functions.invoke('custom-auth-logout', {
          body: { session_token: sessionToken }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('session_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}