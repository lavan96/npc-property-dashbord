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

  const IMAGE_PROP_KEYS = ['imageUrl', 'src', 'chartUrl', 'backgroundUrl'];

  for (const page of next.pages) {
    // Page background image
    const bgUrl = page.background?.imageUrl;
    if (typeof bgUrl === 'string' && /^https?:\/\//i.test(bgUrl)) {
      tasks.push(fetchAsDataUrl(bgUrl).then((d) => { if (d) page.background.imageUrl = d; }));
    }
    for (const block of page.blocks) {
      // Block-level image-bearing props
      for (const key of IMAGE_PROP_KEYS) {
        const v = (block.props as any)?.[key];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
          tasks.push(fetchAsDataUrl(v).then((d) => { if (d) (block.props as any)[key] = d; }));
        }
      }
      // Gallery / list-style props with item arrays containing { src }
      const items = (block.props as any)?.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && typeof item.src === 'string' && /^https?:\/\//i.test(item.src)) {
            tasks.push(fetchAsDataUrl(item.src).then((d) => { if (d) item.src = d; }));
          }
        }
      }
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
