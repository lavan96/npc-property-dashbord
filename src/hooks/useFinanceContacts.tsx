import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FinanceContact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  is_default: boolean;
  is_active: boolean;
  contact_type: string;
  notes: string | null;
}

export function useFinanceContacts() {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['finance-agent-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_agent_contacts')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');
      
      if (error) throw error;
      return data as FinanceContact[];
    },
  });

  const defaultContact = contacts.find(c => c.is_default) || contacts[0];

  return {
    contacts,
    defaultContact,
    isLoading,
    hasContacts: contacts.length > 0,
  };
}
