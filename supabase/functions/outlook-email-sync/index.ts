import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const DEFAULT_MAILBOX_EMAIL = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmailRecipient {
  emailAddress: {
    name: string;
    address: string;
  };
}

interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

interface StoredAttachment {
  name: string;
  contentType: string;
  size: number;
  storageUrl: string;
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
  hasAttachments: boolean;
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

async function fetchEmails(accessToken: string, mailboxEmail: string, limit: number = 20): Promise<OutlookMessage[]> {
  console.log(`[Outlook Sync] Fetching emails for ${mailboxEmail}...`);
  
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead,hasAttachments`;
  
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

async function fetchAttachments(accessToken: string, mailboxEmail: string, messageId: string): Promise<Attachment[]> {
  console.log(`[Outlook Sync] Fetching attachments for message ${messageId}...`);
  
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${messageId}/attachments`;
  
  const response = await fetch(graphUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('[Outlook Sync] Failed to fetch attachments:', await response.text());
    return [];
  }

  const data = await response.json();
  return data.value || [];
}

async function uploadAttachmentToStorage(
  supabase: any,
  attachment: Attachment,
  emailId: string
): Promise<StoredAttachment | null> {
  try {
    if (!attachment.contentBytes) {
      console.log(`[Outlook Sync] No content bytes for attachment: ${attachment.name}`);
      return null;
    }

    // Decode base64 content
    const fileBytes = base64Decode(attachment.contentBytes);
    
    // Create unique file path
    const timestamp = Date.now();
    const sanitizedName = attachment.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${emailId}/${timestamp}_${sanitizedName}`;

    console.log(`[Outlook Sync] Uploading attachment: ${filePath}`);

    const { data, error } = await supabase.storage
      .from('email-attachments')
      .upload(filePath, fileBytes, {
        contentType: attachment.contentType,
        upsert: true
      });

    if (error) {
      console.error('[Outlook Sync] Storage upload error:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('email-attachments')
      .getPublicUrl(filePath);

    return {
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      storageUrl: urlData.publicUrl
    };
  } catch (error) {
    console.error('[Outlook Sync] Error uploading attachment:', error);
    return null;
  }
}

/**
 * Structure-preserving HTML to text conversion
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
  
  // Preserve headings
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n');
  
  // Extract bold/strong text content
  text = text.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '$2');
  
  // Extract italic/emphasis text content
  text = text.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '$2');
  
  // Extract underline text content
  text = text.replace(/<u[^>]*>(.*?)<\/u>/gi, '$2');
  
  // Preserve unordered list items with bullets
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  
  // Remove list wrappers
  text = text.replace(/<\/?[ou]l[^>]*>/gi, '\n');
  
  // Preserve table structure
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
  
  // Clean up excessive whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\s+|\s+$/gm, '');
  
  // Fix formatting
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/_([^_\n]+)_/g, '$1');
  text = text.replace(/([a-zA-Z0-9])_(\s|$)/g, '$1$2');
  text = text.replace(/(^|\s)_([a-zA-Z])/g, '$1$2');
  
  // Insert line breaks before email thread headers
  text = text.replace(/([^\n])(\s*From:\s+[^\n]+<[^>]+>)/gi, '$1\n\n$2');
  text = text.replace(/([^\n])(\s*Sent:\s+\w+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*To:\s+[^\n]+<[^>]+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Cc:\s+[^\n]+<[^>]+>)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Subject:\s+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(\s*Date:\s+)/gi, '$1\n$2');
  
  text = text.replace(/(Subject:\s+[^\n]+)(Hi\s|Hello\s|Dear\s|Hope\s|Thank\s|Good\s|Please\s|I\s|We\s|As\s)/gi, '$1\n\n$2');
  
  text = text.replace(/(Kind Regards|Best Regards|Regards|Thanks|Thank you|Cheers|Sincerely)([A-Z])/g, '$1\n\n$2');
  text = text.replace(/([^\n])(Mobile:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Phone:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Email:\s*.+@.+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Website:\s*www\..+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Address:\s+.+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(ABN:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(ACN:\s*[\d\s]+)/gi, '$1\n$2');
  text = text.replace(/([^\n])(Disclaimer:)/gi, '$1\n\n$2');
  
  text = text.replace(/([A-Z]{2,3}\s+\d{4})([A-Z][a-z]+\s+(Group|Pty|Ltd|Company|Services|Consulting))/g, '$1\n\n$2');
  text = text.replace(/([a-z])\.([A-Z][a-z]{2,})/g, '$1.\n\n$2');
  text = text.replace(/([^\n])(On\s+\w{3},?\s+\w{3}\s+\d+)/gi, '$1\n\n$2');
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

    const { action, limit = 20, mailbox } = await req.json().catch(() => ({ action: 'sync', limit: 20, mailbox: null }));
    
    // Use provided mailbox or fall back to default
    const targetMailbox = mailbox || DEFAULT_MAILBOX_EMAIL;
    
    console.log(`[Outlook Sync] Action: ${action}, Limit: ${limit}, Mailbox: ${targetMailbox}`);

    // Handle clear action
    if (action === 'clear') {
      console.log('[Outlook Sync] Clearing all emails from database...');
      
      // First, get all email IDs to delete their attachments
      const { data: emails } = await supabase
        .from('email_copilot_emails')
        .select('id');
      
      // Delete attachments from storage for each email
      if (emails && emails.length > 0) {
        for (const email of emails) {
          const { data: files } = await supabase.storage
            .from('email-attachments')
            .list(email.id);
          
          if (files && files.length > 0) {
            const filePaths = files.map(f => `${email.id}/${f.name}`);
            await supabase.storage
              .from('email-attachments')
              .remove(filePaths);
          }
        }
      }
      
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
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID || !targetMailbox) {
      console.error('[Outlook Sync] Missing Microsoft credentials or mailbox');
      return new Response(
        JSON.stringify({ error: 'Microsoft credentials not configured or mailbox not specified' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token
    const accessToken = await getAccessToken();

    // Fetch emails from Outlook using the target mailbox
    const outlookEmails = await fetchEmails(accessToken, targetMailbox, limit);

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
    let insertedCount = 0;
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

        // Insert email first to get the ID
        const { data: insertedEmail, error: insertError } = await supabase
          .from('email_copilot_emails')
          .insert({
            sender: email.from?.emailAddress?.address || 'unknown',
            subject: email.subject || '(No Subject)',
            body: bodyContent.substring(0, 10000),
            received_at: email.receivedDateTime,
            status: 'unread',
            cc_recipients: ccRecipients,
            bcc_recipients: bccRecipients,
            attachments: []
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[Outlook Sync] Insert error:', insertError);
          continue;
        }

        // Fetch and upload attachments if email has any
        if (email.hasAttachments && insertedEmail) {
          console.log(`[Outlook Sync] Email has attachments, fetching...`);
          const attachments = await fetchAttachments(accessToken, targetMailbox, email.id);
          const storedAttachments: StoredAttachment[] = [];

          for (const attachment of attachments) {
            // Skip inline images and very large files (>10MB)
            if (attachment.size > 10 * 1024 * 1024) {
              console.log(`[Outlook Sync] Skipping large attachment: ${attachment.name} (${attachment.size} bytes)`);
              continue;
            }

            const stored = await uploadAttachmentToStorage(supabase, attachment, insertedEmail.id);
            if (stored) {
              storedAttachments.push(stored);
            }
          }

          // Update email with attachment metadata
          if (storedAttachments.length > 0) {
            await supabase
              .from('email_copilot_emails')
              .update({ attachments: storedAttachments })
              .eq('id', insertedEmail.id);
            
            console.log(`[Outlook Sync] Stored ${storedAttachments.length} attachments for email`);
          }
        }

        insertedCount++;
        existingKeys.add(key);
      }
    }

    console.log(`[Outlook Sync] Inserted ${insertedCount} new emails`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        fetched: outlookEmails.length,
        inserted: insertedCount,
        message: `Synced ${insertedCount} new emails from Outlook`
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