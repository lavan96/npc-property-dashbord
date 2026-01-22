import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActivityLog {
  id: string;
  user_id: string | null;
  username: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface FetchLogsOptions {
  actionFilter?: string;
  entityFilter?: string;
  userFilter?: string;
  limit?: number;
}

interface FetchLogsResult {
  logs: ActivityLog[];
  uniqueUsers: string[];
  error: string | null;
}

export function useSecureActivityLogs() {
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (options: FetchLogsOptions = {}): Promise<FetchLogsResult> => {
    setLoading(true);
    
    try {
      // Get session token from localStorage
      const sessionToken = localStorage.getItem('session_token');
      
      if (!sessionToken) {
        console.error('[useSecureActivityLogs] No session token found');
        return { logs: [], uniqueUsers: [], error: 'Authentication required' };
      }

      const { data, error } = await supabase.functions.invoke('get-activity-logs', {
        body: {
          session_token: sessionToken,
          action_filter: options.actionFilter,
          entity_filter: options.entityFilter,
          user_filter: options.userFilter,
          limit: options.limit || 500
        }
      });

      if (error) {
        console.error('[useSecureActivityLogs] Edge function error:', error);
        return { logs: [], uniqueUsers: [], error: error.message };
      }

      if (!data?.success) {
        const errorMsg = data?.error || 'Failed to fetch activity logs';
        console.error('[useSecureActivityLogs] API error:', errorMsg);
        return { logs: [], uniqueUsers: [], error: errorMsg };
      }

      return { 
        logs: data.logs as ActivityLog[], 
        uniqueUsers: data.uniqueUsers as string[],
        error: null 
      };
    } catch (error) {
      console.error('[useSecureActivityLogs] Unexpected error:', error);
      return { logs: [], uniqueUsers: [], error: 'Failed to fetch activity logs' };
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchLogs, loading };
}
