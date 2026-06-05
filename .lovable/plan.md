
# Report Generation Engine — Observability & Agentic Control

Goal: surface exactly what the engine does on every run (system prompt, template structure, embeddings used, data packet, per-chunk inputs/outputs, token usage, timing), and let a dedicated AI agent safely modify the engine's config knobs on the fly.

This is a foundation pass — no changes to the actual generation logic, only instrumentation + a control surface. Figma integration comes after.

---

## 1. What we need to see (the "under the hood" view)

For every report generation run we capture and expose:

1. **Run metadata** — report id, scope (compass / executive / suburb / comparison), variant (fork), model, started_at, finished_at, total tokens, cost.
2. **Engine config snapshot** — which `report_structure_templates` row(s) were resolved (id, name, tier, category, version), which `reportSplitRegistry` entry was used, which Compass-40 banner/overlay, which manual overrides were merged.
3. **System prompt (final)** — the exact `systemMessage` sent, including brand name, area system message, and any prepended banners.
4. **Data packet** — the canonical bundle (financials, scoring, property facts, suburb stats, document/URL extract, overrides). Captured **once** with a hash, then per chunk we record which subset of keys was actually inlined into that chunk's prompt — so we can answer "is the entire packet going into every chunk?".
5. **Embedding retrieval** — for every call to `retrieve-template-context`: the query, template filter (tier/category/type), threshold, top-k, and the chunk ids + similarity scores returned (already partially logged — needs persisting).
6. **Per-chunk record** — section key, ordinal, model, prompt (system+user as sent), retrieved template chunks attached, data-packet keys attached, response text, tool calls, prompt/completion tokens, latency, retries, error.
7. **Diff vs previous run** — for the same report, highlight what changed in template/system prompt/data packet between runs.

### Storage

Two new tables (additive, service_role-only RLS, GRANT to authenticated for read via secure edge):

- `report_generation_runs` — one row per generate call. Columns: id, report_id, scope, variant, engine_version, template_ids jsonb, system_prompt text, data_packet jsonb, data_packet_hash, model, total_tokens, total_cost_cents, started_at, finished_at, status, error.
- `report_generation_chunks` — one row per section/chunk. Columns: id, run_id, section_key, ordinal, model, system_prompt text, user_prompt text, attached_template_chunk_ids jsonb, attached_packet_keys text[], retrieval_meta jsonb (query, threshold, k, hits[]), response text, tool_calls jsonb, prompt_tokens, completion_tokens, latency_ms, retry_count, error.

Both with `created_at`, indexed by `report_id` and `run_id`. Mirrored into `supabase_realtime` so the UI streams live.

### Instrumentation hooks (no behavior change)

A tiny `_shared/generation-trace.ts` helper exposes:
- `startRun(report, ctx) -> runId`
- `recordRetrieval(runId, sectionKey, meta)`
- `recordChunk(runId, sectionKey, payload)`
- `finishRun(runId, summary)`

Wire it into:
- `generate-investment-report/index.ts` (around the `messages: [{role:'system'...}]` calls at lines ~1478 and 1556, and around the chunked-section loop).
- `retrieve-template-context/index.ts` (return the same `chunks[]` it already builds, but also persist via the helper when a `runId` header is forwarded).
- `regenerate-report-qualitative`, `fork-investment-report`, `condense-investment-report` — same hook, so forks and regenerations are traceable too.

---

## 2. Front-end surface

New superadmin-only page: **`/admin/report-engine-inspector`**.

Three panes:

**A. Run list** — recent runs (filter by report, scope, status). Click → opens detail.

**B. Run detail**
- Header: report address, scope, model, tokens, cost, duration, template ids (linked to Template Builder).
- Tabs:
  - *System Prompt* — full text, copy button, diff-vs-previous toggle.
  - *Data Packet* — JSON tree viewer, hash, size, key count. Pills show which keys were attached to which chunks (matrix view answers "is the whole packet in every chunk?" at a glance — green = attached, grey = omitted).
  - *Embeddings* — table per section: query, threshold, k, hits with similarity bar + chunk preview, source template name.
  - *Chunks* — collapsible per section: system+user prompt (left), response (right), tokens/latency/retries, attached template chunk ids, attached packet keys.
  - *Timeline* — gantt of chunk durations.

**C. Engine Editor (Agent chat)** — see §3.

Live updates via Supabase realtime on `report_generation_chunks` so an in-flight run streams in.

Reuses existing patterns: `ToolInvocations` chip style for tool calls, `invokeSecureFunction` for reads, dark gold theme, semantic tokens only.

---

## 3. Dedicated agentic editor

A scoped chat agent whose **only** job is to inspect and modify the report generation engine. Lives in the inspector page (right rail) and as a standalone route `/admin/report-engine-agent`.

### Scope (hard-coded — agent cannot escape)
Allowed targets:
- `report_structure_templates` rows (system prompts / structure / Compass-40 banner / area overlays)
- `reportSplitRegistry` entries (variant section lists, weights)
- Per-section model + temperature config
- Retrieval knobs: similarity threshold, top-k, template type filters
- Compass-40 hard-exclusion list

Forbidden:
- Any other table, any RLS/policy/grant, any secret, any code outside the registry/templates, any destructive op without preview.

### Architecture

Edge function `report-engine-agent` (new), based on the existing `report-qa` pattern + `_shared/agent-tools.ts` registry. Tools:

| Tool | Purpose |
| --- | --- |
| `list_runs(filter)` | Recent runs for inspection |
| `get_run(run_id)` | Full run detail (prompt, packet, chunks, retrieval) |
| `diff_runs(a, b)` | Diff system prompt / template / packet across runs |
| `get_template(id)` | Read a `report_structure_templates` row |
| `list_templates(filter)` | Browse active templates |
| `propose_template_edit(id, patch, rationale)` | **Stages** a JSON-patch into `report_engine_proposals` table — does NOT write to live template |
| `get_registry(variant)` | Read `reportSplitRegistry` snapshot |
| `propose_registry_edit(variant, patch, rationale)` | Same staging pattern |
| `propose_retrieval_config(patch, rationale)` | Stage threshold/k/filters change |
| `simulate_run(report_id, proposal_ids[])` | Dry-run: render the system prompt + retrieval result the proposed change would produce, **without** calling the LLM |
| `apply_proposal(proposal_id)` | Requires explicit user click in UI — agent never auto-applies |

### Guardrails
- Every mutation goes through `report_engine_proposals` (staged). UI shows the diff; superadmin clicks "Apply".
- All applied changes write to a new `report_engine_audit` table (who / when / before / after / rationale).
- Agent runs under a service_role-mediated edge function with a `verify_superadmin()` check.
- Token-metered via existing `generateWithTokens` so cost shows up in Mission Control.

### UX
- Standard chat with `ToolInvocations` chips (tool name, status, duration, expandable I/O) — pattern already used in `src/components/report-qa/ToolInvocations.tsx`.
- Streaming responses.
- Side panel pinned to a selected run so the agent always has fresh context.
- "Apply proposal" cards rendered inline with before/after diff.

---

## 4. Phases

1. **Schema + helper** — migration for the 3 new tables (`report_generation_runs`, `report_generation_chunks`, `report_engine_proposals`, `report_engine_audit`) with grants + realtime; add `_shared/generation-trace.ts`.
2. **Instrument generators** — wire trace helper into `generate-investment-report`, `retrieve-template-context`, `regenerate-report-qualitative`, `fork-investment-report`. Strictly observability — zero logic changes.
3. **Inspector UI** — `/admin/report-engine-inspector` with the 3 panes, realtime streaming, diff viewer, packet matrix.
4. **Agent edge function + tools** — `report-engine-agent` with the tool registry above, staging-only mutations, audit log.
5. **Agent UI** — chat with tool chips, proposal diff cards, apply button.
6. **Verification** — kick off a real report generation, confirm prompt + packet + per-chunk attachments + embeddings all stream into the inspector; ask the agent to "lower retrieval threshold to 0.65 for compass executive summary" → verify proposal stages, diff is correct, apply writes audit row.

After this lands, Figma integration plugs into Phase 3's template editor cleanly (templates are the integration seam).

---

## Technical notes

- All new edge functions: CORS standard headers, `verifyAuth`, superadmin gate, service_role internally — per `Edge Function Auth Standards` memory.
- All tables: service_role-only RLS with secure edge mediation (`invokeSecureFunction` + `ALLOWED_TABLES` whitelist update) — per `Secure RLS Mediation` memory.
- Realtime: add new tables to `supabase_realtime` publication — per `Realtime Standards` memory.
- Theme: dark gold tokens only, no hardcoded colors.
- Token metering: agent calls go through `generateWithTokens` with a new MC report slug.
- No changes to generation behavior in this phase — observability is read-only on the hot path; the only writes are the trace inserts.

Confirm and I'll start with Phase 1 (schema + trace helper).
