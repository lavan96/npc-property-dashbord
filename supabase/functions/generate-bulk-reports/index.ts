import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

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

Deno.serve(async (req) => {
  console.log('🚀 Bulk report generation function invoked');
  
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
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
    const body = await req.json();
    const { properties, userId }: BulkGenerationRequest = body;
    
    // SECURITY: Verify authentication and ensure userId matches authenticated user
    const { error: authError, userId: authenticatedUserId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[generate-bulk-reports] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    
    // CRITICAL FIX: Verify that the userId in the request matches the authenticated user
    // This prevents users from generating reports for other users
    if (userId && userId !== authenticatedUserId) {
      console.log(`[generate-bulk-reports] User ID mismatch: ${userId} != ${authenticatedUserId}`);
      return new Response(JSON.stringify({ 
        error: 'User ID mismatch. You can only generate reports for yourself.',
        success: false 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Use authenticated user ID instead of request body userId
    const finalUserId = authenticatedUserId || userId;
    
    console.log(`📦 Received bulk request for ${properties.length} properties from user ${finalUserId}`);

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
        created_by: finalUserId,
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
      processReportsInBackground(supabase, job.id, properties, finalUserId)
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
  let createdReportId: string | null = null;

  console.log(`🔨 Generating report for: ${property.address}`);

  try {
    // Get the item record
    const { data: item } = await supabase
      .from('bulk_generation_items')
      .select('id, report_id')
      .eq('job_id', jobId)
      .eq('property_listing_id', property.id)
      .single();

    if (!item) {
      throw new Error('Item not found');
    }

    // STEP 1: Pre-create the investment_reports row so generate-investment-report
    // operates on a single, persistent row (no duplicates). Reuse if a previous
    // attempt already created one for this item.
    let reportId: string | null = item.report_id || null;
    if (!reportId) {
      const { data: created, error: createErr } = await supabase
        .from('investment_reports')
        .insert({
          property_address: property.address,
          report_content: '', // placeholder — filled by generate-investment-report
          status: 'processing',
          generated_by: userId,
          report_scope: 'address',
        })
        .select('id')
        .single();

      if (createErr || !created) {
        throw new Error(`Failed to pre-create report row: ${createErr?.message}`);
      }
      reportId = created.id;
      createdReportId = reportId;
    }

    // Mark item as processing and link the report row
    await supabase
      .from('bulk_generation_items')
      .update({
        status: 'processing',
        report_id: reportId,
        started_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    // STEP 2: Call generate-investment-report with reportId.
    // Service-to-service auth pattern (per memory): Authorization: Bearer SERVICE_ROLE
    // + apikey: ANON_KEY so the gateway accepts the request and verifyAuth recognizes
    // the service_role caller. Both env vars are trimmed defensively.
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-investment-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        reportId,
        propertyAddress: property.address,
        propertyDetails: {
          suburb: property.suburb,
          state: property.state,
          zipCode: property.zipCode,
          queryType: 'address',
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

    // STEP 3: generate-investment-report has already written all content/enhanced
    // data to the row identified by reportId. We just confirm the row reached a
    // completed state and link it to the bulk item.
    const processingTime = Math.round((Date.now() - startTime) / 1000);

    await supabase
      .from('bulk_generation_items')
      .update({
        status: 'completed',
        report_id: reportId,
        completed_at: new Date().toISOString(),
        processing_time_seconds: processingTime,
      })
      .eq('id', item.id);

    console.log(`✅ Report generated for ${property.address} in ${processingTime}s (reportId=${reportId})`);

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to generate report for ${property.address}:`, errorMessage);

    // Mark the pre-created report row as failed (if we created one)
    if (createdReportId) {
      await supabase
        .from('investment_reports')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', createdReportId);
    }

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
