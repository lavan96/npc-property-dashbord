import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { limit = 500 } = await req.json().catch(() => ({}));

    console.log(`📦 Archiving oldest ${limit} investment reports...`);

    // First, get the oldest reports
    const { data: oldestReports, error: fetchError } = await supabase
      .from('investment_reports')
      .select('id, property_address, created_at')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw fetchError;
    }

    if (!oldestReports || oldestReports.length === 0) {
      return new Response(
        JSON.stringify({ success: true, archived: 0, message: 'No reports to archive' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportIds = oldestReports.map(r => r.id);

    // Update them to archived
    const { error: updateError } = await supabase
      .from('investment_reports')
      .update({ is_archived: true })
      .in('id', reportIds);

    if (updateError) {
      throw updateError;
    }

    console.log(`✅ Archived ${oldestReports.length} reports`);

    return new Response(
      JSON.stringify({
        success: true,
        archived: oldestReports.length,
        oldestDate: oldestReports[0]?.created_at,
        newestDate: oldestReports[oldestReports.length - 1]?.created_at,
        sampleAddresses: oldestReports.slice(0, 5).map(r => r.property_address),
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
