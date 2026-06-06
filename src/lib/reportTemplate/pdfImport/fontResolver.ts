/**
 * Resolve a PDF embedded font's PostScript name to the closest available web font.
 * Returns substituted=true when we fall back to a generic stack so the importer
 * can surface it in the fidelity report.
 */
const MAP: Array<{ test: RegExp; family: string }> = [
  { test: /helvetica|arial|liberation\s*sans|nimbus\s*sans/i, family: 'Helvetica, Arial, sans-serif' },
  { test: /times|tinos|liberation\s*serif|nimbus\s*roman/i, family: '"Times New Roman", Times, serif' },
  { test: /courier|cousine|liberation\s*mono/i, family: '"Courier New", Courier, monospace' },
  { test: /georgia/i, family: 'Georgia, serif' },
  { test: /garamond/i, family: 'Garamond, serif' },
  { test: /verdana/i, family: 'Verdana, sans-serif' },
  { test: /tahoma/i, family: 'Tahoma, sans-serif' },
  { test: /calibri|carlito/i, family: 'Calibri, "Carlito", sans-serif' },
  { test: /cambria|caladea/i, family: 'Cambria, "Caladea", serif' },
  { test: /roboto/i, family: 'Roboto, sans-serif' },
  { test: /open\s*sans/i, family: '"Open Sans", sans-serif' },
  { test: /lato/i, family: 'Lato, sans-serif' },
  { test: /montserrat/i, family: 'Montserrat, sans-serif' },
  { test: /inter/i, family: 'Inter, sans-serif' },
  { test: /playfair/i, family: '"Playfair Display", serif' },
  { test: /poppins/i, family: 'Poppins, sans-serif' },
];

export function resolveFontFamily(psName: string): { family: string; substituted: boolean } {
  const cleaned = psName.replace(/^[A-Z]{6}\+/, ''); // strip subset prefix
  for (const m of MAP) {
    if (m.test.test(cleaned)) return { family: m.family, substituted: false };
  }
  return { family: 'Helvetica, Arial, sans-serif', substituted: true };
}
