import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { session_token } = await req.json()

    if (!session_token) {
      return new Response(
        JSON.stringify({ error: 'Session token is required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if session exists and is valid
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select(`
        *,
        custom_users:user_id (
          id,
          username,
          role,
          is_active
        )
      `)
      .eq('session_token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session || !session.custom_users?.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        valid: true, 
        user: {
          id: session.custom_users.id,
          username: session.custom_users.username,
          role: session.custom_users.role
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Session verification error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})