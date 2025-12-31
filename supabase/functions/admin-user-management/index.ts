import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface RequestBody {
  action: 'list_users' | 'get_user' | 'create_user' | 'update_user' | 'delete_user' | 
          'assign_role' | 'remove_role' | 'update_permissions' | 'send_invite' |
          'list_modules' | 'get_user_permissions' | 'promote_to_superadmin' | 'demote_from_superadmin' |
          'accept_invite' | 'verify_invite' | 'update_mailbox' | 'get_own_profile' |
          'update_own_mailbox' | 'update_own_signature' | 'create_subadmin' | 'update_own_credentials';
  new_username?: string;
  current_password?: string;
  new_password?: string;
  session_token: string;
  user_id?: string;
  role?: 'superadmin' | 'admin' | 'user';
  permissions?: Array<{ module_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean }>;
  invite_data?: {
    email: string;
    username?: string;
    invite_type: 'magic_link' | 'temp_password';
    permissions: Array<{ module_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean }>;
  };
  subadmin_data?: {
    username: string;
    password: string;
    email?: string;
    personal_mailbox?: string;
    permissions: Array<{ module_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean }>;
  };
  token?: string;
  password?: string;
  personal_mailbox?: string;
  email_signature?: string;
}

// Helper to verify session and check if user is superadmin
async function verifySuperadmin(supabase: any, sessionToken: string) {
  if (!sessionToken) {
    return { error: 'Session token required', user: null };
  }

  const { data: session, error: sessionError } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (sessionError || !session) {
    return { error: 'Invalid or expired session', user: null };
  }

  // Check if user has superadmin role
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', session.user_id)
    .eq('role', 'superadmin')
    .single();

  if (roleError || !roleData) {
    return { error: 'Unauthorized: Superadmin access required', user: null };
  }

  const { data: user } = await supabase
    .from('custom_users')
    .select('*')
    .eq('id', session.user_id)
    .single();

  return { error: null, user };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RequestBody = await req.json();
    const { action, session_token } = body;

    // Actions that don't require superadmin auth
    if (action === 'verify_invite') {
      const { token } = body;
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: invite, error } = await supabase
        .from('permission_invite_tokens')
        .select('*, invited_by_user:custom_users!permission_invite_tokens_invited_by_fkey(username)')
        .eq('token', token)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !invite) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid or expired invite' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          invite: {
            email: invite.email,
            username: invite.username,
            invite_type: invite.invite_type,
            permissions: invite.permissions,
            invited_by: invite.invited_by_user?.username
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'accept_invite') {
      const { token, password } = body;
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Token required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: invite, error: inviteError } = await supabase
        .from('permission_invite_tokens')
        .select('*')
        .eq('token', token)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (inviteError || !invite) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid or expired invite' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine password
      let finalPassword = password;
      if (invite.invite_type === 'temp_password' && !password) {
        finalPassword = invite.temporary_password;
      }
      if (!finalPassword || finalPassword.length < 6) {
        return new Response(
          JSON.stringify({ success: false, error: 'Password required (min 6 characters)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create user
      const username = invite.username || invite.email.split('@')[0];
      
      const { data: newUser, error: userError } = await supabase
        .from('custom_users')
        .insert({
          username,
          email: invite.email,
          password_hash: finalPassword,
          role: 'sub_admin', // All invited users are sub_admins
          is_active: true,
        })
        .select()
        .single();

      if (userError) {
        console.error('Failed to create user:', userError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create user. Username may already exist.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Assign admin role in user_roles table (keeps compatibility, but they're still sub_admin tier)
      await supabase
        .from('user_roles')
        .insert({ user_id: newUser.id, role: 'admin' });

      // Assign permissions
      const permissions = invite.permissions as Array<{ module_key: string; can_view: boolean; can_edit: boolean; can_delete: boolean }>;
      
      for (const perm of permissions) {
        const { data: module } = await supabase
          .from('dashboard_modules')
          .select('id')
          .eq('module_key', perm.module_key)
          .single();

        if (module) {
          await supabase
            .from('user_permissions')
            .insert({
              user_id: newUser.id,
              module_id: module.id,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
              granted_by: invite.invited_by,
            });
        }
      }

      // Mark invite as used
      await supabase
        .from('permission_invite_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', invite.id);

      console.log(`User ${username} created via invite`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Account created successfully',
          username
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Helper to verify any authenticated user (not just superadmin)
    const verifySession = async (sessionToken: string) => {
      if (!sessionToken) {
        return { error: 'Session token required', user: null };
      }

      const { data: session, error: sessionError } = await supabase
        .from('user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (sessionError || !session) {
        return { error: 'Invalid or expired session', user: null };
      }

      const { data: user } = await supabase
        .from('custom_users')
        .select('*')
        .eq('id', session.user_id)
        .single();

      return { error: null, user };
    };

    // Actions that require authentication but NOT superadmin
    if (action === 'get_own_profile') {
      const { error: sessionError, user: currentUser } = await verifySession(session_token);
      if (sessionError || !currentUser) {
        return new Response(
          JSON.stringify({ success: false, error: sessionError || 'Not authenticated' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: currentUser.id,
            username: currentUser.username,
            email: currentUser.email,
            personal_mailbox: currentUser.personal_mailbox,
            email_signature: currentUser.email_signature || '',
            role: currentUser.role,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_own_signature') {
      const { error: sessionError, user: currentUser } = await verifySession(session_token);
      if (sessionError || !currentUser) {
        return new Response(
          JSON.stringify({ success: false, error: sessionError || 'Not authenticated' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { email_signature } = body;

      const { error } = await supabase
        .from('custom_users')
        .update({ 
          email_signature: email_signature || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', currentUser.id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`User ${currentUser.username} updated their email signature`);
      return new Response(
        JSON.stringify({ success: true, message: 'Email signature updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_own_mailbox') {
      const { error: sessionError, user: currentUser } = await verifySession(session_token);
      if (sessionError || !currentUser) {
        return new Response(
          JSON.stringify({ success: false, error: sessionError || 'Not authenticated' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { personal_mailbox } = body;

      const { error } = await supabase
        .from('custom_users')
        .update({ 
          personal_mailbox: personal_mailbox || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', currentUser.id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`User ${currentUser.username} updated their own mailbox`);
      return new Response(
        JSON.stringify({ success: true, message: 'Mailbox updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update own credentials (username and/or password)
    if (action === 'update_own_credentials') {
      const { error: sessionError, user: currentUser } = await verifySession(session_token);
      if (sessionError || !currentUser) {
        return new Response(
          JSON.stringify({ success: false, error: sessionError || 'Not authenticated' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { new_username, current_password, new_password } = body;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };

      // Handle username update
      if (new_username && new_username !== currentUser.username) {
        if (new_username.trim().length < 3) {
          return new Response(
            JSON.stringify({ success: false, error: 'Username must be at least 3 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if username already exists
        const { data: existingUser } = await supabase
          .from('custom_users')
          .select('id')
          .eq('username', new_username.trim())
          .neq('id', currentUser.id)
          .single();

        if (existingUser) {
          return new Response(
            JSON.stringify({ success: false, error: 'Username already taken' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        updates.username = new_username.trim();
      }

      // Handle password update
      if (new_password) {
        if (!current_password) {
          return new Response(
            JSON.stringify({ success: false, error: 'Current password is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify current password
        if (currentUser.password_hash !== current_password) {
          return new Response(
            JSON.stringify({ success: false, error: 'Current password is incorrect' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (new_password.length < 6) {
          return new Response(
            JSON.stringify({ success: false, error: 'New password must be at least 6 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        updates.password_hash = new_password;
      }

      // Only proceed if there are actual updates
      if (Object.keys(updates).length === 1) { // Only updated_at
        return new Response(
          JSON.stringify({ success: false, error: 'No changes to update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('custom_users')
        .update(updates)
        .eq('id', currentUser.id);

      if (error) {
        console.error('Failed to update credentials:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const changedFields = [];
      if (updates.username) changedFields.push('username');
      if (updates.password_hash) changedFields.push('password');

      console.log(`User ${currentUser.username} updated their credentials: ${changedFields.join(', ')}`);
      return new Response(
        JSON.stringify({ success: true, message: `Updated: ${changedFields.join(', ')}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require superadmin
    const { error: authError, user: adminUser } = await verifySuperadmin(supabase, session_token);
    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list_users') {
      const { data: users, error } = await supabase
        .from('custom_users')
        .select(`
          id, username, email, role, is_active, created_at, updated_at, personal_mailbox,
          user_roles(role)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, users }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_user') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: user, error } = await supabase
        .from('custom_users')
        .select(`
          id, username, email, role, is_active, created_at, updated_at,
          user_roles(id, role)
        `)
        .eq('id', user_id)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, user }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list_modules') {
      const { data: modules, error } = await supabase
        .from('dashboard_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, modules }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_user_permissions') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: permissions, error } = await supabase
        .from('user_permissions')
        .select(`
          *,
          dashboard_modules(*)
        `)
        .eq('user_id', user_id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, permissions }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_permissions') {
      const { user_id, permissions } = body;
      if (!user_id || !permissions) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID and permissions required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete existing permissions
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', user_id);

      // Insert new permissions
      for (const perm of permissions) {
        const { data: module } = await supabase
          .from('dashboard_modules')
          .select('id')
          .eq('module_key', perm.module_key)
          .single();

        if (module) {
          await supabase
            .from('user_permissions')
            .insert({
              user_id,
              module_id: module.id,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
              granted_by: adminUser.id,
            });
        }
      }

      console.log(`Permissions updated for user ${user_id} by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Permissions updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'assign_role') {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID and role required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id, role }, { onConflict: 'user_id,role' });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Role ${role} assigned to user ${user_id} by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Role assigned' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'remove_role') {
      const { user_id, role } = body;
      if (!user_id || !role) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID and role required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user_id)
        .eq('role', role);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Role ${role} removed from user ${user_id} by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Role removed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'update_user') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updateData: any = { updated_at: new Date().toISOString() };
      // Add fields that can be updated by superadmin
      const allowedFields = ['is_active', 'email', 'username', 'personal_mailbox'];
      for (const field of allowedFields) {
        if ((body as any)[field] !== undefined) {
          updateData[field] = (body as any)[field];
        }
      }

      const { error } = await supabase
        .from('custom_users')
        .update(updateData)
        .eq('id', user_id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`User ${user_id} updated by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'User updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update own mailbox - available to any authenticated user for their own profile
    if (action === 'update_mailbox') {
      const { user_id, personal_mailbox } = body;
      const targetUserId = user_id || adminUser.id;
      
      // Non-superadmins can only update their own mailbox
      // Superadmins can update anyone's mailbox
      if (targetUserId !== adminUser.id) {
        // This will only be reached by superadmins due to earlier auth check
        console.log(`Superadmin ${adminUser.username} updating mailbox for user ${targetUserId}`);
      }

      const { error } = await supabase
        .from('custom_users')
        .update({ 
          personal_mailbox: personal_mailbox || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', targetUserId);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Mailbox updated for user ${targetUserId}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Mailbox updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete_user') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prevent deleting self
      if (user_id === adminUser.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Cannot delete your own account' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('custom_users')
        .delete()
        .eq('id', user_id);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`User ${user_id} deleted by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'User deleted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'send_invite') {
      const { invite_data } = body;
      if (!invite_data || !invite_data.email || !invite_data.permissions) {
        return new Response(
          JSON.stringify({ success: false, error: 'Email and permissions required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('custom_users')
        .select('id')
        .eq('email', invite_data.email)
        .single();

      if (existingUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Email already registered' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate token
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Generate temp password if needed
      let tempPassword: string | null = null;
      if (invite_data.invite_type === 'temp_password') {
        tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
      }

      const { error: insertError } = await supabase
        .from('permission_invite_tokens')
        .insert({
          email: invite_data.email,
          username: invite_data.username,
          invite_type: invite_data.invite_type,
          token,
          temporary_password: tempPassword,
          permissions: invite_data.permissions,
          invited_by: adminUser.id,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Failed to create invite:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create invite' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine the app URL from request origin or referer header
      const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || Deno.env.get('APP_URL') || 'https://dduzbchuswwbefdunfct.lovable.app';
      const appUrl = origin.replace(/\/+$/, ''); // Remove trailing slashes
      const inviteUrl = `${appUrl}/accept-invite?token=${token}`;

      // Send email
      let emailContent = '';
      if (invite_data.invite_type === 'magic_link') {
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">You're Invited!</h1>
            <p>Hello${invite_data.username ? ` ${invite_data.username}` : ''},</p>
            <p>${adminUser.username} has invited you to join the NPC Dashboard.</p>
            <div style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Accept Invitation
              </a>
            </div>
            <p>This invitation expires in 7 days.</p>
            <p style="color: #666; font-size: 12px;">
              If the button doesn't work, copy this link: ${inviteUrl}
            </p>
          </div>
        `;
      } else {
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Your NPC Dashboard Account</h1>
            <p>Hello${invite_data.username ? ` ${invite_data.username}` : ''},</p>
            <p>${adminUser.username} has created an account for you on NPC Dashboard.</p>
            <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Username:</strong> ${invite_data.username || invite_data.email.split('@')[0]}</p>
              <p style="margin: 10px 0 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
            </div>
            <div style="margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Set Up Your Account
              </a>
            </div>
            <p>Please change your password after logging in.</p>
            <p>This invitation expires in 7 days.</p>
          </div>
        `;
      }

      const { error: emailError } = await resend.emails.send({
        from: 'NPC Admin <admin@npcservices.com.au>',
        to: [invite_data.email],
        subject: 'You\'re Invited to NPC Dashboard',
        html: emailContent,
      });

      if (emailError) {
        console.error('Failed to send invite email:', emailError);
        // Still return success since invite was created
      }

      console.log(`Invite sent to ${invite_data.email} by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Invite sent successfully',
          invite_url: inviteUrl,
          temporary_password: tempPassword
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'promote_to_superadmin') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Assign superadmin role
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id, role: 'superadmin' }, { onConflict: 'user_id,role' });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`User ${user_id} promoted to superadmin by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'User promoted to superadmin' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'demote_from_superadmin') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prevent demoting yourself
      if (user_id === adminUser.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Cannot demote yourself' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Remove superadmin role from user_roles table
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', user_id)
        .eq('role', 'superadmin');

      if (roleError) {
        return new Response(
          JSON.stringify({ success: false, error: roleError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update custom_users role back to sub_admin
      const { error: userError } = await supabase
        .from('custom_users')
        .update({ role: 'sub_admin', updated_at: new Date().toISOString() })
        .eq('id', user_id);

      if (userError) {
        console.error('Failed to update custom_users role:', userError);
        // Don't fail the whole operation, the main role removal succeeded
      }

      console.log(`User ${user_id} demoted from superadmin by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ success: true, message: 'User demoted from superadmin' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'create_subadmin') {
      const { subadmin_data } = body;
      if (!subadmin_data || !subadmin_data.username || !subadmin_data.password || !subadmin_data.permissions) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username, password, and permissions required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (subadmin_data.password.length < 6) {
        return new Response(
          JSON.stringify({ success: false, error: 'Password must be at least 6 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if username already exists
      const { data: existingUser } = await supabase
        .from('custom_users')
        .select('id')
        .eq('username', subadmin_data.username)
        .single();

      if (existingUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username already exists' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if email already exists (if provided)
      if (subadmin_data.email) {
        const { data: existingEmail } = await supabase
          .from('custom_users')
          .select('id')
          .eq('email', subadmin_data.email)
          .single();

        if (existingEmail) {
          return new Response(
            JSON.stringify({ success: false, error: 'Email already registered' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Create user
      const { data: newUser, error: userError } = await supabase
        .from('custom_users')
        .insert({
          username: subadmin_data.username,
          email: subadmin_data.email || null,
          password_hash: subadmin_data.password, // In production, use bcrypt
          personal_mailbox: subadmin_data.personal_mailbox || null,
          role: 'admin',
          is_active: true,
        })
        .select()
        .single();

      if (userError) {
        console.error('Failed to create sub-admin:', userError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create user. Username may already exist.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Assign admin role
      await supabase
        .from('user_roles')
        .insert({ user_id: newUser.id, role: 'admin' });

      // Assign permissions
      const permissions = subadmin_data.permissions;
      
      for (const perm of permissions) {
        const { data: module } = await supabase
          .from('dashboard_modules')
          .select('id')
          .eq('module_key', perm.module_key)
          .single();

        if (module) {
          await supabase
            .from('user_permissions')
            .insert({
              user_id: newUser.id,
              module_id: module.id,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
              granted_by: adminUser.id,
            });
        }
      }

      console.log(`Sub-admin ${subadmin_data.username} created by ${adminUser.username}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Sub-admin created successfully',
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Admin user management error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});