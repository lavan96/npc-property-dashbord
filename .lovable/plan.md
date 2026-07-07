# Phase 8 — Cross-surface Intelligence & Autonomy

Phases 6–7 shipped persistent embeddings, hybrid retrieval, subscriptions, scheduled agent plans, and full plan/step traceability. Phase 8 unifies the two tracks and closes the last unattended-mode gaps: a shared insight feed, digest emails, agent-authored subscriptions, an internal skill marketplace, and evaluation dashboards.

---

## Track A — Market Updates Q&A Phase 8

**Goal:** turn Q&A subscriptions from single-question pings into curated daily/weekly digests, and expose retrieval quality.

### DB (additive)
- `market_qa_digests` — `user_id, cadence, sent_at, question_ids uuid[], summary_md, delivery_channels[]`.
- `market_qa_subscriptions`: `+ digest_group text` so multiple questions can roll into one digest.
- `market_qa_quality_baselines` already exists → add `market_qa_quality_daily` MV or scheduled snapshot with per-day p50/p95 latency, avg citations, hybrid-vs-vector win rate.

### Edge function edits
- New `market-qa-digest-runner` — hourly cron, groups due subscriptions by `(user_id, digest_group, cadence)`, runs each question through `market-updates-qa`, synthesises a single markdown digest via Lovable AI, writes `market_qa_digests`, notifies via `notifications` + optional email.
- `market-updates-qa`: emit `retrieval_mode` (`hybrid|vector|lexical|fallback`) and per-result score breakdown; persist to `market_update_questions.metadata`.
- New `market-qa-quality-report` — read-only aggregation endpoint for the dashboard.

### Frontend
- `/qa/subscriptions`: add "Group into digest" field; new `/qa/digests` history page.
- `/admin/market-qa-quality` (superadmin) — retrieval mode mix, latency, citation coverage, hybrid win rate charts.

---

## Track B — Aurixa Agent Phase 8

**Goal:** let the agent create its own subscriptions/plans, expose a skill marketplace, and surface eval health.

### DB (additive)
- `agent_skills`: `+ is_public boolean, install_count int, avg_success_rate numeric` (skills already exist; adding marketplace metadata).
- `agent_skill_installs` — `user_id, skill_id, installed_at, overrides jsonb`.
- `agent_insights_feed` — unified feed rows produced by scheduled plans, Q&A digests, and eval regressions (`source, ref_id, title, body_md, severity, created_at, read_at`).

### Edge function edits
- `agent-planner`: new `propose-subscription` tool the agent can call to draft a `market_qa_subscription` for the user (requires approval boundary, same governance as other write actions).
- New `agent-skill-marketplace` — list/install/uninstall public skills, snapshot into user's `agent_skills` on install.
- New `agent-insights-feed-runner` — cron every 15 min, materialises new items (recent plan_runs, new digests, eval baseline regressions > 10%).
- `agent-eval-runs`: extend `agent-planner` `run-eval` action to write a regression row into `agent_insights_feed` when score drops vs baseline.

### Frontend
- New `/agent/skills` — marketplace grid (installed vs available, install/uninstall, per-skill success/latency).
- New `/agent/insights` — unified feed with source filters (plan_run | qa_digest | eval_regression), mark read, deep-link back to source page.
- `/agent/plans` detail: add "Eval status" chip (green/amber/red) pulled from latest `agent_eval_runs`.
- `AgentChatWidget`: when the agent proposes a subscription, render an inline "Approve subscription" card that hits `market-qa-subscriptions.create`.

---

## Cron
- Hourly `market-qa-digest-runner`.
- Every 15 min `agent-insights-feed-runner`.
- Daily 06:00 AEST `market-qa-quality-snapshot`.

## Delivery order (single response after approval)
1. One `supabase--migration` — digests, digest_group, marketplace metadata, installs, insights feed, quality snapshot table.
2. New edge functions + edits above.
3. New pages: `/qa/digests`, `/admin/market-qa-quality`, `/agent/skills`, `/agent/insights`; plus subscription-approval card in `AgentChatWidget`.
4. `supabase--insert` for three cron entries (idempotent by name).

## Technical notes
- Digest synthesis uses Lovable AI (`google/gemini-2.5-flash`) with the same citation-preserving prompt already used in `market-updates-qa`; token metering via existing `reportMetering` path.
- Insights feed is append-only; `read_at` per-user; the runner is idempotent on `(source, ref_id)`.
- Marketplace installs snapshot the skill definition so upstream edits don't silently mutate a user's agent behaviour.
- All new tables follow the standard 4-step grant/RLS pattern; every insert scoped to `auth.uid()`; feed + digests readable only by owner.
- No breaking changes to Phase 6/7 shapes — every addition is additive.

Reply **"Proceed"** to ship, or tell me what to trim/expand.
