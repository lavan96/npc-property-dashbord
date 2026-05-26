# Finance Portal — Phase 7: Partner Experience Uplift

Goal: turn the Finance Portal from "a place where a broker services NPC-referred clients" into the **daily operating system a finance partner actively wants to log into**. Every item below answers one of three questions: *Does it save the broker time? Does it earn them money? Does it make them look good in front of the client?*

No code changes in this plan — proposal only. Ordered by impact-to-effort.

---

## Current state (recap)

What partners already have today:
- **Dashboard** with KPIs, urgency, settlements, risk register, activity feed
- **Clients** list + **Client Profile** (borrowing snapshot, properties, messages)
- **Purchase Files / Deal Rooms** with critical dates, documents, decisions, conditions, valuations, commission, build progress
- **Messages** (shared + internal NPC notes), **Notifications**, **Earnings**, **Onboarding gate**, OTP login
- **Phase 6 link** to internal Deal Pipeline (read-only counterpart card)

What's missing from a *partner-first* lens:
1. Workflow is **reactive** — broker reacts to NPC. No active inbox/triage of *their* day.
2. Client-side experience is **invisible** to the broker — they can't see what the client sees, can't nudge.
3. No **lender-side intelligence** — every deal is treated identically regardless of lender quirks.
4. No **pipeline forecasting** beyond next 14 days of settlements.
5. Documents are a **checklist**, not a workflow (no parsing, no quality flags, no re-request templates).
6. Mobile experience is functional but not **field-ready** (broker on a site visit, signing app on phone).
7. Zero **personalisation** — same dashboard for a sole broker doing 4 deals/mo and a team partner doing 40.

---

## Pillar A — Daily Cockpit (the "I open this every morning" surface)

### A1. Today view (replaces / augments Dashboard landing)
A single triaged feed combining:
- Files awaiting *my* action (vs. waiting on client / NPC / lender)
- Items breaching SLA in next 24h (finance clause, valuation expiry, doc requests >3 days old)
- Unread shared messages + @mentions in internal notes
- Approvals expiring today/tomorrow (conditional → unconditional countdown)
- Commission milestones hit overnight
Each row is **one-tap actionable**: "Mark done", "Send reminder to client", "Request extension", "Open file".

### A2. Smart inbox separation
Three tabs on top of every list: **Mine / Team / Watching**. Watching = files I'm not assigned to but want to monitor (handover prep, complex deals).

### A3. SLA & ageing badges everywhere
Colour-coded chip on every PF row showing *time since last partner action* — turns the list into a self-policing aging report.

---

## Pillar B — Lender Intelligence Layer

### B1. Lender playbook per file
When a file's lender is set, surface a side panel with:
- This lender's **typical conditional → unconditional turnaround** (computed from historical PFs in the workspace)
- Standard condition templates already on file (today's seeded list) + **lender-specific quirks** (e.g. "ANZ requires re-issued bank statements <30 days at unconditional")
- Document acceptance rules (e.g. "Westpac rejects screenshots of payslips")
- Direct link to the partner's BDM contact for that lender (stored in partner profile)

### B2. Lender comparison widget (per client)
On Client Profile, show a 3-lender comparison ribbon: borrowing capacity, est. rate band, policy fit score, expected turnaround — pulled from existing borrowing engine. One click → "Draft application packet for [Lender]".

### B3. Rate-sheet ingestion (lightweight)
Partner uploads monthly lender rate PDFs → we OCR + extract → store as `lender_rate_snapshots`. Surfaces in comparison widget and on each PF ("Rate moved 0.15% since this file was lodged — consider re-pricing").

---

## Pillar C — Document Workflow 2.0

### C1. Document quality flags
On upload of payslip / bank statement / ID:
- Auto-detect document **type** and **issue date** (existing OCR via OpenAI)
- Flag if **stale** (>30 / >60 / >90 days depending on lender rule)
- Flag if **wrong document** (e.g. uploaded BAS where payslip expected)
- Flag if **page missing** (multi-page detection)
Broker sees ✅ / ⚠️ / ❌ before forwarding to lender.

### C2. Re-request templates
One-click "Re-request this doc" — auto-drafts a message to the client explaining *why* (stale / illegible / wrong type) with the original spec attached. Uses portal messaging, falls back to email.

### C3. Lender-ready packet export
On any PF, "Generate lender packet" → zip with documents in lender-preferred order + a cover sheet (file summary, borrowing snapshot, conditions ledger). Saves 20–40 min per submission.

### C4. Document expiry watchlist
Every dated doc auto-creates a *soft expiry* (payslip+30d, bank statement+30d). Watchlist surfaces what'll expire before settlement.

---

## Pillar D — Client-Side Mirror & Nudge System

### D1. "See what the client sees" preview
A toggle on Client Profile that renders the client portal **exactly as the client sees it right now** (their outstanding tasks, unread messages, doc requests). Broker stops asking "did you get my message?".

### D2. Nudge sequences
Pre-built, broker-edited drip campaigns: "Document chase (3-step)", "Pre-settlement checklist (5-day)", "Refi anniversary". Trigger from the PF; sends via existing portal/email channel. Pauses automatically when client responds.

### D3. Client engagement score
On every client card: last-portal-login, response time, % of doc requests fulfilled. Lets brokers spot ghosting *before* the finance clause expires.

---

## Pillar E — Pipeline Forecasting & Earnings

### E1. Forecast horizon (90 / 180 / 365 days)
Projected commission inflow chart built from:
- Conditional deals × historical conversion rate (per lender)
- Build-stage payments due
- Trail revenue from active loans
Drill-through to PFs feeding each bar.

### E2. Clawback radar
Existing clawback fields → dedicated widget: amount-at-risk by month, days-to-expiry, with one-click *retention play* templates (rate review, top-up offer).

### E3. Goal tracker
Partner sets monthly settlement target → ring on dashboard + variance vs. last 3 months. Optional team-level rollup.

---

## Pillar F — Collaboration & NPC Bridge

### F1. Threaded comments on every PF entity
Conditions, documents, valuations, dates — each gets its own micro-thread (shared OR internal-only). Replaces ambiguous "Notes" field. @mentions trigger notifications.

### F2. NPC handoff card
Standing card on every PF showing: who at NPC owns the buyer side, last NPC activity, drift warnings (already built), one-click "Ping NPC owner" via existing messaging.

### F3. Read receipts on shared messages
Removes the "did the client see this?" loop.

---

## Pillar G — Mobile-First Field Mode

### G1. Compact mobile shell
A dedicated `?mobile=1` route variant that reduces dashboard to: Today list, scan-to-upload doc button, voice-to-text note, settlement countdown widget.

### G2. Scan-to-upload
Phone camera → multi-page capture → auto-deskew/contrast → tag against an open doc request. Critical for brokers visiting clients.

### G3. Voice notes on PFs
30-sec voice clip auto-transcribed (existing Whisper-equivalent) and stored as internal note with audio attachment.

---

## Pillar H — Personalisation & Settings

### H1. Saved views
Brokers save filter + sort + column combos on Clients / PFs lists ("My active conditionals", "Settling this month", "House & Land only").

### H2. Notification routing per partner
Per-partner matrix: which event types → in-app vs. email vs. SMS vs. push, with quiet hours.

### H3. Branding light-touch
Partner uploads logo + accent colour (within dark-gold theme constraints) — appears on lender packet exports and client-facing PDFs. Increases stickiness via white-label feel.

---

## UI/UX optimisations (cross-cutting)

1. **Command palette (⌘K)** — jump to client, PF, condition, message in <2 keystrokes
2. **Keyboard shortcuts** on lists (j/k navigation, e to edit, m to message)
3. **Sticky action bar** on PF detail — Save / Mark complete / Request doc / Send to lender always visible at bottom
4. **Drift / risk chips** consolidated into one legend (today they're scattered)
5. **Skeleton loaders + optimistic UI** on doc upload, condition tick, status change
6. **Empty states with first-action CTAs**, not just illustrations
7. **Density toggle** (Comfortable / Compact) on every table — sole brokers vs. high-volume teams have opposite needs
8. **Dark-gold polish**: replace remaining ad-hoc badges with semantic tokens, normalise card padding to one of 3 scales

---

## Suggested rollout order

| Phase | Pillar(s) | Why first |
|---|---|---|
| 7.1 | A (Today view, smart inbox, SLA) + H1 (saved views) + UI cross-cutting #1, #3 | Immediate daily-use lift, no new data sources |
| 7.2 | C (Documents 2.0) | Biggest time-saver, highest "wow" moment |
| 7.3 | D (Client mirror + nudges) | Cuts chase loops, leverages existing portal infra |
| 7.4 | B (Lender intelligence) | Needs historical-data warm-up; benefits from 7.1 metrics |
| 7.5 | E (Forecasting + clawback) | Earnings narrative — drives retention |
| 7.6 | F (Collab) + G (Mobile) + H2/H3 | Polish + power-user lock-in |

Each phase is independently shippable and would each get its own approval round + memory note before build.

---

## What this plan deliberately excludes

- New backend integrations with lenders (out of scope until B3 proves rate-sheet value)
- Replacing internal Deal Pipeline — partners stay on the Finance Portal side of the Phase 6 link
- Any change to commission calculation logic — read-only surfaces only
- Client-portal changes beyond the "mirror" preview in D1

---

**Next step:** tell me which pillar(s) to take into a detailed Phase 7.1 build plan, or pick a different subset. I'll then come back with schema/edge/UI breakdown for just that slice.
