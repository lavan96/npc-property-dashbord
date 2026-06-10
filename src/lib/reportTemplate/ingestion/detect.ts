/**
 * Pure input classification for the ingestion façade.
 *
 * Reuses the existing file detector (`detectReferenceKind`) so PDF/image routing
 * stays identical to today's "Start from a reference" flow, and adds raw-codebase
 * detection (the new `code` kind) by extension/MIME. No logic is duplicated.
 */
import { detectReferenceKind } from '../referenceImport';
import type { CodeFlavor, CodeTier, IngestionInput, SourceKind } from './types';

const CODE_EXT = /\.(html?|css|jsx?|tsx?|vue|svelte|zip)$/i;
const CODE_MIME = /^(text\/html|text\/css|application\/zip|application\/x-zip-compressed|application\/javascript|text\/(javascript|jsx|tsx))/i;

/** Map a code file's name to its flavor, or null when it isn't a code file. */
export function codeFlavorForFile(name = ''): CodeFlavor | null {
  const m = CODE_EXT.exec(name.toLowerCase());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'htm' || ext === 'html') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'jsx') return 'jsx';
  if (ext === 'ts' || ext === 'tsx') return 'tsx';
  if (ext === 'vue') return 'vue';
  if (ext === 'svelte') return 'svelte';
  if (ext === 'zip') return 'zip';
  return null;
}

/** Which render tier (C1–C4) handles a given code flavor (exhaustive by type). */
const TIER_BY_FLAVOR: Record<CodeFlavor, CodeTier> = {
  html: 'C1-html-css',
  css: 'C1-html-css',
  jsx: 'C3-react-jsx',
  tsx: 'C3-react-jsx',
  vue: 'C3-react-jsx',
  svelte: 'C3-react-jsx',
  zip: 'C4-repo-zip',
};

export function codeTierForFlavor(flavor: CodeFlavor): CodeTier {
  return TIER_BY_FLAVOR[flavor];
}

/** Classify any ingestion input into the source kind that should handle it. */
export function classifyInput(input: IngestionInput): SourceKind | 'unsupported' {
  if (input.kind === 'url') return 'url';
  if (input.kind === 'code') return 'code';

  // File input: prefer the existing PDF/image detector, then fall back to code.
  const ref = detectReferenceKind(input.file);
  if (ref === 'pdf') return 'pdf';
  if (ref === 'image') return 'image';

  const isCode =
    codeFlavorForFile(input.file?.name) !== null ||
    CODE_MIME.test((input.file?.type || '').toLowerCase());
  return isCode ? 'code' : 'unsupported';
}
