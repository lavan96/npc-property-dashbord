import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { logActivity } from '@/hooks/useActivityLogger';
import { resetAuthFailures } from '@/lib/secureInvoke';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  registerCurrentDevice,
  heartbeatCurrentDevice,
  releaseCurrentDevice,
  type DeviceRow,
} from '@/lib/deviceSession';

interface User {
  id: string;
  username: string;
  role: string;
}

export interface DeviceLimitInfo {
  devices_active: number;
  device_limit: number;
  devices: DeviceRow[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isSuperadmin: boolean;
  isAdmin: boolean;
  roles: string[];
  accessToken: string | null;
  signIn: (
    username: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<{ error?: string; deviceLimit?: DeviceLimitInfo }>;
  signOut: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Supabase Edge Function base URL
const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

// Access token storage keys
const ACCESS_TOKEN_KEY = 'supabase_access_token';
const SESSION_TOKEN_KEY = 'session_token';

// ── Auth version epoch ──
// Bump this number whenever the auth flow changes in a way that invalidates old tokens.
// On mount, if the stored version doesn't match, stale tokens are auto-cleared
// so users don't need to manually clear browser data.
const AUTH_VERSION = 4;
const AUTH_VERSION_KEY = 'auth_version';

const getStoredValue = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
};

const persistStoredValue = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const clearStoredValue = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

/**
 * Check if stored auth version matches current. If not, purge stale tokens.
 * This prevents the "clear browser data" requirement after deployments.
 */
function enforceAuthVersion(): void {
  try {
    const stored = localStorage.getItem(AUTH_VERSION_KEY);
    const storedVersion = stored ? parseInt(stored, 10) : 0;
    
    if (storedVersion !== AUTH_VERSION) {
      console.log(`[Auth] Version mismatch (stored=${storedVersion}, current=${AUTH_VERSION}). Clearing stale tokens.`);
      // Clear all auth-related storage
      clearStoredValue(ACCESS_TOKEN_KEY);
      clearStoredValue(SESSION_TOKEN_KEY);
      try { sessionStorage.removeItem('current_user'); } catch { /* ignore */ }
      
      // Stamp the new version
      localStorage.setItem(AUTH_VERSION_KEY, String(AUTH_VERSION));
      
      // Also clear any stale service worker caches to ensure fresh assets
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
    }
  } catch (e) {
    // Storage unavailable — continue without version check
    console.warn('[Auth] Version check failed:', e);
  }
}

/**
 * Invoke edge function with credentials for HttpOnly cookies
 */
async function invokeEdgeFunction(
  functionName: string, 
  body?: Record<string, any>
): Promise<{ data: any; error: any }> {
  try {
    // Get session token from storage for authentication fallback
    const sessionToken = getStoredValue(SESSION_TOKEN_KEY);
    
    // Prefer stored access token (real user JWT) over anon key
    const accessToken = getStoredValue(ACCESS_TOKEN_KEY);
    const bearerToken = accessToken || SUPABASE_ANON_KEY;
    
    // Include session token in body as fallback if cookies fail
    const requestBody = body 
      ? { ...body, session_token: sessionToken }
      : { session_token: sessionToken };
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${bearerToken}`,
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      },
      credentials: 'omit',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { data, error: { message: data.error || `HTTP ${response.status}`, status: response.status } };
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
    // Enforce version BEFORE reading tokens — purges stale ones
    enforceAuthVersion();
    return getStoredValue(ACCESS_TOKEN_KEY);
  });

  // Super admin check
  const isSuperadmin = roles.includes('superadmin') || user?.role === 'super_admin';
  const isAdmin = roles.includes('admin') || isSuperadmin || user?.role === 'sub_admin';

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Heartbeat the registered device every 5 min while signed in.
  const heartbeatRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    // Fire one immediately so the device's `last_seen_at` updates on page load.
    heartbeatCurrentDevice().catch(() => { /* best effort */ });
    const id = window.setInterval(() => {
      heartbeatCurrentDevice().catch(() => { /* best effort */ });
    }, 5 * 60 * 1000);
    heartbeatRef.current = id;
    return () => {
      if (heartbeatRef.current != null) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }, [user?.id]);



  const checkSession = async () => {
    try {
      const sessionToken = getStoredValue(SESSION_TOKEN_KEY);
      const storedAccessToken = getStoredValue(ACCESS_TOKEN_KEY);
      
      // If we have no tokens at all, skip the verify call entirely
      // This prevents the 400 "Session token is required" errors on fresh/cleared sessions
      if (!sessionToken && !storedAccessToken) {
        console.log('[Auth] No stored tokens, skipping session check');
        clearAuthState();
        return;
      }

      const { data, error } = await invokeEdgeFunction('custom-auth-verify');

      if (error) {
        if (error.status === 400 || error.status === 401) {
          // Definitive auth failure — clear stale tokens so we don't keep retrying
          console.log('[Auth] Session verify failed (status:', error.status, '), clearing stale tokens');
          clearAuthState();
        } else {
          // Network/server error — don't clear tokens, might be transient
          console.warn('[Auth] Session verification error (transient):', error.message);
          clearAuthState();
        }
      } else if (!data?.valid) {
        clearAuthState();
      } else {
        // Valid session
        setUser(data.user);
        setRoles(data.roles || []);
        resetAuthFailures();
        
        if (data.access_token) {
          persistStoredValue(ACCESS_TOKEN_KEY, data.access_token);
          setAccessToken(data.access_token);
        }

        if (data.session_token) {
          persistStoredValue(SESSION_TOKEN_KEY, data.session_token);
        }
        
        sessionStorage.setItem('current_user', JSON.stringify({
          id: data.user.id,
          username: data.user.username
        }));
      }
    } catch (error: any) {
      console.warn('Session check failed:', error?.message || 'Unknown error');
      clearAuthState();
    } finally {
      setLoading(false);
    }
  };

  const clearAuthState = () => {
    sessionStorage.removeItem('current_user');
    clearStoredValue(ACCESS_TOKEN_KEY);
    clearStoredValue(SESSION_TOKEN_KEY);
    setUser(null);
    setRoles([]);
    setAccessToken(null);
  };

  const signIn = async (username: string, password: string, turnstileToken?: string) => {
    try {
      // Clear any stale tokens BEFORE login
      clearStoredValue(ACCESS_TOKEN_KEY);
      clearStoredValue(SESSION_TOKEN_KEY);
      
      const { data, error } = await invokeEdgeFunction('custom-auth-login', { 
        username, 
        password,
        turnstile_token: turnstileToken,
      });

      if (error || !data?.success) {
        return { error: data?.error || 'Login failed' };
      }

      // Store fresh tokens
      if (data.access_token) {
        persistStoredValue(ACCESS_TOKEN_KEY, data.access_token);
        setAccessToken(data.access_token);
      }
      
      if (data.session_token) {
        persistStoredValue(SESSION_TOKEN_KEY, data.session_token);
      }
      
      // Stamp current auth version on successful login
      try { localStorage.setItem(AUTH_VERSION_KEY, String(AUTH_VERSION)); } catch { /* ignore */ }
      
      sessionStorage.setItem('current_user', JSON.stringify({
        id: data.user.id,
        username: data.user.username
      }));
      
      setUser(data.user);
      setRoles(data.roles || []);
      resetAuthFailures();
      
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
    const currentUser = user;
    
    try {
      await invokeEdgeFunction('custom-auth-logout');
    } catch (error) {
      console.error('Logout error:', error);
    }

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
