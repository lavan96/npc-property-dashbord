
# Aurixa Agent — UI Polish Plan

Purely presentational refresh of the Aurixa Agent surfaces. **No edge functions, hooks, data shapes, or business logic are touched.** All changes live in `src/components/agent/*` and `src/pages/agent/*` plus a small set of new presentational primitives and CSS tokens under `src/styles/`.

## Design North Star

Aurixa should read as a **calm, intelligent, luxury copilot** — not a generic AI chatbot. The visual language:

- **Aurora-gold on obsidian** — lean into the existing dark-gold token system, but introduce depth through layered gradients, soft aurora glows, and refined glassmorphism (never neon, never purple-on-white AI cliché).
- **Editorial density** — serif display accents for hero moments (agent name, section titles), monospaced micro-labels for metadata, generous whitespace between message groups.
- **Signature "living" mark** — replace the generic `Sparkles` lucide icon used as Aurixa's identity with a bespoke animated brand mark (diamond/aurora orb) that subtly breathes when the agent is thinking. This becomes the agent's face across every surface.
- **Motion with restraint** — one hero interaction per surface (thinking shimmer, insight card reveal, plan step progression). Everything else is 150–200ms ease, respecting `prefers-reduced-motion`.

## Scope (5 surfaces)

1. `AgentChatWidget` — the floating panel + full-view chat
2. `AgentMessageRenderer` — tool cards, citations, approvals
3. `AgentInsights` page — proactive briefings feed
4. `AgentPlans` page — multi-step plan tracker
5. `AgentSkills` + `MemoryManager` pages — marketplace and recall UI

## Phase 1 — Foundation tokens & primitives (no visual change yet)

- Add `--aurixa-*` tokens to `src/styles/tokens.css`: `--aurixa-obsidian`, `--aurixa-aurora-1/2/3`, `--aurixa-glass-bg`, `--aurixa-glass-border`, `--aurixa-glow`, `--aurixa-hairline`. Light and dark variants both derived from existing brand ramp — no hardcoded hex.
- New utility classes in `src/styles/primitives.css`:
  - `.aurixa-glass` (backdrop blur + hairline border + inner highlight)
  - `.aurixa-aurora-bg` (animated conic-gradient, paused by default)
  - `.aurixa-hairline` (1px gradient border)
  - `.aurixa-shimmer-text` (for "Thinking…" state)
- New Tailwind keyframes: `aurora-drift`, `orb-breathe`, `message-rise`, `insight-unfold`.
- New shared components:
  - `src/components/agent/AurixaMark.tsx` — the signature animated agent avatar (SVG orb with layered gradients + slow breathing). Sizes: `xs/sm/md/lg/hero`. State prop: `idle | thinking | speaking | alert`.
  - `src/components/agent/AurixaSectionHeader.tsx` — display-serif title + monospaced eyebrow + optional action slot.
  - `src/components/agent/StatusPill.tsx` — semantic status chip used across insights/plans/skills.

## Phase 2 — Chat widget redesign (`AgentChatWidget.tsx`)

**Launcher (collapsed FAB)**
- Replace the plain circular button with a layered orb: outer aurora glow ring (pulses once every 6s), inner glass disc, `AurixaMark` centered. Unread badge becomes a small gold notch on the ring.
- Hover: ring accelerates, subtle scale 1.03, tooltip "Ask Aurixa" appears with keyboard hint `⌘ K`.

**Panel shell**
- Replace hard-edged panel with `aurixa-glass` surface, 20px radius, hairline border, soft ambient shadow (`shadow-[0_30px_80px_-40px_hsl(var(--brand)/0.35)]`).
- Header row: `AurixaMark` (sm, `thinking` state while streaming) + serif "Aurixa" wordmark + monospaced session id. Right-side actions (new chat, share, close) become icon-only ghost buttons with 8px hit padding and hairline dividers.
- Add a slim aurora bar (1px, animated gradient) directly under the header — becomes the "listening" indicator when the mic is active and the "streaming" indicator during responses.

**Sidebar / conversation list**
- Convert to a slide-in drawer inside the panel with `aurixa-glass` treatment.
- Tab strip (`mine / shared with me / shared by me`) becomes segmented control with animated gold underline that slides between tabs.
- Conversation rows: two-line layout (title + relative time in monospaced micro-caps), left accent bar coloured by ownership (gold=mine, info=shared with me, success=shared by me). Hover reveals inline rename/delete on the right (no menu popover needed for the primary actions).
- Empty state: centred `AurixaMark` + "No conversations yet — start one." + primary CTA.

**Message stream**
- Assistant messages: **no background bubble**, text sits on the glass surface, prefixed by a small `AurixaMark` avatar in the gutter. Streaming text uses `aurixa-shimmer-text` on the trailing token.
- User messages: right-aligned pill with `bg-primary/90` + `text-primary-foreground` (verified contrast pair from tokens). Max width 78%.
- System / tool messages: full-width `aurixa-hairline` card, collapsed by default (per chat-ui contract), with a monospaced eyebrow (`TOOL · agent-planner`) and status pill.
- Group consecutive messages from the same sender; show timestamp only on hover of the group.
- Entrance animation: `message-rise` (10px translate + fade, 180ms) staggered per message.
- Approval prompts (`Check` / `XCircle`) become a dedicated `ApprovalCard`: title, diff-style summary, two prominent buttons (`Approve` gold-filled, `Decline` ghost), with an "Explain this" link that expands a rationale block.

**Composer**
- Wrap textarea + attachments + mic + send in a single `aurixa-glass` block, floating 12px above the panel base with soft shadow.
- Placeholder rotates through 3 contextual prompts every 4s when idle ("Ask about your pipeline…", "Draft a client email…", "Plan tomorrow's briefing…").
- Attachment chips: monochrome pill with file-type glyph, remove icon on hover.
- Voice button: gold when active with an audio-reactive ring (uses existing VoiceToTextButton state).
- Send button: gold gradient fill, disabled state = hairline outline; morphs to a `Square` stop icon when streaming (already supported).
- Keyboard hint row below composer: `⌘⏎ send · ⇧⏎ newline · / commands`.

**Slash-command palette (visual only — no new commands)**
- Typing `/` opens an inline palette above the composer listing existing agent capabilities pulled from current tool metadata. Purely a visual affordance over existing behaviour.

## Phase 3 — Message renderer (`AgentMessageRenderer.tsx`)

- Tool-call cards: replace flat boxes with `aurixa-hairline` cards, monospaced tool name eyebrow, `StatusPill` (queued/running/complete/error), collapsible params (closed by default), and an output area that adapts by tool kind (already handled — only visuals change).
- Markdown: tighten prose styles (`prose-invert prose-sm`), custom code block with dark obsidian bg + gold caret line, inline code as monospaced gold-tinted chip.
- Citations (`MemoryCitations`): render as a horizontal scroll strip of small glass cards with the memory type icon, title, and a hairline "recall confidence" bar. Click opens the existing detail popover.

## Phase 4 — Agent Insights page (`AgentInsights.tsx`)

- Hero header: full-width `aurixa-aurora-bg` band with serif title "Insights from Aurixa", monospaced date, and the refresh CTA as a gold-outlined pill with a spinning aurora ring while running.
- Filter chips row (visual only over existing list): `All · Critical · Warning · Success · Info`, segmented control style.
- Insight cards:
  - `aurixa-glass` surface, left accent bar tinted by severity (destructive/warning/success/info tokens — never brand-coloured, per token contract).
  - Severity icon inside a soft-tinted circle instead of raw lucide.
  - Title in display serif, summary in body font, `body_markdown` collapsed behind "Read briefing" that expands with `insight-unfold` animation.
  - Metadata row: monospaced kind · severity · relative time · "Acted on" badge.
  - Action buttons move to a floating hover bar (ghost icons with tooltips) so idle state stays clean.
- Empty state: centred `AurixaMark hero` + serif "Nothing to brief you on yet." + refresh CTA.

## Phase 5 — Agent Plans page (`AgentPlans.tsx`)

- Two-column layout on desktop, stacked on mobile:
  - Left: plan list as glass cards with a subtle progress ring (existing step counts) around the plan icon.
  - Right: selected plan detail — hero header + vertical timeline of steps.
- Step timeline: gold vertical hairline connecting `StatusPill` nodes (pending/running/awaiting-approval/done/error). Current step gets a soft aurora glow. Approval-gated steps show the `ApprovalCard` inline.
- "Run next step" CTA becomes a fixed footer bar on mobile.

## Phase 6 — Skills marketplace (`AgentSkills.tsx`)

- Replace tab list with segmented control (Available / Installed) matching the chat sidebar treatment.
- Skill cards:
  - Square glyph tile (48px) using the skill's emoji/icon on a tinted aurora background.
  - Serif title + monospaced slug eyebrow.
  - Stat row rendered as three micro-metrics with hairline dividers (installs · runs · success%).
  - Tool badges become small monochrome chips; overflow shown as "+N tools" opening a hover popover.
  - Install CTA: gold gradient; installed state shows a subtle green hairline outline with `Check`.
- Installed tab: switch to a compact list with drag-handle affordance (visual only; no reorder logic yet) and an inline uninstall confirmation instead of instant action.

## Phase 7 — Memory Manager (`MemoryManager.tsx`)

- Group memories by type with a sticky segmented filter.
- Each memory row = glass card, type icon in tinted circle, title in serif, snippet in body, monospaced updated-at.
- Add a subtle "recall heat" hairline bar based on the existing `run_count`/recall stats already returned — read-only visualisation, no query changes.

## Phase 8 — Cross-surface consistency & QA

- Ensure every surface uses `AurixaMark` as identity (kills every `Sparkles` used as brand mark, per chat-ui contract). `Sparkles` stays only as a decorative micro-icon on non-identity moments.
- Verify contrast: user bubble (primary / primary-foreground), assistant text (foreground on glass), all severity pills.
- Verify `prefers-reduced-motion`: aurora, shimmer, orb breathing, and message rise all collapse to instant states.
- Verify mobile: chat widget goes full-screen under 640px, composer sticks to bottom with safe-area padding, insight/plan/skill pages stack cleanly.
- Verify dark + light mode: all new tokens defined in both `:root` and `.dark`.
- Typecheck (`bunx tsgo --noEmit`) after each phase; no runtime code paths changed.

## Deliverable order

1. Phase 1 tokens + primitives + `AurixaMark`
2. Phase 2 chat widget
3. Phase 3 message renderer
4. Phase 4 insights
5. Phase 5 plans
6. Phase 6 skills
7. Phase 7 memory
8. Phase 8 QA sweep + reduced-motion + mobile pass

## Explicit non-goals

- No changes to `invokeSecureFunction` calls, edge functions, RLS, message schemas, tool contracts, streaming logic, storage uploads, or any hook.
- No new routes or permissions.
- No new dependencies (uses existing tailwind, lucide, framer-motion-free CSS animations, shadcn primitives).
- No changes to `Sparkles` where it's used decoratively inside non-Aurixa surfaces.

Approve and I'll start with Phase 1.
