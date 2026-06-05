/**
 * Token → CSS variables compiler.
 *
 * Compiles `template.tokens.*` into a `:root { … }` block so HTML/CSS-rendered
 * templates (WeasyPrint preview + final PDF) reference them as:
 *   var(--color-primary), var(--font-heading), var(--space-gutter),
 *   var(--radius-md), var(--shadow-card), var(--gradient-hero), var(--text-base)
 *
 * Phase 1 extends the original 3 categories (colors/fonts/spacing) with
 * radii, shadows, gradients, and a numeric type-scale. All emit safely
 * even if absent.
 */
import type { Tokens } from './templateSchema';

function safeKey(k: string): string {
  return k.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function tokensToCssVariables(tokens: Tokens): string {
  const lines: string[] = [':root {'];
  for (const [k, v] of Object.entries(tokens.colors || {})) {
    lines.push(`  --color-${safeKey(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(tokens.fonts || {})) {
    lines.push(`  --font-${safeKey(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(tokens.spacing || {})) {
    lines.push(`  --space-${safeKey(k)}: ${v}px;`);
  }
  for (const [k, v] of Object.entries(tokens.radii || {})) {
    lines.push(`  --radius-${safeKey(k)}: ${v}px;`);
  }
  for (const [k, v] of Object.entries(tokens.shadows || {})) {
    lines.push(`  --shadow-${safeKey(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(tokens.gradients || {})) {
    lines.push(`  --gradient-${safeKey(k)}: ${v};`);
  }
  for (const [k, v] of Object.entries(tokens.typeScale || {})) {
    lines.push(`  --text-${safeKey(k)}: ${v}pt;`);
  }
  lines.push('}');
  return lines.join('\n');
}
