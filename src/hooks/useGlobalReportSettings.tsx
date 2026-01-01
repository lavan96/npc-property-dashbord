import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ContactDetails {
  company_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  abn: string;
}

export interface ProfessionalDisclaimer {
  text: string;
  is_enabled: boolean;
  font_size?: 'small' | 'medium' | 'large';
}

export interface GlobalReportSettings {
  contactDetails: ContactDetails;
  disclaimer: ProfessionalDisclaimer;
}

const defaultContactDetails: ContactDetails = {
  company_name: 'NPC Services',
  phone: '0433 005 110',
  email: 'admin@npcservices.com.au',
  website: 'npcservices.com.au',
  address: '',
  abn: ''
};

const defaultDisclaimer: ProfessionalDisclaimer = {
  text: 'AS A PROFESSIONAL PROPERTY CONSULTANT & BUYERS AGENT, WE PROVIDE INFORMATION AND ADVICE BASED ON OUR EXPERTISE AND EXPERIENCE IN THE REAL ESTATE MARKET. PLEASE BE AWARE THAT THE ADVICE AND INSIGHTS OFFERED ARE FOR GENERAL INFORMATIONAL PURPOSES ONLY AND SHOULD NOT BE CONSIDERED FINANCIAL ADVICE. WHILE WE STRIVE TO ENSURE THE ACCURACY AND RELEVANCE OF THE INFORMATION PROVIDED, REAL ESTATE MARKETS ARE DYNAMIC AND SUBJECT TO CHANGE AND WE CANNOT GUARANTEE THE FUTURE PERFORMANCE OR OUTCOMES OF ANY PROPERTY INVESTMENT.',
  is_enabled: true,
  font_size: 'small'
};

export function useGlobalReportSettings() {
  const [settings, setSettings] = useState<GlobalReportSettings>({
    contactDetails: defaultContactDetails,
    disclaimer: defaultDisclaimer
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('global_report_settings')
        .select('*');

      if (error) throw error;

      let contactDetails = defaultContactDetails;
      let disclaimer = defaultDisclaimer;

      data?.forEach((setting) => {
        if (setting.setting_key === 'contact_details') {
          contactDetails = setting.setting_value as unknown as ContactDetails;
        } else if (setting.setting_key === 'professional_disclaimer') {
          disclaimer = setting.setting_value as unknown as ProfessionalDisclaimer;
        }
      });

      setSettings({ contactDetails, disclaimer });
    } catch (err) {
      console.error('Error fetching global report settings:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch settings'));
    } finally {
      setIsLoading(false);
    }
  };

  return { settings, isLoading, error, refetch: fetchSettings };
}

// Standalone function to fetch settings (for use in non-hook contexts)
export async function fetchGlobalReportSettings(): Promise<GlobalReportSettings> {
  try {
    const { data, error } = await supabase
      .from('global_report_settings')
      .select('*');

    if (error) throw error;

    let contactDetails = defaultContactDetails;
    let disclaimer = defaultDisclaimer;

    data?.forEach((setting) => {
      if (setting.setting_key === 'contact_details') {
        contactDetails = setting.setting_value as unknown as ContactDetails;
      } else if (setting.setting_key === 'professional_disclaimer') {
        disclaimer = setting.setting_value as unknown as ProfessionalDisclaimer;
      }
    });

    return { contactDetails, disclaimer };
  } catch (err) {
    console.error('Error fetching global report settings:', err);
    return {
      contactDetails: defaultContactDetails,
      disclaimer: defaultDisclaimer
    };
  }
}
