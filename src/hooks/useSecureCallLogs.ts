import { useCallback } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';

interface CallLogListOptions {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
  status?: string;
  outcome?: string;
  agentId?: string;
  squadId?: string;
  direction?: string;
  intent?: string;
  startDate?: string;
  endDate?: string;
  cutoffDate?: string;
}

export const useSecureCallLogs = () => {
  // Fetch all call logs with optional filters
  const fetchCallLogs = useCallback(async (options: CallLogListOptions = {}) => {
    const { data, error } = await invokeSecureFunction('get-call-logs', {
      mode: 'list',
      listOptions: options
    });

    if (error) {
      console.error('[useSecureCallLogs] Error fetching calls:', error);
      return { data: null, error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { data: null, error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Fetched calls via secure Edge Function');
    return { data: data.calls, error: null };
  }, []);

  // Fetch live calls (in-progress, ringing, queued)
  const fetchLiveCalls = useCallback(async () => {
    const { data, error } = await invokeSecureFunction('get-call-logs', {
      mode: 'live'
    });

    if (error) {
      console.error('[useSecureCallLogs] Error fetching live calls:', error);
      return { data: null, error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { data: null, error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Fetched live calls via secure Edge Function');
    return { data: data.calls, error: null };
  }, []);

  // Fetch error calls for error logs dashboard
  const fetchErrorCalls = useCallback(async (cutoffDate?: string, limit = 100) => {
    const { data, error } = await invokeSecureFunction('get-call-logs', {
      mode: 'errors',
      listOptions: { cutoffDate, limit }
    });

    if (error) {
      console.error('[useSecureCallLogs] Error fetching error calls:', error);
      return { data: null, error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { data: null, error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Fetched error calls via secure Edge Function');
    return { data: data.calls, error: null };
  }, []);

  // Fetch a single call by ID
  const fetchCall = useCallback(async (callId: string) => {
    const { data, error } = await invokeSecureFunction('get-call-logs', {
      mode: 'single',
      callId
    });

    if (error) {
      console.error('[useSecureCallLogs] Error fetching call:', error);
      return { data: null, error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { data: null, error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Fetched call via secure Edge Function');
    return { data: data.call, error: null };
  }, []);

  // Update tags for a call
  const updateCallTags = useCallback(async (callId: string, tags: string[]) => {
    const { data, error } = await invokeSecureFunction('manage-call-logs', {
      operation: 'updateTags',
      callId,
      data: { tags }
    });

    if (error) {
      console.error('[useSecureCallLogs] Error updating tags:', error);
      return { error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Updated tags via secure Edge Function');
    return { error: null };
  }, []);

  // Update call data
  const updateCall = useCallback(async (callId: string, updateData: Record<string, any>) => {
    const { data, error } = await invokeSecureFunction('manage-call-logs', {
      operation: 'update',
      callId,
      data: updateData
    });

    if (error) {
      console.error('[useSecureCallLogs] Error updating call:', error);
      return { error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Updated call via secure Edge Function');
    return { error: null };
  }, []);

  // Delete a call
  const deleteCall = useCallback(async (callId: string) => {
    const { data, error } = await invokeSecureFunction('manage-call-logs', {
      operation: 'delete',
      callId
    });

    if (error) {
      console.error('[useSecureCallLogs] Error deleting call:', error);
      return { error };
    }

    if (!data?.success) {
      console.error('[useSecureCallLogs] Edge function returned error:', data?.error);
      return { error: { message: data?.error || 'Unknown error' } };
    }

    console.log('[useSecureCallLogs] Deleted call via secure Edge Function');
    return { error: null };
  }, []);

  return {
    fetchCallLogs,
    fetchLiveCalls,
    fetchErrorCalls,
    fetchCall,
    updateCallTags,
    updateCall,
    deleteCall
  };
};
