/**
 * Phase 9 — dispatcher unit tests.
 *
 * Verifies provider selection by input kind and fallback escalation when the
 * primary fails with a recoverable error.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runImportWithFallback,
  withProviders,
  type ImportProvider,
} from '../providers';
import type { ImportResult } from '../types';

function fakeResult(importId = 'imp-1'): ImportResult {
  return {
    template: { id: 't-1', name: 'Mock' },
    importId,
    pageCount: 1,
    engine: 'docling',
    fidelityReport: {
      semanticPages: 1,
      rasterizedPages: 0,
      textBlocks: 0,
      images: 0,
      vectors: 0,
      fontsEmbedded: 0,
      fontsSubstituted: [],
    },
  };
}

function mockProvider(id: string, behavior: 'ok' | 'timeout' | 'auth'): ImportProvider {
  return {
    id,
    label: id,
    engine: 'docling',
    run: vi.fn(async () => {
      if (behavior === 'ok') return fakeResult(`imp-${id}`);
      if (behavior === 'timeout') throw new Error('request timed out');
      throw new Error('401 unauthorized');
    }),
  };
}

const blankFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'x.pdf', { type: 'application/pdf' });

describe('runImportWithFallback', () => {
  it('returns primary result on success', async () => {
    const primary = mockProvider('p', 'ok');
    const out = await withProviders({ primary, fallbacks: [] }, () =>
      runImportWithFallback(blankFile, { mode: 'hybrid' }),
    );
    expect(out.usedFallback).toBe(false);
    expect(out.attempts).toHaveLength(1);
    expect(out.attempts[0].outcome).toBe('success');
  });

  it('falls through to fallback on recoverable failure', async () => {
    const primary = mockProvider('p', 'timeout');
    const fallback = mockProvider('f', 'ok');
    const out = await withProviders({ primary, fallbacks: [fallback] }, () =>
      runImportWithFallback(blankFile, { mode: 'hybrid' }),
    );
    expect(out.usedFallback).toBe(true);
    expect(out.attempts.map((a) => a.outcome)).toEqual(['failure', 'success']);
    expect(out.attempts[0].error?.kind).toBe('timeout');
  });

  it('stops on non-recoverable failure (auth)', async () => {
    const primary = mockProvider('p', 'auth');
    const fallback = mockProvider('f', 'ok');
    await expect(
      withProviders({ primary, fallbacks: [fallback] }, () =>
        runImportWithFallback(blankFile, { mode: 'hybrid' }),
      ),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('fires onAttempt observer', async () => {
    const primary = mockProvider('p', 'ok');
    const seen: string[] = [];
    await withProviders({ primary, fallbacks: [] }, () =>
      runImportWithFallback(blankFile, {
        mode: 'hybrid',
        onAttempt: (a) => seen.push(`${a.providerId}:${a.outcome}`),
      } as any),
    );
    expect(seen).toEqual(['p:success']);
  });
});
