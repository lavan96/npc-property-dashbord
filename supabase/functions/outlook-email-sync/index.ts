import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const MICROSOFT_MAILBOX_EMAIL = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmailRecipient {
  emailAddress: {
    name: string;
    address: string;
  };
}

interface OutlookMessage {
  id: string;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  body: {
    content: string;
    contentType: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: EmailRecipient[];
  ccRecipients: EmailRecipient[];
  bccRecipients: EmailRecipient[];
  receivedDateTime: string;
  isRead: boolean;
}

async function getAccessToken(): Promise<string> {
  console.log('[Outlook Sync] Requesting access token...');
  
  const tokenUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID!,
    client_secret: MICROSOFT_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Outlook Sync] Token error:', errorText);
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log('[Outlook Sync] Access token obtained successfully');
  return data.access_token;
}

async function fetchEmails(accessToken: string, limit: number = 20): Promise<OutlookMessage[]> {
  console.log(`[Outlook Sync] Fetching emails for ${MICROSOFT_MAILBOX_EMAIL}...`);
  
  // Include ccRecipients and bccRecipients in the select
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${MICROSOFT_MAILBOX_EMAIL}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead`;
  
  const response = await fetch(graphUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Outlook Sync] Graph API error:', errorText);
    throw new Error(`Failed to fetch emails: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Outlook Sync] Fetched ${data.value?.length || 0} emails`);
  return data.value || [];
}

function stripHtml(html: string): string {
  // Remove HTML tags and decode common entities
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEmailAddresses(recipients: EmailRecipient[]): string[] {
  return (recipients || [])
    .map(r => r.emailAddress?.address)
    .filter(Boolean);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, limit = 20 } = await req.json().catch(() => ({ action: 'sync', limit: 20 }));
    
    console.log(`[Outlook Sync] Action: ${action}, Limit: ${limit}`);

    // Handle clear action
    if (action === 'clear') {
      console.log('[Outlook Sync] Clearing all emails from database...');
      const { error: deleteError } = await supabase
        .from('email_copilot_emails')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (deleteError) {
        console.error('[Outlook Sync] Delete error:', deleteError);
        throw new Error(`Failed to clear emails: ${deleteError.message}`);
      }

      console.log('[Outlook Sync] All emails cleared');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All emails have been cleared from the database'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate environment variables for sync
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID || !MICROSOFT_MAILBOX_EMAIL) {
      console.error('[Outlook Sync] Missing Microsoft credentials');
      return new Response(
        JSON.stringify({ error: 'Microsoft credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token
    const accessToken = await getAccessToken();

    // Fetch emails from Outlook
    const outlookEmails = await fetchEmails(accessToken, limit);

    // Get existing emails to avoid duplicates - use multiple criteria for robust dedup
    const { data: existingEmails } = await supabase
      .from('email_copilot_emails')
      .select('sender, subject, received_at');

    // Create a set of composite keys for quick lookup
    // Use sender + subject + received_at as the unique key
    const existingKeys = new Set<string>();
    (existingEmails || []).forEach(e => {
      // Normalize the received_at to handle timezone differences
      const normalizedDate = new Date(e.received_at).toISOString();
      existingKeys.add(`${e.sender?.toLowerCase()}|${e.subject?.toLowerCase()}|${normalizedDate}`);
    });

    console.log(`[Outlook Sync] Found ${existingKeys.size} existing emails in database`);

    // Process and insert new emails
    const newEmails = [];
    for (const email of outlookEmails) {
      const sender = (email.from?.emailAddress?.address || 'unknown').toLowerCase();
      const subject = (email.subject || '(No Subject)').toLowerCase();
      const receivedAt = new Date(email.receivedDateTime).toISOString();
      
      const key = `${sender}|${subject}|${receivedAt}`;
      
      if (!existingKeys.has(key)) {
        const bodyContent = email.body?.contentType === 'html' 
          ? stripHtml(email.body.content)
          : email.body?.content || email.bodyPreview || '';

        // Extract CC and BCC recipients
        const ccRecipients = extractEmailAddresses(email.ccRecipients);
        const bccRecipients = extractEmailAddresses(email.bccRecipients);

        newEmails.push({
          sender: email.from?.emailAddress?.address || 'unknown',
          subject: email.subject || '(No Subject)',
          body: bodyContent.substring(0, 10000), // Limit body size
          received_at: email.receivedDateTime,
          status: 'unread',
          cc_recipients: ccRecipients,
          bcc_recipients: bccRecipients,
        });
        
        // Add to existing keys to prevent duplicates within same batch
        existingKeys.add(key);
      }
    }

    console.log(`[Outlook Sync] Found ${newEmails.length} new emails to insert`);

    if (newEmails.length > 0) {
      const { error: insertError } = await supabase
        .from('email_copilot_emails')
        .insert(newEmails);

      if (insertError) {
        console.error('[Outlook Sync] Insert error:', insertError);
        throw new Error(`Failed to insert emails: ${insertError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        fetched: outlookEmails.length,
        inserted: newEmails.length,
        message: `Synced ${newEmails.length} new emails from Outlook`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Outlook Sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});