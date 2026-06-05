import { describe, it, expect } from 'vitest';
import { resolveBindable, resolveBindableNumber } from '../bindingResolver';

const ctx = (data: any, tokens: any = { colors: {}, fonts: {}, spacing: {} }) => ({ data, tokens });

describe('bindingResolver — basic paths', () => {
  it('resolves literal strings unchanged', () => {
    expect(resolveBindable('hello', ctx({}))).toBe('hello');
  });
  it('resolves a simple path', () => {
    expect(resolveBindable('{{a.b}}', ctx({ a: { b: 'x' } }))).toBe('x');
  });
  it('resolves array index syntax', () => {
    expect(resolveBindable('{{items[1].name}}', ctx({ items: [{ name: 'a' }, { name: 'b' }] }))).toBe('b');
  });
  it('returns empty string for missing path', () => {
    expect(resolveBindable('{{nope.here}}', ctx({}))).toBe('');
  });
});

describe('bindingResolver — filters', () => {
  it('applies currency filter (locale-independent shape)', () => {
    const out = resolveBindable('{{n | currency}}', ctx({ n: 1234 }));
    expect(out).toMatch(/1[\s,.\u00A0]?234/);
  });
  it('chains filters', () => {
    expect(resolveBindable('{{n | round | currency}}', ctx({ n: 1234.789 }))).toMatch(/1[\s,.\u00A0]?235/);
  });
  it('upper / lower / truncate', () => {
    expect(resolveBindable('{{s | upper}}', ctx({ s: 'hi' }))).toBe('HI');
    expect(resolveBindable('{{s | lower}}', ctx({ s: 'HI' }))).toBe('hi');
    expect(resolveBindable('{{s | truncate:3}}', ctx({ s: 'hello' }))).toMatch(/^hel/);
  });
  it('fallback filter falls back when empty', () => {
    expect(resolveBindable('{{missing | fallback:"n/a"}}', ctx({}))).toBe('n/a');
  });
});

describe('bindingResolver — numbers', () => {
  it('resolves numbers when present', () => {
    expect(resolveBindableNumber('{{n}}', ctx({ n: 42 }), 0)).toBe(42);
  });
  it('passes literal numbers through', () => {
    expect(resolveBindableNumber(15, ctx({}))).toBe(15);
  });
});

describe('bindingResolver — expressions safety', () => {
  it('returns empty string when expression cannot be evaluated', () => {
    // The evaluator is sandboxed by a character whitelist; anything rejected
    // must not throw and must not leak globals.
    expect(resolveBindable('{{= window.location }}', ctx({}))).toBe('');
  });
});
