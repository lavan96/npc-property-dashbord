# Dashboard Theme Foundation

The dashboard theme foundation is built on global CSS variables and Tailwind token classes. Brand and whitelabel overrides flow through tokens such as `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--dashboard-surface`, `--surface-1`, `--topbar-background`, `--sidebar-surface`, and related dashboard variables.

Future redesigns should not copy long one-off Tailwind class strings from page to page. New pages, redesigned page headers, dashboard sections, cards, chart containers, and toolbars should start with `DashboardThemeFrame` and then add only the small amount of local layout styling that is specific to the feature.

Use `DashboardThemeFrame` variants such as:

- `page`
- `hero`
- `section`
- `sectionAccent`
- `card`
- `premiumCard`
- `chartCard`
- `toolbar`

Preserve existing shadcn primitives and compose them inside the dashboard frame instead of replacing their APIs. Preserve whitelabel theme compatibility by avoiding hardcoded colours where tokens already exist. Prefer `hsl(var(--token-name))`, `bg-card`, `text-foreground`, `text-primary`, `border-border`, `bg-background`, `text-muted-foreground`, and the existing dashboard CSS variables.

Always test light mode, dark mode, mobile, desktop, focus states, hover states, forms, charts, and sidebar layout when adopting the shared theme foundation.

## Mandatory implementation planning rule

For every future UI redesign plan in this codebase, include a dedicated step called:

`Global Theme Foundation / Cascading UI Subcomponent`

That step must check whether the UI can use `DashboardThemeFrame` or existing dashboard CSS variables before creating new page-local styling.
