import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth, createCorsHeaders as createAuthCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';
import { logApiUsage } from '../_shared/logApiUsage.ts';

// Dynamic CORS headers for credential-based requests
function createCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    origin === 'https://command-centre.npcservices.com.au' ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.npcservices.com.au') ||
    origin.includes('localhost')
  )
    ? origin 
    : 'https://command-centre.npcservices.com.au';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const tenantId = Deno.env.get('MICROSOFT_TENANT_ID');
const mailboxEmail = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');

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
  mailboxSource?: 'admin' | 'personal';
}

interface WhiteLabelSettings {
  email_signature_banner?: string;
  email_signature_name?: string;
  email_signature_title?: string;
  email_signature_phone?: string;
  email_signature_email?: string;
  email_signature_website?: string;
  email_signature_address?: string;
  email_signature_disclaimer?: string;
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

async function getSignatureFromDatabase(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('whitelabel_settings')
      .select('email_signature_banner, email_signature_name, email_signature_title, email_signature_phone, email_signature_email, email_signature_website, email_signature_address, email_signature_disclaimer')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.log('[Send Email] No signature settings found in database:', error?.message);
      return '';
    }

    const settings: WhiteLabelSettings = data;
    
    // Build HTML signature from database settings
    let signatureHtml = '';
    
    // Add banner image if configured
    if (settings.email_signature_banner) {
      signatureHtml += `<img src="${settings.email_signature_banner}" alt="Email Signature" style="max-width: 600px; height: auto; display: block; margin-bottom: 10px;" />`;
    }
    
    // Build contact info section
    const contactParts: string[] = [];
    
    if (settings.email_signature_email) {
      contactParts.push(`<strong>Email:</strong> <a href="mailto:${settings.email_signature_email}" style="color: #d4a843; text-decoration: none;">${settings.email_signature_email}</a>`);
    }
    
    if (settings.email_signature_website) {
      const websiteUrl = settings.email_signature_website.startsWith('http') 
        ? settings.email_signature_website 
        : `https://${settings.email_signature_website}`;
      contactParts.push(`<strong>Website:</strong> <a href="${websiteUrl}" style="color: #d4a843; text-decoration: none;">${settings.email_signature_website}</a>`);
    }
    
    if (contactParts.length > 0) {
      signatureHtml += `<p style="margin: 10px 0; font-family: Arial, sans-serif; font-size: 14px; color: #333;">${contactParts.join(' | ')}</p>`;
    }
    
    // Add disclaimer if configured
    if (settings.email_signature_disclaimer) {
      // Format disclaimer with proper paragraphs
      const disclaimerParagraphs = settings.email_signature_disclaimer
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p style="margin: 0 0 10px 0;">${p.trim().replace(/\n/g, ' ')}</p>`)
        .join('');
      
      signatureHtml += `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 12px; color: #666;">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Disclaimer:</p>
        ${disclaimerParagraphs}
      </div>`;
    }
    
    console.log('[Send Email] Built signature from database settings');
    return signatureHtml;
    
  } catch (error) {
    console.error('[Send Email] Error fetching signature from database:', error);
    return '';
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createAuthCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate configuration
    if (!clientId || !clientSecret || !tenantId || !mailboxEmail) {
      throw new Error('Microsoft Graph API credentials not configured');
    }

    const body = await req.json();
    const { to, subject, body: emailBody, cc, bcc, originalEmailId, attachments, mailboxSource }: SendEmailRequest = body;
    
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Allow internal service-to-service calls with the service role key
    const authHeader = req.headers.get('Authorization') || '';
    const bearerToken = authHeader.replace('Bearer ', '').trim();
    let userId: string | null = null;
    
    if (bearerToken === supabaseServiceKey) {
      console.log('[send-email-reply] Service role token detected - internal call authorized');
      userId = 'service_role';
    } else {
      const { error: authError, userId: authUserId } = await verifyAuth(supabase, req.headers, body);
      if (authError) {
        console.log('[send-email-reply] Auth failed:', authError);
        return createUnauthorizedResponse(authError, corsHeaders);
      }
      userId = authUserId;
    }
    console.log('[send-email-reply] Authenticated user:', userId);

    if (!to || !subject || !emailBody) {
      throw new Error('Missing required fields: to, subject, body');
    }

    console.log(`[Send Email] Sending email to: ${to}, Subject: ${subject}, Attachments: ${attachments?.length || 0}`);

    // Get access token and signature in parallel
    const [accessToken, signature] = await Promise.all([
      getAccessToken(),
      getSignatureFromDatabase(supabase)
    ]);
    
    // Detect if the email body is already HTML
    const isHtmlBody = emailBody.includes('<html') || emailBody.includes('<p>') || emailBody.includes('<div') || 
                       emailBody.includes('<br') || emailBody.includes('<table') || emailBody.includes('<span');
    
    // Combine body with signature
    const hasSignature = signature && signature.trim().length > 0;
    const isHtmlSignature = hasSignature && (signature.includes('<') && signature.includes('>'));
    
    let finalBody: string;
    let contentType: 'Text' | 'HTML';
    
    // Smart formatting based on content type
    if (isHtmlBody) {
      // Body is already HTML, preserve it
      if (hasSignature) {
        if (isHtmlSignature) {
          finalBody = `${emailBody}<br><br>${signature}`;
        } else {
          // Convert plain text signature to HTML
          finalBody = `${emailBody}<br><br>${signature.replace(/\n/g, '<br>')}`;
        }
      } else {
        finalBody = emailBody;
      }
      contentType = 'HTML';
      console.log('[Send Email] Body detected as HTML, preserving formatting');
    } else if (hasSignature) {
      if (isHtmlSignature) {
        // Convert plain text body to HTML and append HTML signature
        // Preserve paragraphs by converting double newlines to paragraph breaks
        const htmlBody = emailBody
          .split(/\n\n+/)
          .map(para => `<p style="margin: 0 0 1em 0;">${para.replace(/\n/g, '<br>')}</p>`)
          .join('');
        finalBody = `${htmlBody}<br>${signature}`;
        contentType = 'HTML';
      } else {
        // Both are plain text
        finalBody = `${emailBody}\n\n${signature}`;
        contentType = 'Text';
      }
      console.log('[Send Email] Appended database signature to email');
    } else {
      finalBody = emailBody;
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

    // Log Microsoft Graph API usage
    await logApiUsage(supabase, {
      service_name: 'microsoft-graph',
      endpoint: '/v1.0/users/sendMail',
      status: 'success',
      model_used: 'graph-api',
      metadata: { to, subject, has_attachments: !!(attachments?.length) },
    });

    // Store attachment metadata (without contentBytes) for tracking
    const attachmentMetadata = attachments?.map(att => ({
      name: att.name,
      contentType: att.contentType,
      size: Math.ceil((att.contentBytes.length * 3) / 4) // Estimate size from base64
    })) || [];

    const { data: sentReply, error: dbError } = await supabase
      .from('email_copilot_sent_replies')
      .insert({
        original_email_id: originalEmailId || null,
        recipient: to,
        subject: subject,
        body: emailBody,
        cc_recipients: cc || [],
        bcc_recipients: bcc || [],
        attachments: attachmentMetadata,
        sent_at: new Date().toISOString(),
        mailbox_source: mailboxSource || 'admin'
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('[Send Email] Failed to store sent reply:', dbError);
      // Don't throw - email was still sent successfully
    }

    // Add notification for email sent
    if (!dbError) {
      const recipientName = to.split('@')[0];
      await supabase
        .from('notifications')
        .insert({
          type: 'email_reply_sent',
          title: 'Email Sent',
          message: `Reply sent to ${recipientName}: ${subject}`,
          entity_id: sentReply?.id || null,
          read: false
        });
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
