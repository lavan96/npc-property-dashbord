import { readFileSync } from 'node:fs';

const handler = readFileSync('supabase/functions/ai-dashboard-agent/index.ts', 'utf8');
const policy = readFileSync('supabase/functions/_shared/agentToolAuthz.ts', 'utf8');
const toolNames = [...handler.slice(handler.indexOf('async function executeTool'))
  .matchAll(/case '([^']+)': return execute/g)].map((match) => match[1]);
const failures = [];

for (const name of toolNames) {
  const row = policy.match(new RegExp(`'${name}':\\{([^}]+)\\}`));
  if (!row) { failures.push(`missing policy: ${name}`); continue; }
  const body = row[1];
  if (!/moduleKey:'[^']+'/.test(body)) failures.push(`missing module key: ${name}`);
  if (/^(add_|bulk_|cancel_|complete_|create_|delete_|generate_|link_|log_|remove_|reconcile_|revoke_|run_|save_|send_|set_|toggle_|trigger_|undo_|update_)/.test(name)
    && /permission:'can_view'/.test(body)) failures.push(`write tool has can_view: ${name}`);
  if (name.startsWith('delete_') && !/requiresConfirmation:true/.test(body)) failures.push(`delete lacks confirmation: ${name}`);
  if (/allowedActorTypes:\['human','internal'\]/.test(body) && !/allowedInternalCallers:\[/.test(body)) failures.push(`internal actor lacks allowlist: ${name}`);
}

// High-value data has a real business module (not the generic AI shell), and
// organization-wide/admin reads are explicitly elevated.
for (const expected of [
  "get_client_details: { moduleKey: 'clients', permission: 'can_view' }",
  "get_income_sources: { moduleKey: 'clients', permission: 'can_view' }",
  "send_email: { moduleKey: 'email_copilot', permission: 'can_edit' }",
  "get_commission_actuals: { moduleKey: 'finance', permission: 'can_view' }",
  "send_agreement_docusign: { moduleKey: 'agreements', permission: 'can_edit' }",
  "get_user_list: { moduleKey: 'platform_administration', permission: 'can_view', requiresSuperadmin: true }",
]) if (!policy.includes(expected)) failures.push(`missing real-module override: ${expected}`);

if (failures.length) {
  console.error(`Agent tool policy check FAILED:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Agent tool policy check passed (${toolNames.length} tools; semantic policy invariants verified).`);
