import { collectTemplateIssues, type TemplateIssue } from '@/lib/reportTemplate/bindingValidation';
import { lintTemplate, type LintIssue } from '@/lib/reportTemplate/lintTemplate';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';

interface AnalysisRequest {
  requestId: number;
  template: ReportTemplate;
  sampleData: Record<string, any>;
}

interface AnalysisSuccess {
  requestId: number;
  ok: true;
  bindingIssues: TemplateIssue[];
  lintIssues: LintIssue[];
}

interface AnalysisFailure {
  requestId: number;
  ok: false;
  error: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (message: AnalysisSuccess | AnalysisFailure) => void;
};

workerScope.onmessage = (event) => {
  const { requestId, template, sampleData } = event.data;

  try {
    workerScope.postMessage({
      requestId,
      ok: true,
      bindingIssues: collectTemplateIssues(template),
      lintIssues: lintTemplate(template, sampleData),
    });
  } catch (error) {
    workerScope.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
