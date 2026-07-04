/**
 * goldenCorpusConsoleState — Phase 9B.
 *
 * Pure state/validation/request-building helpers for the operator Golden
 * Regression console. Keeping this logic out of the React component makes the
 * console form testable and keeps the UI thin. No I/O here.
 */
import { getGoldenCorpusItem } from './goldenCorpusRegistry';
import type { GoldenRegressionOperatorDecision } from './goldenRegressionTypes';
import type {
  GoldenCorpusOrchestratorRequest,
  GoldenCorpusOrchestratorResult,
  GoldenCorpusOrchestratorStatus,
} from './goldenCorpusOrchestratorTypes';

export type GoldenCorpusConsoleMode = 'evaluate_only' | 'evaluate_and_persist';

export interface GoldenCorpusConsoleFormState {
  corpusId: string;
  importId: string;
  templateId: string;
  runId: string;
  runBatchId: string;
  operatorDecision: GoldenRegressionOperatorDecision;
  notesText: string;
  /** Phase 9C — persist this run into the history ledger when persisting. */
  saveHistory: boolean;
  /** Phase 9C — compare this run against the previous baseline for the corpus. */
  compareBaseline: boolean;
}

export interface GoldenCorpusConsoleValidationIssue {
  field: keyof GoldenCorpusConsoleFormState | 'form';
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface GoldenCorpusConsoleValidationResult {
  ok: boolean;
  issues: GoldenCorpusConsoleValidationIssue[];
}

export const GOLDEN_CORPUS_CONSOLE_OPERATOR_DECISIONS: readonly GoldenRegressionOperatorDecision[] = [
  'not_reviewed',
  'accepted',
  'accepted_with_warnings',
  'rejected',
  'needs_rerun',
];

export function createDefaultGoldenCorpusConsoleFormState(
  overrides?: Partial<GoldenCorpusConsoleFormState>,
): GoldenCorpusConsoleFormState {
  return {
    corpusId: 'golden-simple-001',
    importId: '',
    templateId: '',
    runId: '',
    runBatchId: '',
    operatorDecision: 'not_reviewed',
    notesText: '',
    saveHistory: true,
    compareBaseline: true,
    ...overrides,
  };
}

/** Split notes text by newline; trim, drop blanks, dedupe (order-preserving). */
export function parseGoldenCorpusConsoleNotes(notesText: string): string[] {
  const out: string[] = [];
  for (const raw of String(notesText ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

export function validateGoldenCorpusConsoleForm(
  form: GoldenCorpusConsoleFormState,
  mode: GoldenCorpusConsoleMode,
): GoldenCorpusConsoleValidationResult {
  const issues: GoldenCorpusConsoleValidationIssue[] = [];
  const err = (field: GoldenCorpusConsoleValidationIssue['field'], code: string, message: string) =>
    issues.push({ field, code, message, severity: 'error' });
  const warn = (field: GoldenCorpusConsoleValidationIssue['field'], code: string, message: string) =>
    issues.push({ field, code, message, severity: 'warning' });

  const corpusId = form.corpusId?.trim();
  const importId = form.importId?.trim();

  if (!corpusId) err('corpusId', 'corpus_id_required', 'Corpus ID is required.');
  else if (!getGoldenCorpusItem(corpusId)) err('corpusId', 'corpus_id_unknown', `Unknown corpus ID: ${corpusId}.`);

  if (!importId) err('importId', 'import_id_required', 'Import ID is required.');

  if (!form.operatorDecision) err('operatorDecision', 'operator_decision_required', 'Operator decision is required.');

  if (!form.templateId?.trim()) {
    warn('templateId', 'template_id_missing', 'Template ID not provided; page-count checks may be limited.');
  }

  if (mode === 'evaluate_and_persist') {
    if (form.operatorDecision === 'not_reviewed') {
      warn('operatorDecision', 'operator_not_reviewed', 'Operator decision is still "not reviewed" before persisting.');
    }
    const notes = parseGoldenCorpusConsoleNotes(form.notesText);
    if (notes.length === 0 && (form.operatorDecision === 'rejected' || form.operatorDecision === 'needs_rerun')) {
      warn('notesText', 'notes_recommended', 'Notes are recommended when rejecting or flagging a run for rerun.');
    }
  }

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

export function buildGoldenCorpusOrchestratorRequestFromForm(
  form: GoldenCorpusConsoleFormState,
  mode: GoldenCorpusConsoleMode,
): GoldenCorpusOrchestratorRequest {
  const trimOrNull = (v: string) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  return {
    corpusId: (form.corpusId ?? '').trim(),
    importId: (form.importId ?? '').trim(),
    templateId: trimOrNull(form.templateId),
    runId: trimOrNull(form.runId),
    runBatchId: trimOrNull(form.runBatchId),
    operatorDecision: form.operatorDecision,
    notes: parseGoldenCorpusConsoleNotes(form.notesText),
    persist: mode === 'evaluate_and_persist',
    saveHistory: mode === 'evaluate_and_persist' && form.saveHistory,
    compareBaseline: form.compareBaseline,
  };
}

export function getGoldenCorpusConsoleStatusLabel(
  status: GoldenCorpusOrchestratorStatus | string | null | undefined,
): string {
  switch (status) {
    case 'completed': return 'Completed';
    case 'completed_with_warnings': return 'Completed with warnings';
    case 'failed': return 'Failed';
    case 'blocked': return 'Blocked';
    case 'not_evaluated': return 'Not evaluated';
    default: return 'Not run';
  }
}

export function getGoldenCorpusConsoleStatusTone(
  status: GoldenCorpusOrchestratorStatus | string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default';
    case 'completed_with_warnings': return 'secondary';
    case 'failed': return 'destructive';
    case 'blocked': return 'destructive';
    case 'not_evaluated': return 'outline';
    default: return 'outline';
  }
}

export function getGoldenCorpusConsoleResultHeadline(
  result: GoldenCorpusOrchestratorResult | null,
): string {
  if (!result) return 'No run yet.';
  switch (result.status) {
    case 'completed': return 'Golden regression completed.';
    case 'completed_with_warnings': return 'Golden regression completed with warnings.';
    case 'failed': return 'Golden regression failed.';
    case 'blocked': return 'Golden regression blocked.';
    case 'not_evaluated': return 'Golden regression not evaluated.';
    default: return 'No run yet.';
  }
}
