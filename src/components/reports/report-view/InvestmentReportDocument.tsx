import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { InvestmentReport } from './types';

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground border-b pb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-semibold mt-6 mb-3 text-primary">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-medium mt-4 mb-2 text-foreground">{children}</h3>,
  p: ({ children }: any) => <p className="mb-4 leading-relaxed text-foreground">{children}</p>,
  ul: ({ children }: any) => <ul className="mb-4 space-y-2 list-disc list-inside">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-4 space-y-2 list-decimal list-inside">{children}</ol>,
  li: ({ children }: any) => <li className="text-foreground leading-relaxed pl-2">{children}</li>,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-6">
      <table className="min-w-full border-collapse border border-border">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }: any) => <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">{children}</th>,
  td: ({ children }: any) => <td className="border border-border px-4 py-2 text-foreground">{children}</td>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
  blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground">{children}</blockquote>,
  code: ({ children }: any) => <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
};

interface Props {
  report: InvestmentReport;
  includeSources: boolean;
  onDownload: () => void;
}

export function InvestmentReportDocument({ report, includeSources, onDownload }: Props) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="border-b bg-card/80">
        <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Analysis Report</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-6 prose prose-sm max-w-none dark:prose-invert lg:p-8">
          <ErrorBoundary fallback={<div className="rounded-md border border-border bg-muted/40 p-4"><div className="text-sm font-medium text-foreground">Report content couldn't be displayed.</div><div className="mt-1 text-sm text-muted-foreground">You can still download the raw report text.</div><div className="mt-3"><Button variant="outline" size="sm" onClick={onDownload}><Download className="h-3 w-3 mr-1" />Download raw text</Button></div></div>}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.report_content}</ReactMarkdown>
            {includeSources && report.sources_content && <div className="mt-8 border-t pt-6"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.sources_content}</ReactMarkdown></div>}
          </ErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}
