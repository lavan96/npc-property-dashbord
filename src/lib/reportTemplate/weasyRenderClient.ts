/**
 * weasyRenderClient — single client entry point for the `render-template-pdf`
 * edge function (HTML → WeasyPrint → storage URL).
 *
 * The editor previously had two hand-rolled copies of this fetch (live PDF
 * preview + "Render with WeasyPrint" export action); keep them in sync by
 * routing both through here.
 */
import { supabase } from '@/integrations/supabase/client';

export interface WeasyRenderRequest {
  html: string;
  fileName: string;
  templateId?: string;
  mode?: 'preview' | 'production';
}

/** Renders HTML via the WeasyPrint edge function; resolves to the PDF URL. */
export async function renderHtmlToPdfUrl({ html, fileName, templateId, mode = 'preview' }: WeasyRenderRequest): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/render-template-pdf`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ html, fileName, templateId, mode }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.url as string;
}

/** Sanitises a template name into a safe PDF file name. */
export function pdfFileNameFor(name: string, suffix = ''): string {
  return `${(name || 'template').replace(/[^a-z0-9]+/gi, '-')}${suffix}.pdf`;
}
