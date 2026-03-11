import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TeamUser {
  id: string;
  username: string;
  email: string | null;
  is_active: boolean;
}

/**
 * Fetches all active team members from custom_users.
 * Used for assigning reminders and deals to specific users.
 */
export function useTeamUsers() {
  return useQuery({
    queryKey: ['team-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_users')
        .select('id, username, email, is_active')
        .eq('is_active', true)
        .order('username');

      if (error) throw error;
      return (data || []) as TeamUser[];
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}
