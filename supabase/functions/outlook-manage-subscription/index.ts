import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const MICROSOFT_TENANT_ID = Deno.env.get('MICROSOFT_TENANT_ID');
const MICROSOFT_MAILBOX_EMAIL = Deno.env.get('MICROSOFT_MAILBOX_EMAIL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

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
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID || !MICROSOFT_MAILBOX_EMAIL) {
      return new Response(JSON.stringify({ error: 'Missing Microsoft credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accessToken = await getAccessToken();
    const webhookUrl = `${SUPABASE_URL}/functions/v1/outlook-email-webhook`;

    if (action === 'create') {
      // Create a new subscription for mail notifications
      const subscription = {
        changeType: 'created',
        notificationUrl: webhookUrl,
        resource: `/users/${MICROSOFT_MAILBOX_EMAIL}/messages`,
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days max
        clientState: 'npc-email-copilot-webhook'
      };

      console.log('Creating subscription:', subscription);

      const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('Subscription creation failed:', result);
        return new Response(JSON.stringify({ 
          error: 'Failed to create subscription', 
          details: result 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Subscription created:', result);
      return new Response(JSON.stringify({ 
        success: true, 
        subscription: result,
        message: 'Webhook subscription created successfully. Expires in 3 days.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'list') {
      // List all subscriptions
      const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      return new Response(JSON.stringify({ subscriptions: result.value || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'renew') {
      // List and renew all subscriptions
      const listResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const listResult = await listResponse.json();
      const subscriptions = listResult.value || [];
      const renewed = [];

      for (const sub of subscriptions) {
        const renewResponse = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          })
        });

        if (renewResponse.ok) {
          renewed.push(sub.id);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        renewed,
        message: `Renewed ${renewed.length} subscription(s)`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'delete') {
      // Delete all subscriptions
      const listResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const listResult = await listResponse.json();
      const subscriptions = listResult.value || [];
      const deleted = [];

      for (const sub of subscriptions) {
        const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (deleteResponse.ok || deleteResponse.status === 204) {
          deleted.push(sub.id);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        deleted,
        message: `Deleted ${deleted.length} subscription(s)`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({ 
        error: 'Invalid action. Use: create, list, renew, or delete' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
