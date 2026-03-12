import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Agent Scheduled Task Runner
 * Triggered by pg_cron every 5 minutes. Checks for enabled scheduled tasks
 * whose next_run_at has passed, executes them via the ai-dashboard-agent,
 * and updates their run metadata.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() || '';
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Verify this is a scheduled/service call
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceCall = authHeader.includes(serviceRoleKey) || body.source === 'scheduled';

    if (!isServiceCall) {
      // Also allow anon key calls (from pg_cron via net.http_post)
      const apiKey = req.headers.get('apikey') || '';
      if (!apiKey && !authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
    }

    const now = new Date().toISOString();
    console.log(`[agent-task-runner] Starting run at ${now}`);

    // Fetch enabled tasks that are due to run
    const { data: dueTasks, error: fetchErr } = await sb
      .from('agent_scheduled_tasks')
      .select('*')
      .eq('is_enabled', true)
      .lte('next_run_at', now)
      .order('next_run_at', { ascending: true })
      .limit(10);

    if (fetchErr) {
      console.error('[agent-task-runner] Fetch error:', fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders });
    }

    if (!dueTasks || dueTasks.length === 0) {
      console.log('[agent-task-runner] No tasks due');
      return new Response(JSON.stringify({ success: true, processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[agent-task-runner] ${dueTasks.length} task(s) due`);

    let processed = 0;
    let failed = 0;

    for (const task of dueTasks) {
      try {
        console.log(`[agent-task-runner] Executing task: ${task.name} (${task.id})`);

        let result: any = null;

        if (task.task_type === 'playbook' && task.playbook_id) {
          // Execute playbook by invoking the agent
          const response = await fetch(`${supabaseUrl}/functions/v1/ai-dashboard-agent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': anonKey,
            },
            body: JSON.stringify({
              action: 'execute-tool',
              tool_name: 'run_playbook',
              tool_args: { playbook_id: task.playbook_id },
              user_id: task.user_id,
              source: 'scheduled_task',
            }),
          });
          result = await response.json().catch(() => ({ error: 'Failed to parse response' }));
        } else if (task.task_type === 'single_tool' && task.tool_name) {
          // Execute single tool
          const response = await fetch(`${supabaseUrl}/functions/v1/ai-dashboard-agent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': anonKey,
            },
            body: JSON.stringify({
              action: 'execute-tool',
              tool_name: task.tool_name,
              tool_args: task.tool_arguments || {},
              user_id: task.user_id,
              source: 'scheduled_task',
            }),
          });
          result = await response.json().catch(() => ({ error: 'Failed to parse response' }));
        } else {
          result = { error: `Invalid task configuration: type=${task.task_type}` };
        }

        const nextRun = calculateNextRun(task.schedule_cron);
        const runStatus = result?.error ? 'error' : 'success';

        await sb.from('agent_scheduled_tasks').update({
          last_run_at: now,
          last_run_status: runStatus,
          last_run_result: result,
          next_run_at: nextRun,
          run_count: (task.run_count || 0) + 1,
          updated_at: now,
        }).eq('id', task.id);

        if (runStatus === 'success') {
          processed++;
          console.log(`[agent-task-runner] Task "${task.name}" completed successfully`);
        } else {
          failed++;
          console.error(`[agent-task-runner] Task "${task.name}" failed:`, result?.error);
        }
      } catch (err: any) {
        failed++;
        console.error(`[agent-task-runner] Task "${task.name}" threw:`, err.message);

        const nextRun = calculateNextRun(task.schedule_cron);
        await sb.from('agent_scheduled_tasks').update({
          last_run_at: now,
          last_run_status: 'error',
          last_run_result: { error: err.message },
          next_run_at: nextRun,
          updated_at: now,
        }).eq('id', task.id);
      }
    }

    console.log(`[agent-task-runner] Done: ${processed} succeeded, ${failed} failed`);
    return new Response(
      JSON.stringify({ success: true, processed, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[agent-task-runner] Fatal error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Calculate next run time from a cron expression.
 * Simple parser for common patterns; falls back to +1 hour.
 */
function calculateNextRun(cron: string): string {
  const now = new Date();
  const parts = cron.trim().split(/\s+/);

  if (parts.length !== 5) {
    // Invalid cron, default to 1 hour from now
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Handle simple interval patterns
  // */N minutes
  if (minute.startsWith('*/') && hour === '*') {
    const interval = parseInt(minute.slice(2)) || 60;
    return new Date(now.getTime() + interval * 60 * 1000).toISOString();
  }

  // Specific minute, */N hours
  if (hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2)) || 1;
    return new Date(now.getTime() + interval * 60 * 60 * 1000).toISOString();
  }

  // Specific time daily or weekday
  if (minute !== '*' && hour !== '*') {
    const targetMinute = parseInt(minute) || 0;
    const targetHour = parseInt(hour) || 0;

    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);

    // If today's time has passed, move to next eligible day
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Handle day-of-week constraints (0=Sunday, 1-5=Mon-Fri, 6=Saturday)
    if (dayOfWeek !== '*') {
      const allowedDays = parseCronField(dayOfWeek, 0, 6);
      let safety = 0;
      while (!allowedDays.includes(next.getDay()) && safety < 8) {
        next.setDate(next.getDate() + 1);
        safety++;
      }
    }

    return next.toISOString();
  }

  // Fallback: 1 hour
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

/**
 * Parse a cron field like "1-5" or "0,3,6" or "*/2" into an array of values.
 */
function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => min + i);

  const values: number[] = [];
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.push(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2)) || 1;
      for (let i = min; i <= max; i += step) values.push(i);
    } else {
      values.push(parseInt(part));
    }
  }
  return values;
}
