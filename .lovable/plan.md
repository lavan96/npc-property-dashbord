# Report Q&A Agent — Phased Enhancement Plan

All 25 brainstormed items, grouped into 5 delivery phases. Functionality first; UI/UX polish layered in later phases. Each item keeps its original number from the brainstorm for traceability.

---

## Phase 1 — Foundations & Trust (must-haves)

Goal: make every answer verifiable, persistent, and recoverable. This unlocks everything else.

1. **#2 Inline citations + deep-linking** — every claim links back to the exact report section/page; clicking jumps the PDF/report viewer to that anchor.
2. **#6 Persistent threads** — store Q&A threads in DB (conversation + messages tables) instead of in-memory; reload on revisit.
3. **#1 Cross-report synthesis & comparison mode** — first-class "compare these N reports" intent, side-by-side answer structure.
4. **#11 Streaming responses with token-level progress** — replace blocking calls with SSE/streaming so long answers feel responsive.
5. **#19 Robust error recovery + auto-retry** — typed errors, exponential backoff, resumable on network drop (mirrors the report-generation retry pattern we just fixed).

Exit criteria: every answer has citations, threads survive refresh, comparisons work, streaming is live, no silent failures.

---

## Phase 2 — Agentic Capabilities (tools & reasoning)

Goal: turn the chatbot into a real agent that can compute, look up live data, and plan multi-step answers.

6. **#3 Calculator tool** — yield, LVR, cash-flow, CGT, depreciation, stamp duty, borrowing capacity — exposed as agent tools reusing existing engines.
7. **#4 Live data tools** — suburb stats, comparable sales, rental yields, vacancy, demographics from existing integrations.
8. **#5 Tool-use transparency** — show which tool ran, inputs, outputs (collapsible), so users can audit the agent's reasoning.
9. **#14 Scenario modeling** — "what if rates rise 1%", "what if rent drops 10%" — agent calls calculator tool with overrides.
10. **#8 Suggested follow-up questions** — generated after each answer, context-aware, one-click.

Exit criteria: agent can answer numeric questions by computing (not hallucinating), pull live data on demand, and surface its work.

---

## Phase 3 — Memory, Scale & Knowledge (RAG + context)

Goal: handle large report sets and long-running client relationships without context-window failures.

11. **#20 RAG over report PDFs** — chunk, embed, store in pgvector; retrieve top-k passages per query instead of stuffing whole reports.
12. **#7 Per-client memory** — agent remembers client goals, risk profile, prior decisions across threads.
13. **#21 Hybrid retrieval** — semantic + keyword + metadata filters (suburb, date, report type).
14. **#22 Context window budgeting** — token accounting, smart truncation, summarization of older turns.
15. **#10 Multi-report selection UX improvements** — search, filters, recently-used, "all reports for client X" presets.

Exit criteria: agent handles 50+ reports per thread, remembers client context across sessions, retrieval is fast and relevant.

---

## Phase 4 — Output & Actions (make answers actionable)

Goal: let users take answers out of the chat and into work product.

16. **#12 Structured outputs** — tables, charts, side-by-side cards rendered inline (not just markdown prose).
17. **#13 Export answers** — to PDF, DOCX, email draft, or pin into a client report as a "Q&A appendix".
18. **#15 Action handoffs** — "create task", "schedule appointment", "draft email to client", "add note to deal" — agent triggers existing app workflows.
19. **#9 Voice input / dictation** — Web Speech API for hands-free questions on mobile.
20. **#16 Shareable answer links** — permalink to a specific answer with full citation context for team review.

Exit criteria: answers become artifacts (exports, tasks, emails), not just chat bubbles.

---

## Phase 5 — Polish, Governance & Quality (UI/UX + safety)

Goal: production-grade UX, auditability, and quality controls.

21. **#17 Answer quality feedback** — thumbs up/down + reason; feeds into eval dataset.
22. **#18 Eval harness** — golden Q&A set, regression tests on prompt/model changes, run in CI.
23. **#23 Prompt & model version tracking** — log which prompt revision and model answered each question; A/B compare.
24. **#24 Branching from any point in the thread** — fork a conversation to explore alternatives without losing the main line.
25. **#25 Pinned answers** — pin important Q&As to the top of a thread for quick reference.

Exit criteria: every answer is rated-and-traceable, prompt changes are safe to ship, power-user navigation is in place.

---

## Sequencing Notes

```text
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
  trust       agent       scale      action       polish
```

- Phases 1–3 are roughly sequential (each builds on the prior).
- Phase 4 items can start in parallel once Phase 2 lands.
- Phase 5 items (especially #17 feedback and #22 evals) should ideally be seeded in Phase 1 so we collect data from day one — full UI can wait.

## Open Decisions (need your input before Phase 1 starts)

- Persistence scope for #6: per-user, per-client, or both?
- Citation granularity for #2: section-level, paragraph-level, or page-level on the PDF?
- Streaming transport for #11: SSE via edge function, or WebSocket?
- RAG store for #20: pgvector in Lovable Cloud (preferred) vs external (Pinecone/Weaviate)?

Approve this phasing (or reshuffle items) and I'll start Phase 1.
