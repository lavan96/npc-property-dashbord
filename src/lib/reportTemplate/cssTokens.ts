/**
 * Token → CSS variables compiler.
 *
 * Compiles `template.tokens.{colors,fonts,spacing}` into a `:root { … }` block
 * so HTML/CSS-rendered templates (WeasyPrint) can reference them as
 * `var(--color-primary)`, `var(--font-heading)`, `var(--space-gutter)`.
 *
 * Color tokens that look like hex are emitted as-is. Font tokens passthrough.
 * Spacing tokens are emitted in px (numeric).
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
  lines.push('}');
  return lines.join('\n');
}
