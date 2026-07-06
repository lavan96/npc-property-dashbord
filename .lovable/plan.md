# Phase 6 — Market Updates Q&A + Aurixa Agent (parallel)

Both tracks ship in one migration + focused new edge functions + new UI pages. Existing large edge functions (`market-updates-qa`, `ai-dashboard-agent`) get **only additive changes**; new capabilities live in dedicated new functions so we don't destabilise Phase 5.

---

## Track A — Market Updates Q&A Phase 6

Goal: turn the Phase 3 semantic recall path from ephemeral to persistent, let analysts share/export answers, and give superadmins a real regression baseline.

**DB (additive):**
- Enable `pgvector` (already available in Supabase).
- `market_updates.embedding vector(1536)` + `embedding_generated_at` + ivfflat index (`vector_cosine_ops`, lists=100).
- `market_update_qa_shares` — public share links for a specific `market_update_questions` row (slug, expires_at, view_count).
- `market_qa_quality_baselines` — stores nightly aggregate metrics (avg confidence, refusal rate, avg retrieved/used, model mix) so `/admin/market-qa-quality` can show trend deltas.

**New edge functions:**
- `market-updates-embed-backfill` — batched embedder using `google/gemini-embedding-001`; embeds any `market_updates` row where `embedding IS NULL`; run hourly via existing pg_cron pattern (200 rows/batch).
- `market-qa-share` — mint + resolve public share tokens; write-through counter.
- `market-qa-quality-snapshot` — daily nightly job writing one row to `market_qa_quality_baselines`.

**Existing edge function (small additive edit only):**
- `market-updates-qa`: prefer persistent `embedding` column when present; fall back to per-request embedding (Phase 3 path) otherwise. No API-shape change.

**Frontend:**
- Reuse existing `SharedQAAnswer` route pattern: new `/qa/:slug` public route for market Q&A shares.
- Add "Share answer" button to `MarketQAConversation` message actions.
- `MarketQAQuality` gets a Trend tab: 30-day sparkline of confidence / refusal rate / retrieval breadth from `market_qa_quality_baselines`.

**Cron:** two new pg_cron entries (hourly embed backfill; nightly quality snapshot at 02:15 UTC).

---

## Track B — Aurixa Agent Phase 6

Goal: promote the agent from turn-by-turn tool use to **long-horizon planned runs with human approvals**, and give the eval harness a real regression baseline.

**DB (additive):**
- `agent_plans` — `id, user_id, title, goal, status (draft|awaiting_approval|approved|running|paused|completed|cancelled|failed), context jsonb, skill_slug, requires_approval bool, created_at, updated_at, completed_at`.
- `agent_plan_steps` — `id, plan_id, seq int, title, description, tool_calls jsonb, expected_output, status (pending|approved|running|done|skipped|failed), result jsonb, started_at, completed_at`.
- `agent_eval_baselines` — snapshot rows from `agent_eval_runs` promoted to baseline; used by `/admin/agent-quality` to compute pass-rate regression vs. previous baseline.

All service-role-locked, per Phase 5 pattern; user-owned via RLS.

**New edge function `agent-planner`:**
- Actions: `draft-plan` (LLM decomposes goal → steps using selected skill's `system_prompt`), `list-plans`, `get-plan`, `approve-step`, `approve-all`, `execute-next-step`, `pause-plan`, `resume-plan`, `cancel-plan`.
- `execute-next-step` calls back into the existing `ai-dashboard-agent` chat action with the step context, records the tool_calls trace, updates step status.
- Uses `google/gemini-2.5-pro` for planning (analytical), `gemini-3-flash-preview` for step execution routing (same router as Phase 3).

**Existing edge function (small additive edit only):**
- `ai-dashboard-agent`: add `promote-baseline` and `list-baselines` actions that read/write `agent_eval_baselines`; add `plan_id`/`step_id` optional pass-through so agent traces can be linked back to the plan.

**Frontend:**
- New `/agent/plans` page — list of plans (status filter), plan detail with step timeline, per-step approve/skip/execute buttons, live status polling.
- New "Draft plan" affordance in `AgentChatWidget` composer footer (opens a small dialog capturing goal + skill; submits to `agent-planner draft-plan`).
- `/admin/agent-quality` gets a "Baselines" tab: promote current eval run to baseline, diff current vs. last baseline (pass-rate delta, per-eval regressions highlighted).

---

## Delivery order (single response)

1. `supabase--migration` for all four tables + pgvector enable + baselines table (both tracks in one migration).
2. Create `market-updates-embed-backfill`, `market-qa-share`, `market-qa-quality-snapshot`, `agent-planner` edge functions.
3. Additive edits to `market-updates-qa` (embedding preference) and `ai-dashboard-agent` (baseline + plan pass-through actions).
4. New pages `src/pages/agent/AgentPlans.tsx`, `src/pages/qa/SharedMarketQAAnswer.tsx`; extend `MarketQAConversation`, `MarketQAQuality`, `AgentChatWidget`, `AgentQuality` with the new surfaces; register routes in `App.tsx`.
5. Propose (not auto-run) two `supabase--insert` cron entries for the new hourly/nightly jobs.

## Technical notes

- Embedding model: `google/gemini-embedding-001` (1536-dim). Backfill batches of 200, 5s throttle, hard 20k budget per run.
- Planner LLM output constrained via AI SDK `Output.object` with a small schema (`{ steps: [{ title, description, expected_output, tool_hint? }] }`) — no bounds/enums in schema; text-level constraints in the prompt per the AI SDK rule.
- Plan execution is one-step-at-a-time, human-approved by default. `requires_approval=false` plans can auto-advance but still surface every tool call in the trace.
- All new edge functions require JWT and reuse the shared `verifyAuth` + CORS helpers.
- No changes to Mission Control token metering shape; new AI calls route through `generateWithTokens` where applicable.

Reply "Proceed" to ship, or tell me what to trim.
