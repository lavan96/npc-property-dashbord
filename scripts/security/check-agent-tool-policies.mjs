import {readFileSync} from 'node:fs';
const src=readFileSync('supabase/functions/ai-dashboard-agent/index.ts','utf8');const policy=readFileSync('supabase/functions/_shared/agentToolAuthz.ts','utf8');
const names=[...src.slice(src.indexOf('async function executeTool')).matchAll(/case '([^']+)': return execute/g)].map(x=>x[1]); const missing=names.filter(n=>!policy.includes(`'${n}':`));if(missing.length){console.error(`Missing agent tool policies: ${missing.join(', ')}`);process.exit(1)} console.log(`Agent tool policy check passed (${names.length} tools).`);
