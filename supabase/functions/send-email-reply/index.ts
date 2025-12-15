import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
const mailboxEmail = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');

// Cache for signature to avoid repeated env reads
let cachedSignature: string | null = null;

interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string; // base64 encoded
}

interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  originalEmailId?: string;
  attachments?: EmailAttachment[];
}

async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId!,
    client_secret: clientSecret!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Send Email] Token error:', error);
    throw new Error('Failed to get access token');
  }

  const data = await response.json();
  return data.access_token;
}

function getOutlookSignature(): string {
  // Use cached signature if available
  if (cachedSignature !== null) {
    console.log('[Send Email] Using cached signature');
    return cachedSignature;
  }

  // Get signature from Supabase secret
  const signature = Deno.env.get('OUTLOOK_EMAIL_SIGNATURE') || '';
  
  console.log('[Send Email] Loaded signature from secret:', signature ? 'Found' : 'Not configured');
  
  // Cache the signature
  cachedSignature = signature;
  
  return signature;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate configuration
    if (!clientId || !clientSecret || !tenantId || !mailboxEmail) {
      throw new Error('Microsoft Graph API credentials not configured');
    }

    const { to, subject, body, cc, bcc, originalEmailId, attachments }: SendEmailRequest = await req.json();

    if (!to || !subject || !body) {
      throw new Error('Missing required fields: to, subject, body');
    }

    console.log(`[Send Email] Sending email to: ${to}, Subject: ${subject}, Attachments: ${attachments?.length || 0}`);

    // Get access token
    const accessToken = await getAccessToken();

    // Get Outlook signature from secret
    const signature = getOutlookSignature();
    
    // Combine body with signature
    // If signature is HTML, we need to use HTML content type
    const hasSignature = signature && signature.trim().length > 0;
    const isHtmlSignature = hasSignature && (signature.includes('<') && signature.includes('>'));
    
    let finalBody: string;
    let contentType: 'Text' | 'HTML';
    
    if (hasSignature) {
      if (isHtmlSignature) {
        // Convert plain text body to HTML and append HTML signature
        const htmlBody = body.replace(/\n/g, '<br>');
        finalBody = `${htmlBody}<br><br>${signature}`;
        contentType = 'HTML';
      } else {
        // Both are plain text
        finalBody = `${body}\n\n${signature}`;
        contentType = 'Text';
      }
      console.log('[Send Email] Appended Outlook signature to email');
    } else {
      finalBody = body;
      contentType = 'Text';
    }

    // Prepare email message
    const message: any = {
      message: {
        subject: subject,
        body: {
          contentType: contentType,
          content: finalBody
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ]
      },
      saveToSentItems: true
    };

    // Add CC recipients if provided
    if (cc && cc.length > 0) {
      message.message.ccRecipients = cc.map(email => ({
        emailAddress: { address: email }
      }));
    }

    // Add BCC recipients if provided
    if (bcc && bcc.length > 0) {
      message.message.bccRecipients = bcc.map(email => ({
        emailAddress: { address: email }
      }));
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      message.message.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes
      }));
      console.log(`[Send Email] Added ${attachments.length} attachments`);
    }

    // Send email via Microsoft Graph API
    const sendUrl = `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/sendMail`;
    
    const sendResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('[Send Email] Microsoft Graph error:', sendResponse.status, errorText);
      throw new Error(`Failed to send email: ${sendResponse.status}`);
    }

    console.log('[Send Email] Email sent successfully');

    // Store the sent reply in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store attachment metadata (without contentBytes) for tracking
    const attachmentMetadata = attachments?.map(att => ({
      name: att.name,
      contentType: att.contentType,
      size: Math.ceil((att.contentBytes.length * 3) / 4) // Estimate size from base64
    })) || [];

    const { error: dbError } = await supabase
      .from('email_copilot_sent_replies')
      .insert({
        original_email_id: originalEmailId || null,
        recipient: to,
        subject: subject,
        body: body,
        cc_recipients: cc || [],
        bcc_recipients: bcc || [],
        attachments: attachmentMetadata,
        sent_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('[Send Email] Failed to store sent reply:', dbError);
      // Don't throw - email was still sent successfully
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Send Email] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
