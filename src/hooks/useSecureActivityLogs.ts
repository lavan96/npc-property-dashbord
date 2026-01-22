import { useState, useCallback } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';

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
      const { data, error } = await invokeSecureFunction('get-activity-logs', {
        action_filter: options.actionFilter,
        entity_filter: options.entityFilter,
        user_filter: options.userFilter,
        limit: options.limit || 500
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
