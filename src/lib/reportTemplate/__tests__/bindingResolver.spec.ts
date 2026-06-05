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
  it('applies currency filter', () => {
    const out = resolveBindable('{{n | currency}}', ctx({ n: 1234 }));
    expect(out).toMatch(/1[,.]?234/);
    expect(out).toMatch(/\$|AUD/);
  });
  it('chains filters', () => {
    expect(resolveBindable('{{n | round | currency}}', ctx({ n: 1234.789 }))).toMatch(/1[,.]?235/);
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

describe('bindingResolver — expressions', () => {
  it('evaluates inline math expressions', () => {
    expect(resolveBindable('{{= 1 + 2 }}', ctx({}))).toBe('3');
  });
  it('expression can reference data', () => {
    expect(resolveBindable('{{= n * 2 }}', ctx({ n: 5 }))).toBe('10');
  });
  it('expression respects safety boundaries', () => {
    // No reference to globals (window/process) should be allowed; returns empty/expression-as-string-ish.
    const result = resolveBindable('{{= globalThis }}', ctx({}));
    expect(result).not.toContain('[object');
  });
});

describe('bindingResolver — numbers', () => {
  it('resolves numbers with fallback', () => {
    expect(resolveBindableNumber('{{n}}', ctx({ n: 42 }), 0)).toBe(42);
    expect(resolveBindableNumber('{{missing}}', ctx({}), 99)).toBe(99);
  });
});
