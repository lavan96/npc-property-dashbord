import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/hooks/useActivityLogger';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSuperadmin: boolean;
  isAdmin: boolean;
  roles: string[];
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);

  // Super admin check: either has superadmin role in user_roles OR has super_admin in custom_users.role
  const isSuperadmin = roles.includes('superadmin') || user?.role === 'super_admin';
  const isAdmin = roles.includes('admin') || isSuperadmin || user?.role === 'sub_admin';

  // Check for existing session on mount and ensure Supabase Auth is signed out
  useEffect(() => {
    // Sign out of Supabase Auth to prevent conflicts with custom auth
    supabase.auth.signOut({ scope: 'local' }).catch(() => {
      // Ignore errors, we just want to ensure no Supabase auth session exists
    });
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

      // Handle 401 errors (expired sessions) silently - this is expected behavior
      // Only log unexpected errors
      if (error) {
        // Check if it's a 401 (expired session) - expected, handle silently
        if (error.message && error.message.includes('401')) {
          // Expired session - clear silently without logging
          localStorage.removeItem('session_token');
          sessionStorage.removeItem('current_user');
          setUser(null);
          setRoles([]);
        } else {
          // Unexpected error - log it but still clear session
          console.warn('Session verification error:', error.message || error);
          localStorage.removeItem('session_token');
          sessionStorage.removeItem('current_user');
          setUser(null);
          setRoles([]);
        }
      } else if (!data?.valid) {
        // Invalid session response - clear silently
        localStorage.removeItem('session_token');
        sessionStorage.removeItem('current_user');
        setUser(null);
        setRoles([]);
      } else {
        // Valid session - set user and roles
        setUser(data.user);
        setRoles(data.roles || []);
        
        // Cache user data in sessionStorage for activity logging
        sessionStorage.setItem('current_user', JSON.stringify({
          id: data.user.id,
          username: data.user.username
        }));
      }
    } catch (error: any) {
      // Network or other errors - clear session silently
      // Don't log 401s as they're expected for expired sessions
      if (!error?.message?.includes('401')) {
        console.warn('Session check failed:', error?.message || 'Unknown error');
      }
      localStorage.removeItem('session_token');
      sessionStorage.removeItem('current_user');
      setUser(null);
      setRoles([]);
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
      
      // Cache user data in sessionStorage for activity logging
      sessionStorage.setItem('current_user', JSON.stringify({
        id: data.user.id,
        username: data.user.username
      }));
      
      setUser(data.user);
      setRoles(data.roles || []);
      
      // Log successful login activity
      logActivity({
        userId: data.user.id,
        username: data.user.username,
        actionType: 'login',
        entityType: 'session',
        entityName: data.user.username,
        metadata: { roles: data.roles || [] }
      });
      
      return {};
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: 'Login failed' };
    }
  };

  const signOut = async () => {
    const sessionToken = localStorage.getItem('session_token');
    const currentUser = user; // Capture before clearing
    
    if (sessionToken) {
      try {
        await supabase.functions.invoke('custom-auth-logout', {
          body: { session_token: sessionToken }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    // Log logout activity before clearing user
    if (currentUser) {
      logActivity({
        userId: currentUser.id,
        username: currentUser.username,
        actionType: 'logout',
        entityType: 'session',
        entityName: currentUser.username
      });
    }

    // Also ensure Supabase Auth is signed out to prevent conflicts
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

    localStorage.removeItem('session_token');
    sessionStorage.removeItem('current_user');
    setUser(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isSuperadmin, isAdmin, roles, signIn, signOut }}>
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