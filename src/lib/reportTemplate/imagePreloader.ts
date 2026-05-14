/**
 * Pre-loads remote image URLs referenced by image overlays into base64 data
 * URLs so the synchronous jsPDF renderer can embed them.
 */
import type { ReportTemplate } from './templateSchema';

const cache = new Map<string, string>();

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    cache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Walks every image overlay in the template, fetches each remote `src`, and
 * returns a new template with the `src` replaced by a base64 data URL.
 * Bindings (`{{...}}`) are left untouched and resolved at render time.
 */
export async function preloadImages(template: ReportTemplate): Promise<ReportTemplate> {
  const tasks: Array<Promise<void>> = [];
  const next: ReportTemplate = JSON.parse(JSON.stringify(template));

  for (const page of next.pages) {
    for (const block of page.blocks) {
      for (const overlay of block.overlays) {
        if (overlay.type !== 'image') continue;
        const src = overlay.src;
        if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) continue;
        tasks.push(
          fetchAsDataUrl(src).then((dataUrl) => {
            if (dataUrl) overlay.src = dataUrl;
          }),
        );
      }
    }
  }

  await Promise.all(tasks);
  return next;
}
