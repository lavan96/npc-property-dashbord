import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GAMMA_API_URL = 'https://public-api.gamma.app/v1.0';

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    const authResult = await verifyAuth(supabase, req.headers, body);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    const {
      agreement_id,
      buyer_name,
      address,
      phone_number,
      email,
      initial_commitment_fee,
    } = body;

    if (!agreement_id || !buyer_name || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agreement_id, buyer_name, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gammaApiKey = Deno.env.get('GAMMA_API_KEY');
    const gammaTemplateId = Deno.env.get('GAMMA_TEMPLATE_ID');

    if (!gammaApiKey || !gammaTemplateId) {
      return new Response(
        JSON.stringify({ error: 'Gamma API not configured. Missing GAMMA_API_KEY or GAMMA_TEMPLATE_ID.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the prompt that instructs Gamma to fill placeholders
    const prompt = `Replace the placeholders in this agreement template with the following details. Do NOT change any other content, formatting, structure, or wording — only replace the bracketed placeholders exactly:

[Buyer's Name] → ${buyer_name}
[Address] → ${address || 'N/A'}
[Phone Number] → ${phone_number || 'N/A'}
[Email] → ${email}
[Initial Commitment Fee] → ${initial_commitment_fee || '$1,500.00 + GST'}

Keep everything else exactly as-is.`;

    console.log('[Gamma] Creating agreement from template:', gammaTemplateId);

    // Step 1: Create from template
    const createRes = await fetch(`${GAMMA_API_URL}/generations/from-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': gammaApiKey,
      },
      body: JSON.stringify({
        gammaId: gammaTemplateId,
        prompt,
        exportAs: 'pdf',
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('[Gamma] Create failed:', JSON.stringify(createData));
      return new Response(
        JSON.stringify({ error: `Gamma API error: ${createData.message || createData.error || 'Unknown'}`, details: createData }),
        { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const generationId = createData.generationId || createData.id;
    console.log('[Gamma] Generation started:', generationId);

    // Step 2: Poll for completion (max 90 seconds)
    let gammaResult: any = null;
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000)); // 3s between polls

      const pollRes = await fetch(`${GAMMA_API_URL}/generations/${generationId}`, {
        headers: { 'X-API-KEY': gammaApiKey },
      });
      const pollData = await pollRes.json();

      console.log(`[Gamma] Poll ${i + 1}/${maxAttempts}: status=${pollData.status}`);

      if (pollData.status === 'completed') {
        gammaResult = pollData;
        break;
      } else if (pollData.status === 'failed' || pollData.status === 'error') {
        console.error('[Gamma] Generation failed:', JSON.stringify(pollData));
        return new Response(
          JSON.stringify({ error: 'Gamma generation failed', details: pollData }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!gammaResult) {
      return new Response(
        JSON.stringify({ error: 'Gamma generation timed out after 90 seconds' }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gammaUrl = gammaResult.gammaUrl || gammaResult.url;
    const pdfUrl = gammaResult.exportUrl || gammaResult.pdfUrl;
    const gammaDocId = gammaResult.gammaId || generationId;

    console.log('[Gamma] Completed. URL:', gammaUrl, 'PDF:', pdfUrl);

    // Step 3: Download PDF and store in Supabase Storage
    let pdfStoragePath: string | null = null;
    if (pdfUrl) {
      try {
        const pdfRes = await fetch(pdfUrl);
        if (pdfRes.ok) {
          const pdfBuffer = await pdfRes.arrayBuffer();
          const storagePath = `agreements/${agreement_id}/agreement.pdf`;

          const { error: uploadErr } = await supabase.storage
            .from('agency-agreements')
            .upload(storagePath, new Uint8Array(pdfBuffer), {
              contentType: 'application/pdf',
              upsert: true,
            });

          if (uploadErr) {
            console.error('[Gamma] PDF upload error:', uploadErr.message);
          } else {
            pdfStoragePath = storagePath;
            console.log('[Gamma] PDF stored at:', storagePath);
          }
        }
      } catch (dlErr: any) {
        console.error('[Gamma] PDF download error:', dlErr.message);
      }
    }

    // Step 4: Update the agreement record
    const updateData: Record<string, any> = {
      gamma_document_id: gammaDocId,
      gamma_document_url: gammaUrl,
    };
    if (pdfStoragePath) {
      updateData.pdf_storage_path = pdfStoragePath;
    }

    const { error: updateErr } = await supabase
      .from('agency_agreements')
      .update(updateData)
      .eq('id', agreement_id);

    if (updateErr) {
      console.error('[Gamma] DB update error:', updateErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        gamma_document_id: gammaDocId,
        gamma_document_url: gammaUrl,
        pdf_url: pdfUrl,
        pdf_storage_path: pdfStoragePath,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[gamma-agreement-generator] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
