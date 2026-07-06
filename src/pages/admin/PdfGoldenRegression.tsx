/**
 * PdfGoldenRegression — Phase 9B admin page.
 * Thin wrapper around GoldenRegressionRunConsole; prefills from URL query params.
 */
import { useSearchParams } from 'react-router-dom';
import { GoldenRegressionRunConsole } from '@/components/admin/pdfImport/GoldenRegressionRunConsole';

export default function PdfGoldenRegression() {
  const [params] = useSearchParams();
  const corpusId = params.get('corpusId');
  const importId = params.get('importId');
  const templateId = params.get('templateId');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PDF Golden Regression</h1>
        <p className="text-sm text-muted-foreground">
          Run golden corpus evaluation and persistence for existing PDF imports.
        </p>
      </div>
      <GoldenRegressionRunConsole
        initialCorpusId={corpusId}
        initialImportId={importId}
        initialTemplateId={templateId}
      />
    </div>
  );
}
