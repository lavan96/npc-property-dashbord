import { describe, it, expect, vi } from 'vitest';
import { reconstructPdfWithClaude } from '../ingestion/pdfDocumentReconstruct';
import type { InvokeFn } from '../ingestion/codeIngest';
import { parseTemplate } from '../templateSchema';

const VALID = {
  version: 1,
  tokens: { colors: {}, fonts: {}, spacing: {} },
  pages: [{
    id: 'p', name: 'P', size: { width: 595, height: 842 }, background: {},
    blocks: [{ id: 'b', type: 'free', props: {}, overlays: [{ id: 't', type: 'text', x: 0, y: 0, width: 100, height: 20, content: 'Hi' }] }],
  }],
};

const schema = parseTemplate({
  version: 1, tokens: { colors: {}, fonts: {}, spacing: {} },
  pages: [{ id: 'p', name: 'P', size: { width: 595, height: 842 }, background: {}, blocks: [] }],
});

const ok = (data: any): InvokeFn => vi.fn().mockResolvedValue({ data, error: null });

describe('reconstructPdfWithClaude', () => {
  it('requires a pdf', async () => {
    await expect(reconstructPdfWithClaude({ pdfBase64: '', schema }, ok({}))).rejects.toThrow(/No PDF/);
  });

  it('invokes the design agent in pdf_document mode and returns the parsed schema', async () => {
    const invoke = ok({ schema: VALID, modelUsed: 'claude-opus-4-8', warnings: ['x'] });
    const res = await reconstructPdfWithClaude({ pdfBase64: 'JVBER', schema, activePageId: 'p' }, invoke);
    expect(invoke).toHaveBeenCalledWith('template-design-agent', expect.objectContaining({
      mode: 'pdf_document', pdfBase64: 'JVBER', activePageId: 'p',
    }));
    expect(res.pageCount).toBe(1);
    expect(res.modelUsed).toBe('claude-opus-4-8');
    expect(res.warnings).toEqual(['x']);
  });

  it('throws on an unusable reconstruction', async () => {
    await expect(reconstructPdfWithClaude({ pdfBase64: 'X', schema }, ok({ schema: { version: 1, pages: [] } })))
      .rejects.toThrow(/not usable|no pages/i);
  });

  it('propagates invoke errors', async () => {
    const invoke: InvokeFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'requires Claude' } });
    await expect(reconstructPdfWithClaude({ pdfBase64: 'X', schema }, invoke)).rejects.toThrow(/requires Claude/);
  });
});
