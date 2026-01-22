import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const getSessionToken = useCallback(() => {
    return localStorage.getItem('session_token');
  }, []);

  // Fetch all call logs with optional filters
  const fetchCallLogs = useCallback(async (options: CallLogListOptions = {}) => {
    const sessionToken = getSessionToken();
    
    // Try secure Edge Function first
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('get-call-logs', {
          body: {
            session_token: sessionToken,
            mode: 'list',
            listOptions: options
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Fetched calls via secure Edge Function');
          return { data: data.calls, error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed, will use fallback:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception, will use fallback:', e);
      }
    }

    // Fallback to direct query (for backward compatibility during transition)
    console.log('[useSecureCallLogs] Using direct query fallback');
    let query = supabase
      .from('vapi_call_logs')
      .select('*');

    if (options.status) query = query.eq('call_status', options.status);
    if (options.outcome) query = query.eq('call_outcome', options.outcome);
    if (options.agentId) query = query.eq('agent_id', options.agentId);
    if (options.squadId) query = query.eq('squad_id', options.squadId);
    if (options.direction) query = query.eq('call_direction', options.direction);
    if (options.intent) query = query.eq('call_intent', options.intent);
    if (options.startDate) query = query.gte('started_at', options.startDate);
    if (options.endDate) query = query.lte('started_at', options.endDate);

    query = query.order(options.orderBy || 'started_at', { ascending: options.ascending ?? false });
    
    if (options.limit) {
      query = query.limit(options.limit);
    }

    return await query;
  }, [getSessionToken]);

  // Fetch live calls (in-progress, ringing, queued)
  const fetchLiveCalls = useCallback(async () => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('get-call-logs', {
          body: {
            session_token: sessionToken,
            mode: 'live'
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Fetched live calls via secure Edge Function');
          return { data: data.calls, error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for live calls:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for live calls:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for live calls');
    return await supabase
      .from('vapi_call_logs')
      .select('id, vapi_call_id, agent_name, phone_number, customer_name, call_direction, call_status, started_at, is_squad_call, squad_name, call_intent')
      .in('call_status', ['in-progress', 'ringing', 'queued'])
      .order('started_at', { ascending: false });
  }, [getSessionToken]);

  // Fetch error calls for error logs dashboard
  const fetchErrorCalls = useCallback(async (cutoffDate?: string, limit = 100) => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('get-call-logs', {
          body: {
            session_token: sessionToken,
            mode: 'errors',
            listOptions: { cutoffDate, limit }
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Fetched error calls via secure Edge Function');
          return { data: data.calls, error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for error calls:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for error calls:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for error calls');
    let query = supabase
      .from('vapi_call_logs')
      .select('*')
      .in('call_outcome', ['failed', 'error', 'timeout', 'no-answer']);

    if (cutoffDate) {
      query = query.gte('created_at', cutoffDate);
    }

    return await query
      .order('created_at', { ascending: false })
      .limit(limit);
  }, [getSessionToken]);

  // Fetch a single call by ID
  const fetchCall = useCallback(async (callId: string) => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('get-call-logs', {
          body: {
            session_token: sessionToken,
            mode: 'single',
            callId
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Fetched call via secure Edge Function');
          return { data: data.call, error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for single call:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for single call:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for single call');
    return await supabase
      .from('vapi_call_logs')
      .select('*')
      .eq('id', callId)
      .single();
  }, [getSessionToken]);

  // Update tags for a call
  const updateCallTags = useCallback(async (callId: string, tags: string[]) => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('manage-call-logs', {
          body: {
            session_token: sessionToken,
            operation: 'updateTags',
            callId,
            data: { tags }
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Updated tags via secure Edge Function');
          return { error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for updateTags:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for updateTags:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for updateTags');
    return await supabase
      .from('vapi_call_logs')
      .update({ tags })
      .eq('id', callId);
  }, [getSessionToken]);

  // Update call data
  const updateCall = useCallback(async (callId: string, updateData: Record<string, any>) => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('manage-call-logs', {
          body: {
            session_token: sessionToken,
            operation: 'update',
            callId,
            data: updateData
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Updated call via secure Edge Function');
          return { error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for update:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for update:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for update');
    return await supabase
      .from('vapi_call_logs')
      .update(updateData)
      .eq('id', callId);
  }, [getSessionToken]);

  // Delete a call
  const deleteCall = useCallback(async (callId: string) => {
    const sessionToken = getSessionToken();
    
    if (sessionToken) {
      try {
        const { data, error } = await supabase.functions.invoke('manage-call-logs', {
          body: {
            session_token: sessionToken,
            operation: 'delete',
            callId
          }
        });

        if (!error && data?.success) {
          console.log('[useSecureCallLogs] Deleted call via secure Edge Function');
          return { error: null };
        }
        
        console.warn('[useSecureCallLogs] Edge Function failed for delete:', error || data?.error);
      } catch (e) {
        console.warn('[useSecureCallLogs] Edge Function exception for delete:', e);
      }
    }

    // Fallback
    console.log('[useSecureCallLogs] Using direct query fallback for delete');
    return await supabase
      .from('vapi_call_logs')
      .delete()
      .eq('id', callId);
  }, [getSessionToken]);

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
