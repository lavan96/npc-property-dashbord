/**
 * Native-PDF-to-Claude reconstruction (plan §7a).
 *
 * Sends the PDF itself to the design agent (which forwards it to Claude as a
 * native `document` block via `claudeReconstruct`), so a scanned/image-only PDF
 * is reconstructed from Claude's reading of the document rather than from sparse
 * deterministic text. The network call is injected (`InvokeFn`) for testability.
 */
import { parseTemplate, type ReportTemplate } from '../templateSchema';
import { validateReconstructedSchema } from '../referenceImport';
import type { InvokeFn } from './codeIngest';

export interface PdfReconstructArgs {
  /** Base64 PDF bytes (no data: prefix). */
  pdfBase64: string;
  schema: ReportTemplate;
  activePageId?: string | null;
  sampleData?: unknown;
  instruction?: string;
}

export interface PdfReconstructResult {
  schema: ReportTemplate;
  pageCount: number;
  modelUsed: string | null;
  warnings: string[];
}

export async function reconstructPdfWithClaude(
  args: PdfReconstructArgs,
  invoke: InvokeFn,
): Promise<PdfReconstructResult> {
  if (!args.pdfBase64) throw new Error('No PDF provided.');
  const instruction = args.instruction
    || 'Read the attached PDF and reconstruct it faithfully as editable native blocks on the active page. Transcribe the text exactly and keep the measured positions — do not redesign.';

  const { data, error } = await invoke('template-design-agent', {
    schema: args.schema,
    messages: [{ role: 'user', content: instruction }],
    instruction,
    activePageId: args.activePageId,
    mode: 'pdf_document',
    pdfBase64: args.pdfBase64,
    sampleData: args.sampleData,
  });
  if (error) throw new Error(error.message || 'Reconstruction failed');
  if (data?.error) throw new Error(String(data.error));

  const validation = validateReconstructedSchema(data?.schema);
  if (!validation.ok) throw new Error(`Reconstruction was not usable: ${validation.errors.join(' ')}`);

  return {
    schema: parseTemplate(data.schema),
    pageCount: validation.pageCount,
    modelUsed: data?.modelUsed ?? null,
    warnings: Array.isArray(data?.warnings) ? data.warnings : [],
  };
}
