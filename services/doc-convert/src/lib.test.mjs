import { test } from 'node:test';
import assert from 'node:assert';
import { extensionFor, isConvertible, safeTempName, validateConvertBody } from './lib.mjs';

test('extensionFor', () => {
  assert.equal(extensionFor('Report.DOCX'), 'docx');
  assert.equal(extensionFor('a/b/deck.pptx'), 'pptx');
  assert.equal(extensionFor('noext'), '');
  assert.equal(extensionFor(''), '');
});

test('isConvertible', () => {
  for (const e of ['docx', 'pptx', 'xlsx', 'odt', 'rtf', 'csv', 'html', 'md', 'txt', 'epub']) assert.equal(isConvertible(e), true, e);
  for (const e of ['exe', 'zip', 'png', 'pdf', '']) assert.equal(isConvertible(e), false, e);
});

test('safeTempName never carries the user name or a bad ext', () => {
  const n = safeTempName('docx');
  assert.match(n, /^in_\d+_[a-z0-9]+\.docx$/);
  assert.match(safeTempName('../../etc/passwd'), /\.bin$/);   // junk ext → bin
  assert.match(safeTempName(''), /\.bin$/);
});

test('validateConvertBody', () => {
  assert.deepEqual(validateConvertBody({ filename: 'a.docx', dataBase64: 'AAA' }), { ok: true, ext: 'docx' });
  assert.equal(validateConvertBody({ filename: 'a.docx' }).ok, false);          // no data
  assert.equal(validateConvertBody({ filename: 'a.exe', dataBase64: 'AAA' }).ok, false); // unsupported
  assert.equal(validateConvertBody({ filename: 'noext', dataBase64: 'AAA' }).ok, false);
  assert.equal(validateConvertBody(null).ok, false);
});
