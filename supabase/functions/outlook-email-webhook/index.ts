import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Microsoft Graph API credentials
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const MICROSOFT_MAILBOX_EMAIL = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EmailRecipient {
  emailAddress: {
    address: string;
    name?: string;
  };
}

interface OutlookMessage {
  id: string;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
  from: { emailAddress: { address: string; name?: string } };
  receivedDateTime: string;
  ccRecipients?: EmailRecipient[];
  bccRecipients?: EmailRecipient[];
}

// Get access token from Microsoft
async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID!,
    client_secret: MICROSOFT_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token error:', error);
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch a specific email by ID
async function fetchEmailById(accessToken: string, messageId: string): Promise<OutlookMessage | null> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${MICROSOFT_MAILBOX_EMAIL}/messages/${messageId}?$select=id,internetMessageId,subject,bodyPreview,body,from,receivedDateTime,ccRecipients,bccRecipients`;
  
  const response = await fetch(graphUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('Failed to fetch email:', await response.text());
    return null;
  }

  return await response.json();
}

// Strip HTML tags from content
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract email addresses from recipients
function extractEmailAddresses(recipients: EmailRecipient[]): string[] {
  return recipients?.map(r => r.emailAddress?.address).filter(Boolean) || [];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  // Handle Microsoft Graph webhook validation
  // Microsoft sends a GET request with validationToken query param during subscription setup
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    console.log('Validation request received, echoing token');
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    // Handle actual notification
    const body = await req.json();
    console.log('Webhook notification received:', JSON.stringify(body, null, 2));

    if (!body.value || !Array.isArray(body.value)) {
      console.log('No notifications in payload');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate Microsoft credentials
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID || !MICROSOFT_MAILBOX_EMAIL) {
      console.error('Missing Microsoft credentials');
      return new Response(JSON.stringify({ error: 'Missing Microsoft credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get access token
    const accessToken = await getAccessToken();

    // Process each notification
    for (const notification of body.value) {
      console.log('Processing notification:', notification);

      // Check if this is a mail notification
      if (notification.resourceData?.['@odata.type'] !== '#Microsoft.Graph.Message') {
        console.log('Skipping non-message notification');
        continue;
      }

      const messageId = notification.resourceData?.id;
      if (!messageId) {
        console.log('No message ID in notification');
        continue;
      }

      // Fetch the full email
      const email = await fetchEmailById(accessToken, messageId);
      if (!email) {
        console.log('Failed to fetch email:', messageId);
        continue;
      }

      // Check for duplicates using internetMessageId
      const { data: existing } = await supabase
        .from('email_copilot_emails')
        .select('id')
        .eq('sender', email.from?.emailAddress?.address || '')
        .eq('subject', email.subject || '')
        .eq('received_at', email.receivedDateTime)
        .maybeSingle();

      if (existing) {
        console.log('Email already exists, skipping:', email.subject);
        continue;
      }

      // Insert the new email
      const { error: insertError } = await supabase
        .from('email_copilot_emails')
        .insert({
          sender: email.from?.emailAddress?.address || 'Unknown',
          subject: email.subject || '(No subject)',
          body: email.body?.contentType === 'html' 
            ? stripHtml(email.body.content) 
            : email.body?.content || email.bodyPreview || '',
          received_at: email.receivedDateTime,
          status: 'unread',
          cc_recipients: extractEmailAddresses(email.ccRecipients || []),
          bcc_recipients: extractEmailAddresses(email.bccRecipients || [])
        });

      if (insertError) {
        console.error('Error inserting email:', insertError);
      } else {
        console.log('Successfully inserted email:', email.subject);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to Microsoft to prevent retries
    return new Response(JSON.stringify({ success: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
