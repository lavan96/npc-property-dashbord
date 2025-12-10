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

/**
 * Structure-preserving HTML to text conversion
 * Converts HTML to plain text while maintaining formatting structure
 */
function convertHtmlToStructuredText(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // Preserve paragraph breaks
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  
  // Preserve div breaks
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  
  // Preserve line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Preserve headings - just extract text without markers
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n');
  
  // Extract bold/strong text content without adding markers (markers cause display issues)
  text = text.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '$2');
  
  // Extract italic/emphasis text content without adding markers
  text = text.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '$2');
  
  // Extract underline text content without markers
  text = text.replace(/<u[^>]*>(.*?)<\/u>/gi, '$2');
  
  // Preserve unordered list items with bullets
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  
  // Preserve ordered list items (simplified)
  let listCounter = 0;
  text = text.replace(/<ol[^>]*>/gi, () => { listCounter = 0; return ''; });
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, (match, content) => {
    listCounter++;
    return `${listCounter}. ${content}\n`;
  });
  
  // Remove list wrappers
  text = text.replace(/<\/?[ou]l[^>]*>/gi, '\n');
  
  // Preserve table structure (simplified)
  text = text.replace(/<tr[^>]*>/gi, '');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi, '$1\t');
  text = text.replace(/<\/?table[^>]*>/gi, '\n');
  text = text.replace(/<\/?t(head|body|foot)[^>]*>/gi, '');
  
  // Preserve blockquotes
  text = text.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
    return content.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n';
  });
  
  // Preserve horizontal rules
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&rsquo;/g, "'");
  text = text.replace(/&lsquo;/g, "'");
  text = text.replace(/&rdquo;/g, '"');
  text = text.replace(/&ldquo;/g, '"');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&hellip;/g, '...');
  text = text.replace(/&bull;/g, '•');
  text = text.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code)));
  
  // Clean up excessive whitespace while preserving intentional line breaks
  text = text.replace(/[ \t]+/g, ' '); // Collapse horizontal whitespace
  text = text.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  text = text.replace(/^\s+|\s+$/gm, ''); // Trim each line
  
  // Remove any remaining markdown-style formatting markers that slipped through
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove **bold** markers
  text = text.replace(/_([^_\n]+)_/g, '$1'); // Remove _italic_ markers
  text = text.replace(/([a-zA-Z0-9])_(\s|$)/g, '$1$2'); // Remove trailing underscores
  text = text.replace(/(^|\s)_([a-zA-Z])/g, '$1$2'); // Remove leading underscores
  
  // Insert line breaks before email thread headers that got merged with previous content
  // This handles cases like "...risk profile.From: Name" -> "...risk profile.\n\nFrom: Name"
  text = text.replace(/([^\n])(\s*From:\s+[^\n]+<[^>]+>)/gi, '$1\n\n$2');
  text = text.replace(/([^\n])(\s*Sent:\s+\w+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*To:\s+[^\n]+<[^>]+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Cc:\s+[^\n]+<[^>]+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Subject:\s+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Date:\s+)/gi, '$1\n$2');
  
  // Insert line break AFTER Subject: lines before the email body starts
  // Match Subject line followed by any content, then a greeting like "Hi" or "Hello" or "Dear"
  text = text.replace(/(Subject:\s+[^\n]+)(Hi\s|Hello\s|Dear\s|Hope\s|Thank\s|Good\s|Please\s|I\s|We\s|As\s)/gi, '$1\n\n$2');
  
  // Insert line breaks before common signature elements that got merged
  // E.g., "Kind RegardsMobile:" -> "Kind Regards\n\nMobile:"
  text = text.replace(/(Kind Regards|Best Regards|Regards|Thanks|Thank you|Cheers|Sincerely)([A-Z])/g, '$1\n\n$2');
  text = text.replace(/([^\n])(Mobile:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Phone:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Email:\s*.+@.+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Website:\s*www\..+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Address:\s+.+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(ABN:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(ACN:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Disclaimer:)/gi, '$1\n\n$2');
  
  // Insert line break after Australian postcodes followed by company names
  // E.g., "NSW 2153Naidu Group" -> "NSW 2153\n\nNaidu Group"
  text = text.replace(/([A-Z]{2,3}\s+\d{4})([A-Z][a-z]+\s+(Group|Pty|Ltd|Company|Services|Consulting))/g, '$1\n\n$2');
  
  // Fix sentence boundaries where period is followed directly by a capital letter (new sentence)
  // E.g., "your reference.Look forward" -> "your reference.\n\nLook forward"
  // But not for abbreviations like "Mr." or "Dr." or "Ltd."
  text = text.replace(/([a-z])\.([A-Z][a-z]{2,})/g, '$1.\n\n$2');
  
  // Insert line breaks before "On ... wrote:" patterns
  text = text.replace(/([^\n])(On\s+\w{3},?\s+\w{3}\s+\d+)/gi, '$1\n\n$2');
  
  // Clean up any newly created excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

function extractEmailAddresses(recipients: EmailRecipient[]): string[] {
  return (recipients || [])
    .map(r => r.emailAddress?.address)
    .filter(Boolean);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, limit = 20 } = await req.json().catch(() => ({ action: 'sync', limit: 20 }));
    
    console.log(`[Outlook Sync] Action: ${action}, Limit: ${limit}`);

    // Handle clear action
    if (action === 'clear') {
      console.log('[Outlook Sync] Clearing all emails from database...');
      const { error: deleteError } = await supabase
        .from('email_copilot_emails')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

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

    // Get existing emails to avoid duplicates
    const { data: existingEmails } = await supabase
      .from('email_copilot_emails')
      .select('sender, subject, received_at');

    // Create a set of composite keys for quick lookup
    const existingKeys = new Set<string>();
    (existingEmails || []).forEach(e => {
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
        // Use structure-preserving HTML conversion
        const bodyContent = email.body?.contentType === 'html' 
          ? convertHtmlToStructuredText(email.body.content)
          : email.body?.content || email.bodyPreview || '';

        const ccRecipients = extractEmailAddresses(email.ccRecipients);
        const bccRecipients = extractEmailAddresses(email.bccRecipients);

        newEmails.push({
          sender: email.from?.emailAddress?.address || 'unknown',
          subject: email.subject || '(No Subject)',
          body: bodyContent.substring(0, 10000),
          received_at: email.receivedDateTime,
          status: 'unread',
          cc_recipients: ccRecipients,
          bcc_recipients: bccRecipients,
        });
        
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
