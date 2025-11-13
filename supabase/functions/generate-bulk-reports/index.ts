import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PropertyInput {
  id: string; // Airtable record ID
  address: string;
  title?: string;
  suburb?: string;
  state?: string;
  zipCode?: string;
}

interface BulkGenerationRequest {
  properties: PropertyInput[];
  userId: string;
}

serve(async (req) => {
  console.log('🚀 Bulk report generation function invoked');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const { properties, userId }: BulkGenerationRequest = await req.json();
    
    console.log(`📦 Received bulk request for ${properties.length} properties from user ${userId}`);

    // Validate input
    if (!properties || properties.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No properties provided',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (properties.length > 10) {
      return new Response(JSON.stringify({ 
        error: 'Maximum 10 properties allowed per batch',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'User ID is required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create job record
    const propertyIds = properties.map(p => p.id);
    const propertyAddresses = properties.map(p => p.address);

    const { data: job, error: jobError } = await supabase
      .from('bulk_generation_jobs')
      .insert({
        created_by: userId,
        status: 'processing',
        total_reports: properties.length,
        completed_reports: 0,
        failed_reports: 0,
        property_ids: propertyIds,
        property_addresses: propertyAddresses,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('❌ Failed to create job:', jobError);
      throw new Error(`Failed to create job: ${jobError?.message}`);
    }

    console.log(`✅ Created job ${job.id}`);

    // Create item records
    const items = properties.map(property => ({
      job_id: job.id,
      property_listing_id: property.id,
      property_address: property.address,
      status: 'pending',
    }));

    const { error: itemsError } = await supabase
      .from('bulk_generation_items')
      .insert(items);

    if (itemsError) {
      console.error('❌ Failed to create items:', itemsError);
      // Update job to failed
      await supabase
        .from('bulk_generation_jobs')
        .update({ 
          status: 'failed',
          error_message: `Failed to create items: ${itemsError.message}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      throw new Error(`Failed to create items: ${itemsError.message}`);
    }

    console.log(`✅ Created ${items.length} items`);

    // Start background processing
    EdgeRuntime.waitUntil(
      processReportsInBackground(supabase, job.id, properties, userId)
    );

    // Return immediately with job ID
    return new Response(JSON.stringify({ 
      success: true,
      jobId: job.id,
      message: `Started bulk generation for ${properties.length} properties`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in bulk generation:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processReportsInBackground(
  supabase: any,
  jobId: string,
  properties: PropertyInput[],
  userId: string
) {
  console.log(`🔄 Starting background processing for job ${jobId}`);
  
  const BATCH_SIZE = 3; // Process 3 reports concurrently
  let completedCount = 0;
  let failedCount = 0;

  try {
    // Process in batches
    for (let i = 0; i < properties.length; i += BATCH_SIZE) {
      const batch = properties.slice(i, Math.min(i + BATCH_SIZE, properties.length));
      
      console.log(`📊 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: properties ${i + 1}-${i + batch.length}`);
      
      // Process batch concurrently
      const results = await Promise.allSettled(
        batch.map(property => generateSingleReport(supabase, jobId, property, userId))
      );

      // Update counts
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          completedCount++;
        } else {
          failedCount++;
        }
      });

      // Update job progress
      await supabase
        .from('bulk_generation_jobs')
        .update({
          completed_reports: completedCount,
          failed_reports: failedCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      console.log(`✅ Batch complete. Progress: ${completedCount}/${properties.length} succeeded, ${failedCount} failed`);

      // Add small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < properties.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Mark job as completed
    const finalStatus = failedCount === properties.length ? 'failed' : 'completed';
    await supabase
      .from('bulk_generation_jobs')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`🎉 Job ${jobId} completed: ${completedCount} succeeded, ${failedCount} failed`);

  } catch (error) {
    console.error(`❌ Fatal error processing job ${jobId}:`, error);
    
    // Mark job as failed
    await supabase
      .from('bulk_generation_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

async function generateSingleReport(
  supabase: any,
  jobId: string,
  property: PropertyInput,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  
  console.log(`🔨 Generating report for: ${property.address}`);

  try {
    // Get the item record
    const { data: item } = await supabase
      .from('bulk_generation_items')
      .select('id')
      .eq('job_id', jobId)
      .eq('property_listing_id', property.id)
      .single();

    if (!item) {
      throw new Error('Item not found');
    }

    // Mark item as processing
    await supabase
      .from('bulk_generation_items')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    // Call the generate-investment-report function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-investment-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        propertyAddress: property.address,
        propertyDetails: {
          suburb: property.suburb,
          state: property.state,
          zipCode: property.zipCode,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Report generation failed: ${errorText}`);
    }

    const reportData = await response.json();
    
    if (!reportData.success) {
      throw new Error(reportData.error || 'Report generation failed');
    }

    // Save the report to database
    const { data: savedReport, error: saveError } = await supabase
      .from('investment_reports')
      .insert({
        property_address: property.address,
        report_content: reportData.reportContent,
        sources_content: reportData.sourcesContent || null,
        location_intelligence: reportData.enhancedData?.locationIntelligence || null,
        investment_score: reportData.enhancedData?.investmentScore || null,
        financial_calculations: reportData.enhancedData?.financials || null,
        demographics_data: reportData.enhancedData?.demographics || null,
        economic_data: reportData.enhancedData?.economics || null,
        generated_by: userId,
      })
      .select()
      .single();

    if (saveError) {
      throw new Error(`Failed to save report: ${saveError.message}`);
    }

    const processingTime = Math.round((Date.now() - startTime) / 1000);

    // Mark item as completed
    await supabase
      .from('bulk_generation_items')
      .update({
        status: 'completed',
        report_id: savedReport.id,
        completed_at: new Date().toISOString(),
        processing_time_seconds: processingTime,
      })
      .eq('id', item.id);

    console.log(`✅ Report generated for ${property.address} in ${processingTime}s`);

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to generate report for ${property.address}:`, errorMessage);

    // Mark item as failed
    const { data: item } = await supabase
      .from('bulk_generation_items')
      .select('id')
      .eq('job_id', jobId)
      .eq('property_listing_id', property.id)
      .single();

    if (item) {
      await supabase
        .from('bulk_generation_items')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.id);
    }

    return { success: false, error: errorMessage };
  }
}
