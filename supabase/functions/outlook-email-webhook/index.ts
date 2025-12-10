import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  
  // Preserve headings with emphasis
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n**$1**\n\n');
  
  // Preserve bold/strong text with markers
  text = text.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '**$2**');
  
  // Preserve italic/emphasis text with markers
  text = text.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '_$2_');
  
  // Preserve underline text with markers
  text = text.replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>');
  
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
  
  // Insert line breaks before email thread headers that got merged with previous content
  // This handles cases like "...risk profile.From: Name" -> "...risk profile.\n\nFrom: Name"
  text = text.replace(/([^\n])(From:\s+.+<.+@.+>)/gi, '$1\n\n$2');
  text = text.replace(/([^\n])(Sent:\s+\w+,?\s+\w+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(To:\s+.+<.+@.+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Cc:\s+.+<.+@.+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Subject:\s+.+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Date:\s+.+)/gi, '$1\n$2');
  
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
  
  // Insert line breaks before "On ... wrote:" patterns
  text = text.replace(/([^\n])(On\s+\w{3},?\s+\w{3}\s+\d+)/gi, '$1\n\n$2');
  
  // Clean up any newly created excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

function extractEmailAddresses(recipients: EmailRecipient[]): string[] {
  return recipients?.map(r => r.emailAddress?.address).filter(Boolean) || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  // Handle Microsoft Graph webhook validation
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    console.log('[Outlook Webhook] Validation request received, echoing token');
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    const body = await req.json();
    console.log('[Outlook Webhook] Notification received:', JSON.stringify(body, null, 2));

    if (!body.value || !Array.isArray(body.value)) {
      console.log('[Outlook Webhook] No notifications in payload');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID || !MICROSOFT_MAILBOX_EMAIL) {
      console.error('[Outlook Webhook] Missing Microsoft credentials');
      return new Response(JSON.stringify({ error: 'Missing Microsoft credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accessToken = await getAccessToken();

    for (const notification of body.value) {
      console.log('[Outlook Webhook] Processing notification:', notification);

      if (notification.resourceData?.['@odata.type'] !== '#Microsoft.Graph.Message') {
        console.log('[Outlook Webhook] Skipping non-message notification');
        continue;
      }

      const messageId = notification.resourceData?.id;
      if (!messageId) {
        console.log('[Outlook Webhook] No message ID in notification');
        continue;
      }

      const email = await fetchEmailById(accessToken, messageId);
      if (!email) {
        console.log('[Outlook Webhook] Failed to fetch email:', messageId);
        continue;
      }

      // Check for duplicates
      const { data: existing } = await supabase
        .from('email_copilot_emails')
        .select('id')
        .eq('sender', email.from?.emailAddress?.address || '')
        .eq('subject', email.subject || '')
        .eq('received_at', email.receivedDateTime)
        .maybeSingle();

      if (existing) {
        console.log('[Outlook Webhook] Email already exists, skipping:', email.subject);
        continue;
      }

      // Use structure-preserving HTML conversion
      const bodyContent = email.body?.contentType === 'html' 
        ? convertHtmlToStructuredText(email.body.content) 
        : email.body?.content || email.bodyPreview || '';

      const { error: insertError } = await supabase
        .from('email_copilot_emails')
        .insert({
          sender: email.from?.emailAddress?.address || 'Unknown',
          subject: email.subject || '(No subject)',
          body: bodyContent.substring(0, 10000),
          received_at: email.receivedDateTime,
          status: 'unread',
          cc_recipients: extractEmailAddresses(email.ccRecipients || []),
          bcc_recipients: extractEmailAddresses(email.bccRecipients || [])
        });

      if (insertError) {
        console.error('[Outlook Webhook] Error inserting email:', insertError);
      } else {
        console.log('[Outlook Webhook] Successfully inserted email:', email.subject);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Outlook Webhook] Error:', error);
    return new Response(JSON.stringify({ success: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
