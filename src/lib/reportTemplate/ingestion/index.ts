/**
 * Unified ingestion mechanism — public surface (plan WS1).
 *
 * Usage (editor import modal):
 *   import { planIngestion } from '@/lib/reportTemplate/ingestion';
 *   const plan = planIngestion({ kind: 'file', file });
 *   if (!plan?.available) // show the right UI (e.g. code → "render-source pending")
 */
export * from './types';
export { classifyInput, codeFlavorForFile, codeTierForFlavor } from './detect';
export { SOURCES, pdfSource, imageSource, urlSource, codeSource } from './sources';
export { resolveSource, planIngestion, planIngestionOrThrow } from './registry';
