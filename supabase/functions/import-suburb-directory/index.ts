import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🌏 Fetching Australian suburb directory from Matthew Proctor dataset...');
    
    // Fetch the CSV from the public source
    const csvUrl = 'https://www.matthewproctor.com/Content/postcodes/australian_postcodes.csv';
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    
    // Parse headers (first line)
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    console.log('📋 CSV Headers:', headers);

    // Find column indices
    const postcodeIdx = headers.findIndex(h => h === 'postcode');
    const localityIdx = headers.findIndex(h => h === 'locality');
    const stateIdx = headers.findIndex(h => h === 'state');

    if (postcodeIdx === -1 || localityIdx === -1 || stateIdx === -1) {
      throw new Error(`Required columns not found. Headers: ${headers.join(', ')}`);
    }

    // Parse records
    const records: { suburb: string; postcode: string; state: string }[] = [];
    const seenKeys = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle CSV with potential quotes
      const values = line.match(/("([^"]*)"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
      
      const postcode = values[postcodeIdx]?.padStart(4, '0');
      const suburb = values[localityIdx]?.toLowerCase();
      const state = values[stateIdx]?.toUpperCase();

      if (postcode && suburb && state && postcode.length === 4) {
        const key = `${suburb}-${postcode}-${state}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          records.push({ suburb, postcode, state });
        }
      }
    }

    console.log(`📍 Parsed ${records.length} unique suburb records`);

    // Clear existing data
    const { error: deleteError } = await supabase
      .from('suburb_directory')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.warn('⚠️ Delete warning:', deleteError.message);
    }

    // Insert in batches of 1000
    const batchSize = 1000;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('suburb_directory')
        .insert(batch);

      if (error) {
        console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
        console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`);
      }
    }

    console.log(`🎉 Import complete: ${inserted} inserted, ${errors} errors`);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_parsed: records.length,
        inserted,
        errors,
        source: csvUrl
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Import error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
