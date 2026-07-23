import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
const qa = await Deno.readTextFile(new URL('../index.ts', import.meta.url));
const voice = await Deno.readTextFile(new URL('../../market-updates-voice-transcribe/index.ts', import.meta.url));
Deno.test('Market AI endpoints enforce verified identity before provider access', () => {
  for (const source of [qa, voice]) {
    assertStringIncludes(source, 'verifyHuman');
    assertStringIncludes(source, 'requireModulePermission');
    assertStringIncludes(source, 'consumeRateLimit');
  }
});
Deno.test('Market AI endpoints keep provider failures generic and bound input', () => {
  assertStringIncludes(voice, 'enforceBase64Limit'); assertStringIncludes(voice, 'transcription_unavailable');
  assertStringIncludes(qa, 'enforceJsonBodyLimit'); assertStringIncludes(qa, 'max_tokens: 900');
  assert(!qa.includes('anonymous callers still get an answer'));
  assert(!voice.includes('details: lastDetails'));
});
