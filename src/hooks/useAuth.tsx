import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { logActivity } from '@/hooks/useActivityLogger';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

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
  accessToken: string | null;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Supabase Edge Function base URL
const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

// Access token storage key
const ACCESS_TOKEN_KEY = 'supabase_access_token';

/**
 * Invoke edge function with credentials for HttpOnly cookies
 */
async function invokeEdgeFunction(
  functionName: string, 
  body?: Record<string, any>
): Promise<{ data: any; error: any }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      credentials: 'include', // Required for HttpOnly cookies
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { data, error: { message: data.error || `HTTP ${response.status}` } };
    }
    
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    // Initialize from storage on mount
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  });

  // Super admin check: either has superadmin role in user_roles OR has super_admin in custom_users.role
  const isSuperadmin = roles.includes('superadmin') || user?.role === 'super_admin';
  const isAdmin = roles.includes('admin') || isSuperadmin || user?.role === 'sub_admin';

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // Session token is now in HttpOnly cookie, sent automatically with credentials: 'include'
      const { data, error } = await invokeEdgeFunction('custom-auth-verify');

      if (error) {
        // Session expired or invalid - this is expected behavior
        if (!error.message?.includes('401')) {
          console.warn('Session verification error:', error.message);
        }
        clearAuthState();
      } else if (!data?.valid) {
        // Invalid session response
        clearAuthState();
      } else {
        // Valid session - set user and roles
        setUser(data.user);
        setRoles(data.roles || []);
        
        // Store access token for Supabase client
        if (data.access_token) {
          sessionStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
          setAccessToken(data.access_token);
        }
        
        // Cache user data in sessionStorage for activity logging
        sessionStorage.setItem('current_user', JSON.stringify({
          id: data.user.id,
          username: data.user.username
        }));
      }
    } catch (error: any) {
      // Network or other errors
      console.warn('Session check failed:', error?.message || 'Unknown error');
      clearAuthState();
    } finally {
      setLoading(false);
    }
  };

  const clearAuthState = () => {
    sessionStorage.removeItem('current_user');
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    setUser(null);
    setRoles([]);
    setAccessToken(null);
  };

  const signIn = async (username: string, password: string) => {
    try {
      const { data, error } = await invokeEdgeFunction('custom-auth-login', { 
        username, 
        password 
      });

      if (error || !data?.success) {
        return { error: data?.error || 'Login failed' };
      }

      // Session cookie is set automatically by the server response
      // Store access token for Supabase client
      if (data.access_token) {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        setAccessToken(data.access_token);
      }
      
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
    const currentUser = user; // Capture before clearing
    
    try {
      // Call logout endpoint - it will clear the cookie
      await invokeEdgeFunction('custom-auth-logout');
    } catch (error) {
      console.error('Logout error:', error);
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

    clearAuthState();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isSuperadmin, isAdmin, roles, accessToken, signIn, signOut }}>
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
