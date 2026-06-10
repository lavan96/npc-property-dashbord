import { test } from 'node:test';
import assert from 'node:assert';
import { isPrivateHost, assertPublicHttpUrl, parseOptions, sanitizeSelectors } from './security.mjs';

test('isPrivateHost blocks local/private/reserved', () => {
  for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '0.0.0.0', '::1', 'svc.internal', 'box.local']) {
    assert.equal(isPrivateHost(h), true, h);
  }
});

test('isPrivateHost allows public', () => {
  for (const h of ['figma.com', 'www.canva.com', 'gamma.app', '8.8.8.8', '1.1.1.1']) {
    assert.equal(isPrivateHost(h), false, h);
  }
});

test('assertPublicHttpUrl rejects non-http and private', () => {
  assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'));
  assert.throws(() => assertPublicHttpUrl('http://localhost:9000'));
  assert.throws(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data'));
  assert.throws(() => assertPublicHttpUrl('not a url'));
  assert.equal(assertPublicHttpUrl('https://www.figma.com/embed?x=1').hostname, 'www.figma.com');
});

test('parseOptions clamps to safe bounds with defaults', () => {
  assert.deepEqual(parseOptions({}), { width: 1280, scale: 2, waitMs: 3000, maxHeight: 12000, selectors: [], maxSegments: 60 });
  assert.deepEqual(parseOptions({ width: 99999, scale: 99, waitMs: -5, maxHeight: 999999, maxSegments: 9999 }),
    { width: 2000, scale: 3, waitMs: 0, maxHeight: 20000, selectors: [], maxSegments: 80 });
  assert.deepEqual(parseOptions({ width: 50, maxHeight: 100 }),
    { width: 320, scale: 2, waitMs: 3000, maxHeight: 600, selectors: [], maxSegments: 60 });
});

test('sanitizeSelectors filters junk and caps count', () => {
  assert.deepEqual(sanitizeSelectors(['.slide', '[data-slide]', '  section  ']), ['.slide', '[data-slide]', 'section']);
  assert.deepEqual(sanitizeSelectors(['<script>', '{bad}', '', 123, null]), []);
  assert.equal(sanitizeSelectors(Array.from({ length: 30 }, (_, i) => `.s${i}`)).length, 12);
  assert.deepEqual(sanitizeSelectors('not-array'), []);
});
