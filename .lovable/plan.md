# Phase 7 — Market Q&A + Aurixa Agent (parallel, continues from Phase 6)

Phase 6 shipped persistent embeddings, share links, quality baselines, and long-horizon plans. Phase 7 closes the deliberate gaps we left, adds the "unattended" surfaces (scheduled/recurring plans, digest subscriptions), and moves Market Q&A retrieval to hybrid search.

---

## Track A — Market Updates Q&A Phase 7

**Goal:** actually consume the persistent embeddings, add hybrid (vector + lexical) retrieval, and let people subscribe to answers.

### DB (additive)
- `market_updates.search_tsv tsvector` generated column (`title || summary || why_it_matters`) + GIN index for lexical scoring.
- `market_qa_subscriptions` — `user_id, question_template, cadence (daily|weekly), channels (email|in_app), last_run_at, next_run_at, is_active`.
- `market_qa_subscription_runs` — one row per run, links to the resulting `market_update_questions.id`.

### Edge function edits (additive)
- `market-updates-qa`: prefer `market_updates.embedding` when present; add lexical scoring path (`ts_rank_cd`) blended with cosine similarity (0.7 semantic / 0.3 lexical), configurable via body flag. No API shape change.
- New `market-qa-subscriptions` — CRUD + `run-due` action (cron-invoked hourly) that re-asks each due question via `market-updates-qa`, writes result, notifies subscriber via existing `notifications` insert (+ optional email when a mailer exists).

### Frontend
- `MarketQAConversation`: add "Subscribe to updates on this question" button (opens dialog: cadence + channels).
- New `/qa/subscriptions` page listing user's subscriptions with pause/resume/delete and last-run summary.

### Cron
- Hourly `market-qa-subscriptions-run-due`.

---

## Track B — Aurixa Agent Phase 7

**Goal:** unattended execution, recurring plans, and full plan/step traceability in the agent chat.

### DB (additive)
- `agent_plans`: `+ schedule_cron text, next_run_at timestamptz, last_run_at timestamptz, auto_execute boolean default false`.
- `agent_plan_runs` — `plan_id, started_at, finished_at, status, step_ids uuid[]` so recurring plans keep run history separate from step lifecycle.
- `agent_action_log`: `+ plan_id, step_id` for cross-linking (already in schema check — additive only if missing).

### Edge function edits (additive)
- `ai-dashboard-agent`: accept optional `plan_id`/`step_id` in chat body, persist them on `agent_messages` + `agent_action_log` rows so the trace lines up with `/agent/plans`.
- `agent-planner`: add `schedule-plan` (validate cron), `unschedule-plan`, `run-scheduled` (cron-invoked; instantiates a plan_run and calls `execute-next-step` in a loop until an approval boundary or terminal state, respecting `auto_execute`).

### Frontend
- `/agent/plans` detail page: new "Schedule" card (cron picker with 4 presets + custom, auto-execute toggle, next-run/last-run readout), and a "Runs" tab showing historic `agent_plan_runs`.
- `AgentChatWidget`: if a message is streamed with `plan_id`/`step_id`, add a small "Step 3 of 5 · plan: X" chip linking back to the plan.

### Cron
- Every 5 min `agent-planner-run-scheduled`.

---

## Delivery order (single response)

1. Single `supabase--migration` — tsvector column + GIN, subscriptions tables, plan scheduling columns, plan_runs table.
2. New edge functions: `market-qa-subscriptions`, and the edits to `market-updates-qa`, `ai-dashboard-agent`, `agent-planner`.
3. New pages / dialogs: `/qa/subscriptions`, subscribe dialog in `MarketQAConversation`, schedule card + runs tab in `AgentPlans`, plan/step chip in `AgentChatWidget`.
4. Two `supabase--insert` cron entries (5-min agent runner, hourly Q&A subscriptions runner).

## Technical notes
- Hybrid score: `0.7 * (1 - cosine) + 0.3 * ts_rank_cd_norm`. Fall back to pure vector when tsvector is unpopulated for a row.
- Cron validation: reject anything more frequent than every 5 minutes; enforce a per-user cap of 10 scheduled plans.
- Auto-execute plans still write every tool call to `agent_action_log` and honour skill safety bounds.
- No breaking changes to Phase 6 shapes; every DB and function edit is additive.

Reply **"Proceed"** to ship, or tell me what to trim/expand.
