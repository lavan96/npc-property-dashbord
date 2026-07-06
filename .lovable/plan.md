# Market Updates AI Q&A — Phased Upgrade Plan
Status: Phases 1–4 shipped. Phase 5 remaining.

## Diagnosis (current state)
- The inline Q&A textarea in `src/pages/MarketUpdates.tsx` is bound to a Textarea that is **disabled whenever `updates.length === 0`** and the "Ask safely" button additionally requires `question.trim()`. When the loaded filter returns zero published updates, the input goes read-only — that's the "can't type" symptom.
- Only a single one-shot Q&A round-trip exists (`answerMarketUpdateQuestion`). No conversation history, no streaming, no voice, no follow-ups, no retrieval tuning surfaces.
- Backend `market-updates-qa` already grounds on top-8 retrieved updates via Gemini 3 Flash with tool-forced JSON. Room to lift: hybrid retrieval, better reranking, follow-up context, richer answer schema, streaming.

---

## Phase 1 — Unblock text input + baseline UX fixes (small, immediate)
**Goal:** user can always type a question; clear affordances for empty-state.

- Remove the `disabled={!updates.length}` from the inline Q&A Textarea; keep the Ask button gated only on empty `question.trim()` **and** on "no context available" from the backend (surfaced as an inline notice, not a disabled input).
- Same fix in the per-update `Dialog` Q&A composer.
- Add "Enter to send / Shift+Enter for newline" behaviour to both composers.
- Loading state on the Ask button (spinner, disabled while a request is in-flight) — currently no visible pending state.
- Persist the last N Q&A turns in component state so the panel behaves like a mini-thread instead of replacing the previous answer on each ask.

## Phase 2 — Voice-to-text capture (mirrors existing pattern)
**Goal:** press-and-hold / tap-to-record voice → transcript populates the question field, editable before send.

- Reuse the exact architecture already used in `src/components/finance-portal/VoiceMemoDialog.tsx` and `VoiceMemoButton.tsx`: `navigator.mediaDevices.getUserMedia` → `MediaRecorder` → base64 → server transcription.
- New small edge function `market-updates-voice-transcribe` (thin wrapper around the Lovable AI `openai/gpt-4o-mini-transcribe` endpoint, WAV/webm accepted). JWT-auth only, no persistence — transcript returned directly.
- New component `MarketQAVoiceButton.tsx` mounted next to both Q&A textareas: mic → recording indicator + elapsed timer (30s soft cap) → "Transcribing…" → transcript inserted into the `question` state (append if the user was already typing).
- Graceful denial handling (mic blocked / unsupported browser) with toast, no crash.

## Phase 3 — Retrieval & answer quality lift (backend)
**Goal:** exponentially better answers; less "not enough sourced updates".

- **Hybrid retrieval** in `market-updates-qa`: keep term-hit scoring but layer (a) recency decay, (b) impact-weighting (`impact_level` high > medium > low), (c) segment/geography boosting derived from the question via a cheap classifier call, (d) dedupe by `dedupe_hash`.
- Expand candidate pool 60→200, then rerank to top 12 (up from 8) for more context breadth.
- Add optional **semantic recall**: when term-hit returns <5 matches, fall back to a Lovable AI embedding search over `title + summary + why_it_matters` (store embeddings on `market_updates` via a lightweight background job — Phase 3b if user wants persistence, otherwise ephemeral per-request).
- Upgrade model to `google/gemini-2.5-pro` for the answer step when the question is classified as "analytical/multi-hop"; keep `gemini-3-flash-preview` for simple lookups. Router lives server-side.
- Extend the tool-forced JSON schema to also return: `follow_up_questions[]`, `key_figures[]` (numeric callouts with source id), `time_horizon`, `sentiment` (bearish/neutral/bullish per segment).
- Keep the strict "used_ids ⊆ retrieved context" refusal guard; expand refusal string library so users get *why* it refused (no matches vs. off-topic vs. advice-guardrail).

## Phase 4 — Conversational Q&A (multi-turn + streaming)
**Goal:** feels like a real analyst chat, not a search box.

- Introduce a threaded `MarketQAConversation` component: message list (user/assistant), citations rendered inline as chips, key figures as a small stat strip.
- Persist turns to existing `market_update_questions` with a new `conversation_id` column (nullable-safe migration) so follow-ups reuse prior context.
- Backend accepts `conversation_id` + prior `messages[]`, includes the last 3 assistant answers' `used_ids` as anchor context for the retriever (topic continuity).
- Server-Sent Events streaming of the answer text using `streamText` from the AI SDK; UI renders tokens as they arrive. Refusal/fallback path still uses the deterministic non-streaming branch.
- Suggested follow-ups (from Phase 3 schema) render as one-click chips under each assistant turn.

## Phase 5 — Polish, telemetry & guardrails
- "Explain this answer" affordance: expandable panel showing every retrieved source considered, with hit/used badges — full transparency.
- Copy-to-clipboard + "Share answer" (reuses `SharedQAAnswer` route pattern if that fits).
- Rate-limit + token budget guard through existing Mission Control metering (`generateWithTokens`) so Q&A rolls into the standard credit spine.
- Analytics: log question, retrieved ids, used ids, model, latency, confidence into `market_update_questions` (already partly done) — add a superadmin "Q&A quality" panel to spot low-confidence / refused questions for source-coverage tuning.

---

## Technical touchpoints
- **Frontend:** `src/pages/MarketUpdates.tsx`, new `src/components/market-updates/MarketQAConversation.tsx`, `MarketQAVoiceButton.tsx`, `MarketQAComposer.tsx`, `src/services/marketUpdatesService.ts`.
- **Backend:** `supabase/functions/market-updates-qa/index.ts` (rewrite for hybrid retrieval, streaming, conversation context, richer schema), new `supabase/functions/market-updates-voice-transcribe/index.ts`, optional `market-updates-embed-backfill` cron.
- **DB:** additive migration — `market_update_questions.conversation_id uuid`, optional `market_updates.embedding vector(1536)` if Phase 3 semantic path is enabled.
- **Models:** Gemini 3 Flash (default), Gemini 2.5 Pro (analytical route), `openai/gpt-4o-mini-transcribe` (voice) — all via Lovable AI Gateway, no new secrets.

## Suggested delivery order
Ship Phase 1 + Phase 2 together (small, immediately visible win — input works, voice works). Then Phase 3 (quality jump users will *feel*). Then Phase 4 (conversational shell). Then Phase 5 polish.

Reply "Proceed with Phase 1+2" (or any phase combo) and I'll build it end-to-end.
