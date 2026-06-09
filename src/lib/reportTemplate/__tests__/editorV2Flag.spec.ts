import { describe, it, expect } from 'vitest';
import { resolveEditorV2Flag } from '../editorV2Flag';

describe('resolveEditorV2Flag', () => {
  it('defaults to OFF (V1 stays default)', () => {
    expect(resolveEditorV2Flag({})).toBe(false);
  });

  it('URL param turns it on/off and wins over storage', () => {
    expect(resolveEditorV2Flag({ searchParams: '?editorV2=1' })).toBe(true);
    expect(resolveEditorV2Flag({ searchParams: '?editorV2=true' })).toBe(true);
    expect(resolveEditorV2Flag({ searchParams: '?editorV2=0', storageValue: '1' })).toBe(false);
    expect(resolveEditorV2Flag({ searchParams: '?editorV2=1', storageValue: '0' })).toBe(true);
  });

  it('falls back to the sticky storage preference', () => {
    expect(resolveEditorV2Flag({ storageValue: '1' })).toBe(true);
    expect(resolveEditorV2Flag({ storageValue: '0' })).toBe(false);
    expect(resolveEditorV2Flag({ storageValue: null })).toBe(false);
  });

  it('falls back to the build-time env default', () => {
    expect(resolveEditorV2Flag({ envValue: true })).toBe(true);
    expect(resolveEditorV2Flag({ envValue: '1' })).toBe(true);
    expect(resolveEditorV2Flag({ envValue: 'false' })).toBe(false);
    expect(resolveEditorV2Flag({ envValue: undefined })).toBe(false);
  });

  it('ignores unrelated search params', () => {
    expect(resolveEditorV2Flag({ searchParams: '?foo=bar' })).toBe(false);
  });
});
