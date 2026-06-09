/**
 * Feature flag for the Template Builder "V2" Canva-style editor (rehaul Phase 1).
 *
 * V2 behaviour (drag-and-drop, new affordances) is OFF by default — V1 stays the
 * default experience until rollout. The flag can be enabled per-browser
 * (localStorage), per-visit (`?editorV2=1`), or per-build (`VITE_TEMPLATE_EDITOR_V2`).
 *
 * `resolveEditorV2Flag` is a pure function so the precedence is unit-testable;
 * `isTemplateEditorV2Enabled` wires it to the live browser environment.
 */
const STORAGE_KEY = 'template-editor-v2';

export function resolveEditorV2Flag(input: {
  /** e.g. `window.location.search` */
  searchParams?: string;
  /** e.g. `localStorage.getItem(STORAGE_KEY)` */
  storageValue?: string | null;
  /** e.g. `import.meta.env.VITE_TEMPLATE_EDITOR_V2` */
  envValue?: string | boolean | undefined;
}): boolean {
  const { searchParams, storageValue, envValue } = input;

  // URL param wins, so it's easy to flip on/off for a single visit.
  if (searchParams) {
    const p = new URLSearchParams(searchParams).get('editorV2');
    if (p === '1' || p === 'true') return true;
    if (p === '0' || p === 'false') return false;
  }
  // Then a sticky per-browser preference.
  if (storageValue === '1' || storageValue === 'true') return true;
  if (storageValue === '0' || storageValue === 'false') return false;
  // Then the build-time default.
  if (envValue === true || envValue === '1' || envValue === 'true') return true;

  return false; // default OFF — V1 remains the default editor
}

export function isTemplateEditorV2Enabled(): boolean {
  try {
    return resolveEditorV2Flag({
      searchParams: typeof window !== 'undefined' ? window.location.search : '',
      storageValue: typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
      envValue: (import.meta as any)?.env?.VITE_TEMPLATE_EDITOR_V2,
    });
  } catch {
    return false;
  }
}

export function setTemplateEditorV2(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore — flag is a convenience, never critical */
  }
}
