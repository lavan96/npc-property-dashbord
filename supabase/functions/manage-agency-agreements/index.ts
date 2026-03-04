import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authResult = await verifyAuth(req, supabase);
    if (authResult.error) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }

    const body = await req.json();
    const { action } = body;

    // ─── LIST AGREEMENTS ────────────────────────────────────
    if (action === 'list') {
      const query = supabase
        .from('agency_agreements')
        .select('*')
        .order('created_at', { ascending: false });

      if (body.client_id) {
        query.eq('client_id', body.client_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ agreements: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── GENERATE AGREEMENT (create record + store PDF metadata) ──
    if (action === 'generate') {
      const {
        client_id, buyer_names, buyer_address, buyer_phone,
        buyer_email, agreement_date, secondary_buyer_name,
        deal_id, notes,
      } = body;

      if (!client_id || !buyer_names || !buyer_email) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: client_id, buyer_names, buyer_email' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: agreement, error } = await supabase
        .from('agency_agreements')
        .insert({
          client_id,
          deal_id: deal_id || null,
          status: 'generated',
          buyer_names,
          buyer_address: buyer_address || null,
          buyer_phone: buyer_phone || null,
          buyer_email,
          agreement_date: agreement_date || new Date().toISOString().split('T')[0],
          secondary_buyer_name: secondary_buyer_name || null,
          notes: notes || null,
          created_by: authResult.username || authResult.userId,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, agreement_id: agreement.id, agreement }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SEND VIA DOCUSIGN ─────────────────────────────────
    if (action === 'send_docusign') {
      const { agreement_id } = body;
      if (!agreement_id) {
        return new Response(
          JSON.stringify({ error: 'Missing agreement_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch agreement
      const { data: agreement, error: fetchErr } = await supabase
        .from('agency_agreements')
        .select('*')
        .eq('id', agreement_id)
        .single();

      if (fetchErr || !agreement) {
        return new Response(
          JSON.stringify({ error: 'Agreement not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // DocuSign API credentials
      const docusignAccountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
      const docusignAccessToken = Deno.env.get('DOCUSIGN_ACCESS_TOKEN');
      const docusignBaseUrl = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net/restapi';

      if (!docusignAccountId || !docusignAccessToken) {
        // Update status to generated but return info about missing config
        return new Response(
          JSON.stringify({
            error: 'DocuSign credentials not configured. Please add DOCUSIGN_ACCOUNT_ID and DOCUSIGN_ACCESS_TOKEN secrets.',
            requires_setup: true,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build the DocuSign envelope
      // We use a document generated on-the-fly containing the agreement text
      // In production, this would use the stored PDF. For now, we create an HTML document.
      const agreementHtml = generateAgreementHtml(agreement);
      const base64Doc = btoa(unescape(encodeURIComponent(agreementHtml)));

      const envelopeDefinition = {
        emailSubject: `Buyer's Agent Agreement - Naidu Property Consulting Services`,
        emailBlurb: `Dear ${agreement.buyer_names},\n\nPlease review and sign the attached Buyer's Agent Agreement.\n\nRegards,\nNaidu Property Consulting Services`,
        documents: [
          {
            documentBase64: base64Doc,
            name: 'Buyers Agent Agreement.html',
            fileExtension: 'html',
            documentId: '1',
          },
        ],
        recipients: {
          signers: [
            {
              email: agreement.buyer_email,
              name: agreement.buyer_names,
              recipientId: '1',
              routingOrder: '1',
              tabs: {
                signHereTabs: [
                  {
                    anchorString: '___BUYER_SIGNATURE___',
                    anchorUnits: 'pixels',
                    anchorXOffset: '0',
                    anchorYOffset: '-10',
                  },
                ],
                dateSignedTabs: [
                  {
                    anchorString: '___BUYER_DATE___',
                    anchorUnits: 'pixels',
                    anchorXOffset: '0',
                    anchorYOffset: '-10',
                  },
                ],
              },
            },
            // Secondary signer if present
            ...(agreement.secondary_buyer_name
              ? [
                  {
                    email: agreement.buyer_email, // Same email for now
                    name: agreement.secondary_buyer_name,
                    recipientId: '2',
                    routingOrder: '2',
                    tabs: {
                      signHereTabs: [
                        {
                          anchorString: '___SECONDARY_SIGNATURE___',
                          anchorUnits: 'pixels',
                          anchorXOffset: '0',
                          anchorYOffset: '-10',
                        },
                      ],
                    },
                  },
                ]
              : []),
          ],
        },
        status: 'sent', // Send immediately
      };

      try {
        const dsResponse = await fetch(
          `${docusignBaseUrl}/v2.1/accounts/${docusignAccountId}/envelopes`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${docusignAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(envelopeDefinition),
          }
        );

        const dsData = await dsResponse.json();

        if (!dsResponse.ok) {
          console.error('[DocuSign] Envelope creation failed:', dsData);
          return new Response(
            JSON.stringify({
              error: `DocuSign error: ${dsData.message || dsData.errorCode || 'Unknown error'}`,
              details: dsData,
            }),
            { status: dsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update agreement with DocuSign info
        const { error: updateErr } = await supabase
          .from('agency_agreements')
          .update({
            status: 'sent',
            docusign_envelope_id: dsData.envelopeId,
            docusign_status: dsData.status,
            docusign_sent_at: new Date().toISOString(),
            sent_via: 'docusign',
          })
          .eq('id', agreement_id);

        if (updateErr) {
          console.error('[DocuSign] Failed to update agreement:', updateErr);
        }

        return new Response(
          JSON.stringify({
            success: true,
            envelope_id: dsData.envelopeId,
            status: dsData.status,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (dsError: any) {
        console.error('[DocuSign] API error:', dsError);
        return new Response(
          JSON.stringify({ error: `DocuSign API error: ${dsError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── CHECK DOCUSIGN STATUS ─────────────────────────────
    if (action === 'check_status') {
      const { agreement_id } = body;

      const { data: agreement, error: fetchErr } = await supabase
        .from('agency_agreements')
        .select('*')
        .eq('id', agreement_id)
        .single();

      if (fetchErr || !agreement || !agreement.docusign_envelope_id) {
        return new Response(
          JSON.stringify({ error: 'Agreement or envelope not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const docusignAccountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
      const docusignAccessToken = Deno.env.get('DOCUSIGN_ACCESS_TOKEN');
      const docusignBaseUrl = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net/restapi';

      if (!docusignAccountId || !docusignAccessToken) {
        return new Response(
          JSON.stringify({ error: 'DocuSign not configured' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const dsResponse = await fetch(
        `${docusignBaseUrl}/v2.1/accounts/${docusignAccountId}/envelopes/${agreement.docusign_envelope_id}`,
        {
          headers: { Authorization: `Bearer ${docusignAccessToken}` },
        }
      );

      const dsData = await dsResponse.json();
      if (!dsResponse.ok) {
        return new Response(
          JSON.stringify({ error: `DocuSign: ${dsData.message || 'Unknown'}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Map DocuSign status to our status
      let newStatus = agreement.status;
      const updates: Record<string, any> = {
        docusign_status: dsData.status,
      };

      if (dsData.status === 'completed') {
        newStatus = 'signed';
        updates.docusign_signed_at = dsData.completedDateTime || new Date().toISOString();
      } else if (dsData.status === 'delivered') {
        newStatus = 'delivered';
      } else if (dsData.status === 'sent') {
        newStatus = 'sent';
      } else if (dsData.status === 'declined') {
        newStatus = 'declined';
      } else if (dsData.status === 'voided') {
        newStatus = 'voided';
        updates.docusign_voided_at = dsData.voidedDateTime || new Date().toISOString();
      }

      updates.status = newStatus;

      await supabase
        .from('agency_agreements')
        .update(updates)
        .eq('id', agreement_id);

      return new Response(
        JSON.stringify({ success: true, status: newStatus, docusign_status: dsData.status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── VOID AGREEMENT ────────────────────────────────────
    if (action === 'void') {
      const { agreement_id, void_reason } = body;

      const { data: agreement } = await supabase
        .from('agency_agreements')
        .select('docusign_envelope_id')
        .eq('id', agreement_id)
        .single();

      // Void in DocuSign if applicable
      if (agreement?.docusign_envelope_id) {
        const docusignAccountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
        const docusignAccessToken = Deno.env.get('DOCUSIGN_ACCESS_TOKEN');
        const docusignBaseUrl = Deno.env.get('DOCUSIGN_BASE_URL') || 'https://demo.docusign.net/restapi';

        if (docusignAccountId && docusignAccessToken) {
          await fetch(
            `${docusignBaseUrl}/v2.1/accounts/${docusignAccountId}/envelopes/${agreement.docusign_envelope_id}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${docusignAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: 'voided',
                voidedReason: void_reason || 'Voided by agent',
              }),
            }
          );
        }
      }

      await supabase
        .from('agency_agreements')
        .update({
          status: 'voided',
          docusign_status: 'voided',
          docusign_voided_at: new Date().toISOString(),
          notes: void_reason ? `Voided: ${void_reason}` : 'Voided',
        })
        .eq('id', agreement_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[manage-agency-agreements] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Generate the agreement HTML document for DocuSign
 * This mirrors the PDF template structure with pre-filled values
 */
function generateAgreementHtml(agreement: any): string {
  const date = agreement.agreement_date
    ? new Date(agreement.agreement_date).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Georgia', serif; margin: 40px; color: #1a1a1a; line-height: 1.6; font-size: 11pt; }
  h1 { text-align: center; font-size: 18pt; margin-bottom: 30px; color: #0a2e4a; }
  h2 { font-size: 13pt; margin-top: 24px; color: #0a2e4a; }
  .header-block { margin-bottom: 30px; }
  .party { margin-bottom: 15px; }
  .party-label { font-weight: bold; }
  table.fees { width: 100%; border-collapse: collapse; margin: 15px 0; }
  table.fees th, table.fees td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
  table.fees th { background: #f0f4f8; }
  .signature-block { margin-top: 40px; display: flex; gap: 80px; }
  .sig-col { flex: 1; }
  .sig-line { border-bottom: 1px solid #333; height: 40px; margin: 5px 0; }
  .footer { text-align: center; font-size: 9pt; color: #666; margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 8px; }
  ul { padding-left: 20px; }
  ul li { margin-bottom: 6px; }
</style>
</head>
<body>

<h1>PROPERTY CONSULTANT & BUYER'S AGENT AGREEMENT</h1>

<div class="header-block">
  <p>THIS AGREEMENT is made on <strong>${date}</strong> by and between:</p>
  
  <div class="party">
    <p class="party-label">1. ${agreement.buyer_names}</p>
    <p>${agreement.buyer_address || '[Address]'}</p>
    <p>${agreement.buyer_phone || '[Phone Number]'}</p>
    <p>${agreement.buyer_email || '[Email]'}</p>
    <p>(Hereinafter referred to as "the Buyer")</p>
  </div>
  
  <div class="party">
    <p class="party-label">2. Naidu Group Pty Ltd T/A Naidu Property Consulting Services</p>
    <p>Level 5, Nexus Norwest<br>4 Columbia Ct, Norwest, NSW, 2153</p>
    <p>admin@npcservices.com.au</p>
    <p>(Hereinafter referred to as "the Agent")</p>
  </div>
  
  <p>The parties agree as follows:</p>
</div>

<h2>1. ENGAGEMENT OF AGENT</h2>
<p>The Buyer engages the Agent to act as their exclusive representative for the purpose of identifying and acquiring real property in accordance with the terms of this Agreement.</p>

<h2>2. TERM OF AGREEMENT</h2>
<p>This Agreement will be effective from the date of execution and will continue until the earlier of:</p>
<ul>
  <li>a) Ninety (90) days from the date of execution of this Agreement, during which the Agent will source and present suitable property opportunities to the Buyer; or</li>
  <li>b) The completion of the purchase of a property by the Buyer.</li>
</ul>

<h2>3. AGENT'S RESPONSIBILITIES</h2>
<p>The Agent agrees to:</p>
<ol>
  <li><strong>Locate & Present</strong> — To locate and present to the Buyer properties that match the Buyer's criteria.</li>
  <li><strong>Advise & Evaluate</strong> — Provide information and advice to the Buyer about the market, potential properties, and assist in evaluating those properties.</li>
  <li><strong>Coordinate Viewings</strong> — Coordinate property viewings and inspections if necessary.</li>
  <li><strong>Negotiate Terms</strong> — Negotiate the terms and conditions of any offers, including price, with the Seller or their agent on the Buyer's behalf.</li>
  <li><strong>Prepare Documents</strong> — Assist the Buyer in the preparation and execution of purchase-related documents.</li>
  <li><strong>Timely Updates</strong> — Provide timely updates and communications to the Buyer throughout the property acquisition process.</li>
</ol>

<h2>4. BUYER'S RESPONSIBILITIES</h2>
<p>The Buyer agrees to:</p>
<ul>
  <li>Provide the Agent with accurate and up-to-date information about their preferences, financial situation, and criteria for purchasing the property.</li>
  <li>Respond promptly to the Agent's communications and take reasonable steps to facilitate the transaction.</li>
  <li>Advise the Agent immediately if the Buyer becomes aware of any issues that could affect the potential property acquisition.</li>
</ul>

<h2>5. AGENT'S FEES AND COMMISSION</h2>
<p>The Buyer agrees to pay the Agent the below commission of the purchase price of any property acquired as a result of the Agent's services.</p>

<table class="fees">
  <tr><th>Initial Commitment Fee (ICF):</th><td>$1,500.00 + GST (Non-Refundable, deducted from Final Payment from Property Purchase)</td></tr>
</table>

<table class="fees">
  <tr><th>Property Purchase Price</th><th>Percentage Agent Fee + GST</th></tr>
  <tr><td>Below $650,000</td><td>1.3%</td></tr>
  <tr><td>$650,000 - $1,000,000</td><td>1.2%</td></tr>
  <tr><td>$1,000,000 - $2,000,000</td><td>1.1%</td></tr>
  <tr><td>Above $2,000,000</td><td>1.0%</td></tr>
</table>

<p><em>Disclosure: If applicable, should the Buyer opt to proceed with a purchase of a property where the above-mentioned commission can be requested from a developer/builder, the Buyer will then only be charged the ICF.</em></p>
<p>The commission is payable upon completion of the purchase transaction (settlement date).</p>

<h2>6. BUYER'S AGENT DUTY OF CARE AND DISCLOSURE</h2>
<p>The Agent shall act in the best interests of the Buyer at all times. The Agent shall disclose any potential conflicts of interest, including but not limited to any relationships with property sellers, developers, or other agents, and shall provide the Buyer with all relevant information to make an informed decision.</p>
<p>The Buyer acknowledges that while the Agent will use reasonable efforts to find suitable properties, the Agent does not guarantee the availability or suitability of any specific property.</p>

<h2>7. TERMINATION OF AGREEMENT</h2>
<p>This Agreement may be terminated by either party in writing with 14 Days' notice. Upon termination, the Buyer will:</p>
<ul>
  <li>Pay any outstanding commission due to the Agent for services rendered up to the termination date, should it be applicable.</li>
  <li>Reimburse the Agent for any reasonable expenses incurred during the course of performing their obligations under this Agreement.</li>
</ul>

<h2>8. DISPUTE RESOLUTION</h2>
<p>In the event of any dispute arising from this Agreement, the parties agree to first attempt to resolve the dispute through negotiation. If the dispute cannot be resolved through negotiation, the parties agree to submit the matter to mediation or arbitration before pursuing legal action.</p>

<h2>9. PRIVACY AND CONFIDENTIALITY</h2>
<p>The Agent agrees to maintain the confidentiality of the Buyer's personal and financial information. The Agent will not disclose such information to any third party unless required by law or unless the Buyer provides written consent.</p>

<h2>10. ENTIRE AGREEMENT</h2>
<p>This Agreement constitutes the entire understanding between the parties and supersedes all prior discussions, understandings, or agreements related to the subject matter hereof. Any amendments to this Agreement must be made in writing and signed by both parties.</p>

<p>The parties hereto have executed this Agreement as of the day and year first written above.</p>

<div style="margin-top: 40px;">
  <table style="width: 100%; border: none;">
    <tr>
      <td style="width: 48%; border: none; vertical-align: top;">
        <p><strong>Buyer's Name:</strong> ${agreement.buyer_names}</p>
        <p><strong>Buyer's Signature:</strong></p>
        <div>___BUYER_SIGNATURE___</div>
        <p><strong>Date:</strong> ___BUYER_DATE___</p>
      </td>
      <td style="width: 4%; border: none;"></td>
      <td style="width: 48%; border: none; vertical-align: top;">
        ${
          agreement.secondary_buyer_name
            ? `<p><strong>Buyer's Name:</strong> ${agreement.secondary_buyer_name}</p>
               <p><strong>Buyer's Signature:</strong></p>
               <div>___SECONDARY_SIGNATURE___</div>
               <p><strong>Date:</strong> ___BUYER_DATE___</p>`
            : ''
        }
      </td>
    </tr>
  </table>
</div>

<div style="margin-top: 40px;">
  <p><strong>Agent's Name:</strong> ___________________________</p>
  <p><strong>Agent Signature:</strong> ___________________________</p>
  <p><strong>Date:</strong> ___________________________</p>
</div>

<h2 style="page-break-before: always;">Terms and Conditions</h2>

<h3>1.1</h3>
<p>The client appoints (NPC Services) Naidu Property Consulting Services as their exclusive agent to perform services in respect to a property which meets the specifications provided the client, in accordance with the terms of this Agreement.</p>

<h3>1.2</h3>
<p>The Parties will be deemed to have accepted the terms of this agreement upon the Client's execution of this Agreement (Including Electronic Execution) or upon NPC Services receipt of any commission from the Client.</p>

<h3>1.3</h3>
<p>The term of this Agreement will be from the date the client accepts the terms of this agreement, after which this agreement will remain enforceable until it is terminated by either party giving (14) days' notice in writing.</p>

<h3>1.4 The Client Agrees to:</h3>
<p>1.4.1 Notify NPC Services in writing of any amendments to the personal details or property specifications.</p>
<p>1.4.2 Always Cooperate with NPC Services.</p>
<p>1.4.3 Obtain Independent legal, financial, investment, tax and other advice pursuant to the Purchase.</p>
<p>1.4.4 Not purchase any property which was presented by NPC Services to the client during the term.</p>
<p>1.4.5 Not appoint another agent to act on its behalf during the time of the term.</p>

<h3>1.5</h3>
<p>The Client warrants that they have authority to enter into this agreement.</p>

<h3>1.6</h3>
<p>The Client warrants they are not subject to any earlier or concurrent agency agreement which would conflict with its obligations.</p>

<h3>1.7</h3>
<p>The Client agrees to pay the commission/sign up fee to NPC Services as specified.</p>

<h3>1.8</h3>
<p>The Client agrees to pay NPC Services the applicable Commission upon the earlier of: entering a contract, purchasing or procuring that another person purchases, or becoming the legal or equitable beneficial owner of a property.</p>

<h3>1.9</h3>
<p>The Commission will also be payable where any of the matters in clause 1.8 arise at anytime within 12 months after termination.</p>

<h3>1.10</h3>
<p>The Client indemnifies NPC Services for all expenses, costs, and disbursements incurred in recovering any outstanding fees.</p>

<h3>1.11</h3>
<p>The Client acknowledges that any data information or advice provided by NPC Services is of general purpose only and does not constitute financial or investment advice.</p>

<h3>1.12</h3>
<p>The Client acknowledges that the market data provided is solely for the benefit of the client and may only be relied upon for the purposes of this Agreement.</p>

<h3>1.13</h3>
<p>The Client acknowledges that they are responsible for their purchasing decision and that NPC Services makes no guarantee or warranties.</p>

<h3>1.14</h3>
<p>NPC Services may recommend third parties to the client. The client acknowledges that all third parties are independent of NPC Services.</p>

<h3>1.15</h3>
<p>Under no circumstances will NPC Services be liable for any indirect, incidental, special, consequential, aggravated, exemplary and/or punitive damages.</p>

<h3>1.16</h3>
<p>The Client will indemnify and hold NPC Services harmless from any liabilities, actions, suits, proceedings, claims, demands, costs, loss, damage, and expenses of any nature.</p>

<h3>1.17</h3>
<p>Each of the terms set out in this agreement is severable and independent.</p>

<h3>1.18</h3>
<p>This agreement will be governed by and interpreted in accordance with laws pertaining to all associated states within Australia.</p>

<h3>1.19</h3>
<p>The Client acknowledges that this agreement constitutes the whole agreement and supersedes all communications, negotiations, arrangements and agreements prior to the date of this agreement.</p>

<div class="footer">
  Naidu Group Pty Ltd T/A Naidu Property Consulting Services | ACN: 684 555 771 | ABN: 50 684 555 771
</div>

</body>
</html>`;
}
