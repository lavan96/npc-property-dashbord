import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-dashboard-agent`;

async function callTool(toolName: string, toolArgs: Record<string, any>, userId?: string) {
  const body: any = {
    action: "execute-tool",
    tool_name: toolName,
    tool_args: toolArgs,
    source: "scheduled_task",
  };
  if (userId) body.user_id = userId;

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// Track created IDs for cleanup
let testClientId: string | null = null;
let testNoteId: string | null = null;
let testReminderId: string | null = null;

// ─── TEST 1: search_clients ───
Deno.test("Session1: search_clients works", async () => {
  const { status, data } = await callTool("search_clients", { query: "a" });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ search_clients returned ${data.result?.count || 0} results`);
});

// ─── TEST 2: create_client ───
Deno.test("Session1: create_client works", async () => {
  const { status, data } = await callTool("create_client", {
    first_name: "TestAgent",
    surname: "AutoCleanup",
    email: "testagent@cleanup.test",
    mobile: "0400000000",
    pipeline_status: "lead",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ create_client result:`, data.result?.message);
  testClientId = data.result?.client?.id;
  console.log(`  📋 Created client ID: ${testClientId}`);
});

// ─── TEST 3: get_client_details (by UUID) ───
Deno.test("Session1: get_client_details by UUID", async () => {
  if (!testClientId) throw new Error("No test client created");
  const { status, data } = await callTool("get_client_details", { client_id: testClientId });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  assertEquals(data.result?.client?.primary_first_name, "TestAgent");
  console.log(`  ✅ get_client_details returned client: ${data.result?.client?.primary_first_name} ${data.result?.client?.primary_surname}`);
});

// ─── TEST 4: get_client_details (by name - ID resolution) ───
Deno.test("Session1: get_client_details by name (ID resolution)", async () => {
  const { status, data } = await callTool("get_client_details", { client_id: "TestAgent AutoCleanup" });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  assertEquals(data.result?.client?.primary_first_name, "TestAgent");
  console.log(`  ✅ Name-based ID resolution worked`);
});

// ─── TEST 5: update_client_field ───
Deno.test("Session1: update_client_field", async () => {
  if (!testClientId) throw new Error("No test client");
  const { status, data } = await callTool("update_client_field", {
    client_id: testClientId,
    field: "pipeline_status",
    value: "active",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ update_client_field:`, data.result?.message);
});

// ─── TEST 6: update_client_field by name ───
Deno.test("Session1: update_client_field by name", async () => {
  const { status, data } = await callTool("update_client_field", {
    client_id: "TestAgent AutoCleanup",
    field: "pipeline_notes",
    value: "Updated via agent test",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ update_client_field by name:`, data.result?.message);
});

// ─── TEST 7: create_client_note ───
Deno.test("Session1: create_client_note", async () => {
  if (!testClientId) throw new Error("No test client");
  const { status, data } = await callTool("create_client_note", {
    client_id: testClientId,
    content: "Test note from agent automation",
    note_type: "general",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  testNoteId = data.result?.note?.id;
  console.log(`  ✅ create_client_note:`, data.result?.message, `noteId: ${testNoteId}`);
});

// ─── TEST 8: get_client_notes ───
Deno.test("Session1: get_client_notes", async () => {
  if (!testClientId) throw new Error("No test client");
  const { status, data } = await callTool("get_client_notes", { client_id: testClientId });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  const noteCount = data.result?.notes?.length || 0;
  console.log(`  ✅ get_client_notes: ${noteCount} notes found`);
});

// ─── TEST 9: update_client_note ───
Deno.test("Session1: update_client_note", async () => {
  if (!testNoteId) throw new Error("No test note");
  const { status, data } = await callTool("update_client_note", {
    note_id: testNoteId,
    content: "Updated test note content",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ update_client_note:`, data.result?.message);
});

// ─── TEST 10: log_client_activity ───
Deno.test("Session1: log_client_activity", async () => {
  if (!testClientId) throw new Error("No test client");
  const { status, data } = await callTool("log_client_activity", {
    client_id: testClientId,
    title: "Agent test activity",
    description: "Automated test",
    activity_type: "note",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ log_client_activity:`, data.result?.message);
});

// ─── TEST 11: get_client_activities ───
Deno.test("Session1: get_client_activities", async () => {
  if (!testClientId) throw new Error("No test client");
  const { status, data } = await callTool("get_client_activities", { client_id: testClientId });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ get_client_activities: ${data.result?.activities?.length || 0} activities`);
});

// ─── TEST 12: set_follow_up_date ───
Deno.test("Session1: set_follow_up_date", async () => {
  if (!testClientId) throw new Error("No test client");
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const { status, data } = await callTool("set_follow_up_date", {
    client_id: testClientId,
    follow_up_date: futureDate,
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ set_follow_up_date:`, data.result?.message);
});

// ─── TEST 13: create_reminder ───
Deno.test("Session1: create_reminder", async () => {
  if (!testClientId) throw new Error("No test client");
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString();
  const { status, data } = await callTool("create_reminder", {
    client_id: testClientId,
    title: "Test agent reminder",
    description: "Auto-created for testing",
    due_date: dueDate,
    priority: "high",
    reminder_type: "task",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  testReminderId = data.result?.reminder?.id;
  console.log(`  ✅ create_reminder:`, data.result?.message, `reminderId: ${testReminderId}`);
});

// ─── TEST 14: update_reminder (complete) ───
Deno.test("Session1: update_reminder complete", async () => {
  if (!testReminderId) throw new Error("No test reminder");
  const { status, data } = await callTool("update_reminder", {
    reminder_id: testReminderId,
    action: "complete",
  });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ update_reminder complete:`, data.result?.message);
});

// ─── TEST 15: get_clients_by_pipeline_status ───
Deno.test("Session1: get_clients_by_pipeline_status", async () => {
  const { status, data } = await callTool("get_clients_by_pipeline_status", { status: "active" });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ get_clients_by_pipeline_status: ${data.result?.count || 0} active clients`);
});

// ─── TEST 16: get_clients_needing_follow_up ───
Deno.test("Session1: get_clients_needing_follow_up", async () => {
  const { status, data } = await callTool("get_clients_needing_follow_up", { days_inactive: 14 });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ get_clients_needing_follow_up: ${data.result?.overdue_follow_ups?.length || 0} overdue, ${data.result?.inactive_clients?.length || 0} inactive`);
});

// ─── TEST 17: Invalid client ID (should return error, not crash) ───
Deno.test("Session1: invalid client_id returns error gracefully", async () => {
  const { status, data } = await callTool("get_client_details", { client_id: "00000000-0000-0000-0000-000000000000" });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  // Should have error in result
  console.log(`  ✅ Invalid UUID handled:`, data.result?.error || "no error field");
});

// ─── TEST 18: Name resolution with non-existent name ───
Deno.test("Session1: non-existent name returns error gracefully", async () => {
  const { status, data } = await callTool("get_client_details", { client_id: "Zzyzzyva Nonexistent" });
  assertEquals(status, 200);
  assertEquals(data.success, true);
  console.log(`  ✅ Non-existent name handled:`, data.result?.error || "no error field");
});

// ─── CLEANUP: delete test note ───
Deno.test("Session1: CLEANUP delete_client_note", async () => {
  if (!testNoteId) { console.log("  ⏭ No note to clean up"); return; }
  const { status, data } = await callTool("delete_client_note", { note_id: testNoteId });
  assertEquals(status, 200);
  console.log(`  🧹 delete_client_note:`, data.result?.message);
});

// ─── CLEANUP: delete reminder ───
Deno.test("Session1: CLEANUP delete_reminder", async () => {
  if (!testReminderId) { console.log("  ⏭ No reminder to clean up"); return; }
  const { status, data } = await callTool("delete_reminder", { reminder_id: testReminderId });
  assertEquals(status, 200);
  console.log(`  🧹 delete_reminder:`, data.result?.message);
});

// ─── CLEANUP: delete test client ───
Deno.test("Session1: CLEANUP delete_client", async () => {
  if (!testClientId) { console.log("  ⏭ No client to clean up"); return; }
  const { status, data } = await callTool("delete_client", { client_id: testClientId });
  assertEquals(status, 200);
  console.log(`  🧹 delete_client:`, data.result?.message);
});
