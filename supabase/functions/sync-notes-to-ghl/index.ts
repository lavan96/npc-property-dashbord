import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey) {
      console.error('GHL API key not configured');
      return new Response(JSON.stringify({ 
        error: 'GoHighLevel API key not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'Supabase credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, clientId, noteId, noteContent, noteType } = body;

    if (!clientId) {
      return new Response(JSON.stringify({
        error: 'Missing required field: clientId',
        success: false
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch client to get GHL contact ID
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('ghl_contact_id, primary_first_name, primary_surname')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Failed to fetch client:', clientError);
      return new Response(JSON.stringify({
        error: `Client not found: ${clientError?.message}`,
        success: false
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client.ghl_contact_id) {
      console.log('No GHL contact linked to this client, skipping sync');
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        message: 'No GHL contact linked'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    };

    // Format the note content with type prefix
    const formattedNote = noteType && noteType !== 'general' 
      ? `[${noteType.toUpperCase()}] ${noteContent}`
      : noteContent;

    if (action === 'create' || action === 'update') {
      // Create a new note in GHL (GHL doesn't support updating notes, we'll add a new one)
      console.log(`Creating note for GHL contact ${client.ghl_contact_id}`);

      const notePayload = {
        contactId: client.ghl_contact_id,
        body: formattedNote,
      };

      const ghlResponse = await fetch(
        `${GHL_API_BASE}/contacts/${client.ghl_contact_id}/notes`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(notePayload),
        }
      );

      if (!ghlResponse.ok) {
        const errorText = await ghlResponse.text();
        console.error('GHL note creation error:', errorText);
        // Don't fail the local operation, just log the error
        return new Response(JSON.stringify({
          success: false,
          error: `GHL sync failed: ${errorText}`,
          localOnly: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ghlData = await ghlResponse.json();
      console.log('GHL note created:', ghlData);

      // Update local note with GHL note ID if provided
      if (noteId && ghlData.note?.id) {
        await supabase
          .from('client_notes')
          .update({ ghl_note_id: ghlData.note.id })
          .eq('id', noteId);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Note synced to GHL',
        ghlNoteId: ghlData.note?.id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'delete') {
      // GHL notes deletion - we can try to delete if we have the GHL note ID
      if (noteId) {
        const { data: localNote } = await supabase
          .from('client_notes')
          .select('ghl_note_id')
          .eq('id', noteId)
          .single();

        if (localNote?.ghl_note_id) {
          const ghlResponse = await fetch(
            `${GHL_API_BASE}/contacts/${client.ghl_contact_id}/notes/${localNote.ghl_note_id}`,
            {
              method: 'DELETE',
              headers,
            }
          );

          if (!ghlResponse.ok) {
            console.log('GHL note deletion may have failed, continuing anyway');
          } else {
            console.log('GHL note deleted successfully');
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Note deletion processed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      error: 'Invalid action. Use: create, update, or delete',
      success: false
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sync-notes-to-ghl:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
