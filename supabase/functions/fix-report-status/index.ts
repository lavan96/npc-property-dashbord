import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔧 Fixing report statuses...');

    // Update all pending reports that have content to completed
    const { data, error } = await supabase
      .from('investment_reports')
      .update({ status: 'completed' })
      .eq('status', 'pending')
      .neq('report_content', '')
      .select('id, property_address');

    if (error) {
      throw error;
    }

    console.log(`✅ Updated ${data?.length || 0} reports to completed status`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: data?.length || 0,
        reports: data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
