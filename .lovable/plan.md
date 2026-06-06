## Template Design Agent — Full Upgrade

### The creative angle: "Design Brief" pipeline

Instead of asking one model to turn a screenshot into block-ops in a single shot (which is why everything except `replace_page` fails today), we split it into three visible stages the user can see, edit, and re-roll:

```text
┌──────────────┐   ┌────────────────┐   ┌─────────────────┐   ┌──────────────┐
│  Reference   │──▶│ 1. Vision      │──▶│ 2. Token Map +  │──▶│ 3. Layout    │
│  image       │   │    Analysis    │   │   Contrast      │   │   Synthesis  │
│              │   │  (GPT-5)       │   │   Guard         │   │  (GPT-5)     │
└──────────────┘   └────────────────┘   └─────────────────┘   └──────────────┘
                          │                                            │
                          ▼                                            ▼
                   Design Brief card                          Side-by-side diff
                   in chat (editable)                         (ref ↔ rendered)
                                                              + "Re-roll layout"
```

Why this works:
- The hard parts (visual perception, palette extraction) are isolated in stage 1.
- Stage 2 is deterministic code — no model gets to invent off-brand colors.
- Stage 3 only has to do *layout*, with a clean brief instead of pixels.
- The brief is reusable: "Re-roll layout" keeps the brief, regenerates page only.

### Stages in detail

**1. Vision Analysis (GPT-5, `openai/gpt-5`)**
- Single tool-call → `DesignBrief` JSON:
  - `palette`: 4–6 hex colors with role labels (`bg`, `surface`, `text`, `accent`, `muted`)
  - `typography`: `{heading: 'serif|sans|display', body: 'sans|serif', vibe: 'editorial|brutalist|minimal|maximalist'}`
  - `layout`: `{grid: '12col', density: 'sparse|balanced|dense', sections: [{type, role, span, notes}]}`
  - `content`: extracted headlines, body copy, label text
  - `motifs`: `['large_hero', 'pill_badges', 'gradient_panel', ...]`
- Rendered in chat as a **Design Brief card** (palette swatches, type sample, section outline). User can tweak palette/vibe before stage 3.

**2. Token Map + Contrast Guard (pure TS, no model)**
- For each brief color, find nearest token in `template.tokens.colors` using ΔE2000 (perceptual distance).
- If user opts into "use exact palette", inject brief colors as ad-hoc tokens (`brief.bg`, etc.) instead.
- **Contrast guard**: for every (fg, bg) pair the layout will use, compute WCAG contrast ratio. If < 4.5, auto-swap fg to nearest token that passes. Log every swap to the chat.

**3. Layout Synthesis (GPT-5)**
- Input: brief + tokens + page size + available block types.
- Tool: `replace_page` only — emits a complete page with blocks bound to **token paths** (`{{tokens.colors.surface}}`), never raw hex.
- Constrained system prompt: "You MUST reference colors via token paths. You MUST use a 12-col grid (60pt gutter). Block coordinates must respect page padding."

**4. Side-by-side diff**
- After ops apply, render the new page to a 600px thumbnail (reuse `renderTemplateToDataUrl` on a 1-page extract).
- Chat bubble shows: `[reference image] ↔ [rendered thumbnail]` with a **Re-roll layout** and **Edit brief** button.

### Other improvements bundled in

- **Default mode change**: when a reference image is attached, default to the brief pipeline (replace page). Text-only edits keep the lightweight ops path.
- **Streaming progress**: show `Analysing image…` → `Mapping palette…` → `Synthesising layout…` in chat as each stage completes.
- **Brief persistence**: store last brief on the template (`metadata.last_design_brief`) so "Re-roll layout" doesn't re-call vision model.
- **Model badge** in agent header: `Vision: GPT-5 · Layout: GPT-5`.

### Technical changes

**Edge function `template-design-agent`**
- New op router: `mode: 'brief' | 'ops' | 'text'`.
- New helpers (`_shared/designBrief.ts`):
  - `analyzeReferenceImage(imageDataUrl) → DesignBrief` (calls `openai/gpt-5` via AI Gateway, tool-call enforced)
  - `mapBriefToTokens(brief, templateTokens) → {tokens, swaps[]}` (ΔE2000 + WCAG)
  - `synthesizePage(brief, tokens, pageSize) → ReplacePageOp` (calls `openai/gpt-5`, token-binding-only system prompt)
- Replace current `tool_choice: 'required'` Gemini call with the staged pipeline when image is present.

**Frontend `TemplateDesignAgentPanel`**
- New `DesignBriefCard` component (palette swatches, typography sample, sections list, "Edit" toggles).
- New `BeforeAfterDiff` component (reference ↔ rendered thumbnail).
- "Re-roll layout" button calls edge fn with `mode: 'brief', stage: 'synthesize_only', brief: cachedBrief`.
- Streamed status pills.

**Utilities (`src/lib/reportTemplate/`)**
- `colorScience.ts` — hex→Lab, ΔE2000, WCAG contrast ratio, `nearestToken`, `ensureContrast`.
- `designBriefTypes.ts` — shared TS types mirrored in edge `_shared`.

### Out of scope (this round)
- Multi-page reference handling (one page per image).
- Persisting the brief into the template schema permanently (kept in transient `metadata`).
- Generating *new* block types from references (still restricted to existing block registry).

### Validation
- Manual: attach a reference image with strong color identity; verify (a) brief appears in chat, (b) all colors in output are token references, (c) contrast log shows no failed pairs, (d) side-by-side diff renders.
- Smoke: text-only "make the heading bigger" still works via the cheap ops path.
