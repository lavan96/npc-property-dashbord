# Style Consistency & Dynamic White-Label Theming — Implementation Plan

**Status:** Proposed
**Owner:** Platform / UI
**Related:** [`WHITE_LABEL_TOKEN_CONTRACT.md`](./WHITE_LABEL_TOKEN_CONTRACT.md),
[`dashboard-theme-foundation.md`](./dashboard-theme-foundation.md),
[`luxury-light-theme-phase2-token-foundation.md`](./luxury-light-theme-phase2-token-foundation.md)

---

## 1. Objective

Establish a **single, consistent styling system** across the entire dashboard —
light **and** dark mode — so that every surface (readings, cards, tables, modals,
forms, primary/secondary buttons, search, chips, badges) draws from the **same set
of semantic design tokens**. Those tokens must **cascade dynamically** from the
White-Label page: when an admin changes the brand colour, the whole product
re-skins in both themes, with **no hardcoded HEX or `amber/yellow` classes** left
behind.

This document is an audit of the current state plus a phased plan to get there.

---

## 2. Current State — What We Found

The architecture is already correct on paper. The problem is **incomplete adoption**
plus a **monolithic stylesheet** and a **too-narrow White-Label surface**.

### 2.1 The token pipeline exists and works

```
whitelabel_settings (DB)
  └── BrandProvider.mapDatabaseSettings()
       └── resolveBrandTokens(BrandConfig)     → light + dark BrandTokenMap
            └── applyBrandTokenMap()           → writes CSS vars on :root (inline style)
                 └── components consume via Tailwind semantic classes (bg-primary, …)
```

Files: `src/branding/BrandProvider.tsx`, `token-resolver.ts`, `brand-defaults.ts`,
`color-utils.ts`. Tailwind maps every semantic colour to `hsl(var(--token))`
(`tailwind.config.ts`). Defaults live in `src/index.css` `:root` / `.dark`.

**This part is good and should be preserved.**

### 2.2 Root cause of "changing White-Label doesn't cascade"

| Symptom | Cause |
| --- | --- |
| Gold persists in **light** mode after changing brand colour | Light-mode default `--primary` is **purple** (`262 66% 46%`). The gold you see is `--warning` (`43 74% 49%`) **and** hardcoded `amber/yellow` classes — none driven by White-Label. |
| It "sort of" cascades in **dark** mode only | Dark-mode default `--primary` **is** gold (`43 74% 49%`), so re-skinning primary looks like it works — but every hardcoded colour stays gold regardless of theme. |
| Only primary/accent respond | White-Label UI exposes **only** `primaryColor` + `accentColor`. Surfaces, warning/gold, borders, and charts (light) are intentionally protected or not exposed. |

### 2.3 Hardcoding inventory (the real work)

Measured on the current branch:

| Metric | Count |
| --- | --- |
| `amber-*` / `yellow-*` Tailwind class usages (`bg/text/border/ring/from/to/via/fill/stroke`) | **~4,960** |
| Files touching `amber/yellow` classes | **272** |
| Hardcoded 6-digit HEX literals in `.tsx` | **~810** |
| Inline `style={{ color/background … }}` blocks | **~199** |
| `!important` in `index.css` (specificity debt) | **108** |
| `.dark ` scoped overrides scattered in `index.css` | **22** |

**Worst offenders (amber/yellow class count):**
`components/billing/TokenBalanceBanner.tsx` (312), `pages/RemindersHub.tsx` (88),
`pages/Conversations.tsx` (87), `pages/ClientManagement.tsx` (67),
`pages/Checklists.tsx` (51), `pages/CallLogs.tsx` (48),
`components/clients/PortfolioAnalysisReportsList.tsx` (48),
`pages/ReportRequests.tsx` (43), `components/clients/ClientComparison.tsx` (41).

**Known hardcoded gold hexes:** `#D4A017`, `#FFD700`, `#fbbf24`, `#eab308`,
`#ca8a04`, `#c9a227` across reminders, game-plan, call-logs, cash-flow, and PDF
generators.

### 2.4 `src/index.css` is a 5,370-line monolith

One file mixes: the design-system `:root`/`.dark` token blocks, global resets,
markdown styling for Report Q&A, mobile safe-area utilities, density toggles, and
~30 feature-specific `@layer components` blocks (Report Q&A shell, chat bubbles,
"Phase 23 premium polish", etc.). This is unmaintainable and a primary source of
inconsistency — feature CSS lives next to the design system with no boundary.

### 2.5 Typography, sizing & logo inconsistency

- **No typography tokens.** No `--font-*` variables, no `fontFamily` in
  `tailwind.config.ts`, no `@font-face`. Type relies on ad-hoc `text-*` utilities
  per component → inconsistent heading/label/body scales.
- **Logo sizing differs per location** with no shared token:
  `DashboardSidebar` `h-10 max-w-[120px]`, `MobileSidebar` `h-8 max-w-[100px]`,
  `MobileHeader` `h-7 w-7`. This is the "logo is large / inconsistent" complaint.
- **Search UI is fragmented** — multiple independent implementations
  (`SearchableSelect`, `SearchableMultiSelect`, `CommandPalette`, ad-hoc inputs)
  with no shared search-field style token.

---

## 3. Target Architecture

A four-layer system, each with a clear owner and boundary:

```
Layer 1  BRAND INPUTS      whitelabel_settings + WhiteLabel.tsx
                            (primary, accent, + NEW: neutral/surface tint,
                             warning/success/destructive, radius, density)

Layer 2  TOKEN RESOLVER    token-resolver.ts derives full light+dark maps
                            (every semantic token, not just primary/accent)

Layer 3  DESIGN TOKENS     src/styles/tokens.css  (:root + .dark)
                            colour + NEW typography + spacing/radius tokens

Layer 4  SEMANTIC CLASSES  src/styles/components.css  (buttons, cards, tables,
         + PRIMITIVES      modals, forms, search, chips) — token-only, theme-aware
```

Golden rule (already in the token contract, now enforced):
**No component may use a raw palette class (`amber-500`, `#D4A017`, `bg-yellow-100`)
or an inline colour. Everything routes through a semantic token or class.**

---

## 4. Phased Implementation Plan

Each phase is independently shippable and reviewable. Phases 0–3 are foundational
(low risk, high leverage); Phases 4–6 are the bulk migration; Phase 7 locks it in.

### Phase 0 — Guardrails first (½ day)

Ship the enforcement **before** migrating, so the count only goes down.

1. **ESLint rule** — add `eslint-plugin-tailwindcss` (or a custom
   `no-restricted-syntax` rule) that errors on:
   - `className` containing `/(amber|yellow|green|red|blue|slate|gray|zinc)-\d{2,3}/`
   - inline `style` with `color`/`background`/`backgroundColor` literal hex
2. **Stylelint** on `.css` — forbid raw hex outside `tokens.css`
   (`color-no-hex`, scoped allow-list for the token files).
3. **CI check** — a script (`scripts/audit-style-tokens.cjs`) that fails if the
   hardcoded-colour count rises above a ratchet baseline. Ratchet down each PR.

**Exit:** new violations are impossible; baseline recorded.

### Phase 1 — Split the monolith (1 day, mechanical)

Decompose `src/index.css` into a `src/styles/` folder, imported in order:

```
src/styles/
  tokens.css        # :root + .dark — ALL design tokens (colour, type, radius, density)
  base.css          # resets, transitions, body, focus-visible, a11y prefs
  primitives.css    # button/card/table/modal/form/search/chip semantic classes
  markdown.css      # Report Q&A markdown (was inline in index.css)
  utilities.css     # mobile safe-area, scroll, density toggle helpers
  features/*.css    # per-feature polish (report-qa.css, chat.css) — clearly scoped
```

`index.css` becomes a thin manifest of `@import`s. No visual change — pure
extraction, verified by screenshot diff. This makes every later phase legible.

### Phase 2 — Complete the token set (1 day)

Add the tokens the product actually needs so nothing has an excuse to hardcode:

- **Brand-gold as a semantic token.** Introduce `--brand`/`--brand-foreground`
  /`--brand-light` (the intentional gold accent) so "gold" is a *named token*, not
  `amber-500`. Wire it into `token-resolver.ts` for both themes.
- **Typography tokens:** `--font-sans`, `--font-heading`, `--font-mono`, and a type
  scale (`--text-xs … --text-3xl`, `--leading-*`, `--font-weight-*`). Register in
  `tailwind.config.ts` (`fontFamily`, `fontSize`).
- **Sizing tokens:** `--logo-height-sidebar`, `--logo-height-mobile`,
  `--logo-max-width`, `--radius` (exists), `--density-*` (exists).
- Verify every token has a **light and dark** value in `tokens.css`.

### Phase 3 — Widen the White-Label cascade (1–2 days)

Make the White-Label page the true control surface so changes cascade in **both**
themes.

1. **`token-resolver.ts`:** derive the full palette from brand inputs —
   `--warning`/`--brand` from the gold input, surface tints optionally nudged toward
   brand hue, chart palette in light mode too (currently dark-only), borders/rings.
   Keep the "protect legibility" clamps (contrast via `getReadableForeground`).
2. **`brand-types.ts` + DB (`theme_config`):** add optional inputs —
   `brandGold`, `warningColor`, `successColor`, `destructiveColor`, `neutralTint`,
   `radius`, `fontFamily`. Backward compatible (all nullable, fall back to defaults).
3. **`WhiteLabel.tsx`:** add controls for the new inputs with **live light+dark
   preview** side-by-side (the current preview only shows swatches). Extend the
   Supabase `update` payload + the `validate_whitelabel_settings_payload` trigger.
4. **Bump `theme_version`** and document in the token contract.

**Exit:** changing the brand colour visibly re-skins primary, accent, gold/warning,
charts, and focus rings in *both* light and dark preview.

### Phase 4 — Migrate shared primitives (2–3 days)

Migrate the reusable building blocks first — highest fan-out, one change fixes many
screens. For each: replace palette classes with token classes and add both-theme
coverage.

- **Buttons** — `src/components/ui/button.tsx`: audit every `variant`
  (default/primary, secondary, outline, ghost, destructive, link) uses only
  `bg-primary`, `bg-secondary`, `bg-destructive`, `text-*-foreground`,
  `hover:bg-*-hover`. Add a `brand`/`gold` variant backed by `--brand`.
- **Cards** — `card.tsx`: `bg-card text-card-foreground border-border`, elevation via
  `--surface-*`.
- **Tables** — `table.tsx` + shared data-table: header `bg-muted`, row hover
  `bg-muted/50`, borders `border-border`; kill zebra hexes.
- **Modals/Dialogs/Sheets/Popovers** — `bg-popover`/`bg-card`, `border-border`,
  overlay via token opacity.
- **Forms** — inputs, selects, textareas, checkboxes, radios, switches, labels:
  `bg-background`, `border-input`, `ring-ring`, `text-foreground`,
  `placeholder:text-muted-foreground`.
- **Search** — introduce one `.field-search` primitive; refactor
  `SearchableSelect`/`SearchableMultiSelect`/`CommandPalette` and ad-hoc search
  inputs onto it (icon, sizing, focus ring, dark-mode).
- **Badges/Chips/Status** — route all through the existing
  `dashboard-status-chip*` classes (success/warning/destructive/info/accent/neutral).
- **Logo** — one `<BrandLogo>` component reading the new size tokens; replace the
  three divergent sidebar/mobile sizings. Fixes "logo too large".

### Phase 5 — Migrate feature pages/components (bulk, staged)

Work the offender list from §2.3, biggest first. Use a **semi-automated codemod**
plus human review — never blind find/replace, because many `amber/yellow` usages are
*semantic warnings* (→ `warning`/`brand` tokens) while some are decorative.

Mapping convention:

| Hardcoded | → Token/class |
| --- | --- |
| `bg-amber-*`, `text-yellow-*` (warning meaning) | `warning` / `dashboard-status-chip-warning` |
| gold accent / brand highlight | `brand` / `dashboard-chip-accent` |
| `green-*` | `success` |
| `red-*` | `destructive` |
| `blue-*` | `info` / `primary` |
| `slate/gray/zinc-*` | `muted` / `border` / surfaces |
| `#D4A017 #FFD700 #fbbf24 #eab308 #c9a227` | `hsl(var(--brand))` / `hsl(var(--warning))` |

Suggested batch order (ratcheting the CI baseline down each PR):
`TokenBalanceBanner` → `RemindersHub` + reminders/* → `Conversations`/`Messages` →
`ClientManagement`/clients/* → `Checklists`/`ReportRequests`/`Agreements` →
`CallLogs`/call-logs/* → `gameplan/*` → `reports/*` (Cash Flow modal) → remainder.

**Note on PDF/report generators** (`htmlRenderer.ts`, `_shared.html.ts`,
`VownetPDFGenerator`, `PortfolioAnalysisPDFGenerator`): these render to static
HTML/PDF and **cannot read runtime CSS vars**. Give them a shared
`brandPalette.ts` resolved from the same brand config at generation time — one
constants module, not scattered hexes.

### Phase 6 — Typography & spacing pass (1 day)

With type tokens in place (Phase 2), sweep components onto the type scale
(`text-heading-lg`, `text-body`, etc. or the registered Tailwind sizes) so headings,
labels, table text, and form text are consistent across pages.

### Phase 7 — Verification & lock-in (1 day)

- **Visual regression:** Playwright screenshots of key screens (dashboard, a table
  page, a form/modal, reports) in **light + dark**, before/after each phase.
- **Cascade test:** automated test that sets a non-gold brand colour and asserts
  computed styles of primary button / chart / focus ring change in both themes.
- **A11y:** contrast check on resolved tokens (extend `branding/accessibility.ts`).
- **Ratchet to zero:** CI baseline for hardcoded colours reaches 0 (allow-list only
  the token files + PDF palette module).
- Update `WHITE_LABEL_TOKEN_CONTRACT.md` with the new tokens and White-Label inputs.

---

## 5. Effort & Sequencing Summary

| Phase | Scope | Risk | Est. |
| --- | --- | --- | --- |
| 0 Guardrails | lint/stylelint/CI ratchet | low | ½ d |
| 1 Split `index.css` | mechanical extraction | low | 1 d |
| 2 Complete tokens | brand/type/size tokens | low | 1 d |
| 3 Widen cascade | resolver + WhiteLabel UI + DB | med | 1–2 d |
| 4 Primitives | buttons/cards/tables/modals/forms/search/logo | med | 2–3 d |
| 5 Feature migration | ~4,960 classes + ~810 hexes, staged | med (volume) | 5–8 d |
| 6 Typography pass | type scale adoption | low | 1 d |
| 7 Verify & lock | visual regression + cascade tests | low | 1 d |

Phases 0–4 deliver the "constant style system + cascade" the request centres on;
Phase 5 is the long tail that can land incrementally behind the ratchet without
blocking.

## 6. Guiding Principles

1. **Preserve the working pipeline** — extend `token-resolver`, don't rebuild it.
2. **Tokens are the only colour source** — enforced by lint, not convention.
3. **Every token is dual-theme** — no token ships without a light and a dark value.
4. **Migrate primitives before pages** — maximum leverage, minimum churn.
5. **Automate detection, review changes by hand** — semantic vs decorative colour is
   a judgement call.
6. **Ratchet, never regress** — the hardcoded-colour count only goes down.
