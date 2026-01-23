import { useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

/**
 * Hook that provides an authenticated Supabase client using the custom JWT.
 * This client will be recognized as 'authenticated' role by Supabase RLS.
 * 
 * Usage:
 * ```tsx
 * const { supabase, isAuthenticated } = useAuthenticatedSupabase();
 * 
 * // Use supabase client for queries
 * const { data } = await supabase.from('table').select('*');
 * ```
 */
export function useAuthenticatedSupabase() {
  const { accessToken, user } = useAuth();

  const supabase = useMemo<SupabaseClient<Database>>(() => {
    if (accessToken) {
      // Create client with custom JWT for authenticated requests
      return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }

    // Fallback to anon client if no token
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }, [accessToken]);

  return {
    supabase,
    isAuthenticated: !!accessToken && !!user,
    userId: user?.id || null,
  };
}

/**
 * Get an authenticated Supabase client outside of React components.
 * Uses the stored access token from sessionStorage.
 * 
 * Note: Prefer useAuthenticatedSupabase hook inside React components.
 */
export function getAuthenticatedSupabaseClient(): SupabaseClient<Database> {
  const accessToken = sessionStorage.getItem('supabase_access_token');
  
  if (accessToken) {
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
