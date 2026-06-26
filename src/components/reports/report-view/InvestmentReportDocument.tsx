import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Link, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { InvestmentReport } from './types';

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="mb-6 mt-10 border-b border-border/80 pb-4 text-3xl font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="mb-4 mt-9 flex items-center gap-3 text-2xl font-semibold tracking-tight text-primary">
      <span className="h-6 w-1 rounded-full bg-primary/70" />
      {children}
    </h2>
  ),
  h3: ({ children }: any) => <h3 className="mb-3 mt-7 text-xl font-semibold text-foreground">{children}</h3>,
  p: ({ children }: any) => <p className="mb-5 text-[15px] leading-8 text-foreground/90">{children}</p>,
  ul: ({ children }: any) => <ul className="mb-6 ml-5 space-y-2.5 list-disc marker:text-primary/70">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-6 ml-5 space-y-2.5 list-decimal marker:font-semibold marker:text-primary/80">{children}</ol>,
  li: ({ children }: any) => <li className="pl-2 text-[15px] leading-7 text-foreground/90">{children}</li>,
  table: ({ children }: any) => (
    <div className="my-8 overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-muted/80 text-foreground">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-border/70">{children}</tbody>,
  tr: ({ children }: any) => <tr className="transition-colors even:bg-muted/20 hover:bg-muted/40">{children}</tr>,
  th: ({ children }: any) => <th className="border-r border-border/70 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0">{children}</th>,
  td: ({ children }: any) => <td className="border-r border-border/50 px-4 py-3 align-top leading-6 text-foreground/90 last:border-r-0">{children}</td>,
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
  blockquote: ({ children }: any) => (
    <blockquote className="my-7 rounded-r-xl border-l-4 border-primary bg-primary/5 px-5 py-4 text-[15px] italic leading-7 text-foreground/80 shadow-sm">
      {children}
    </blockquote>
  ),
  code: ({ children }: any) => <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>,
};

interface Props {
  report: InvestmentReport;
  includeSources: boolean;
  onDownload: () => void;
}

export function InvestmentReportDocument({ report, includeSources, onDownload }: Props) {
  return (
    <Card className="overflow-hidden border-primary/10 bg-card shadow-sm">
      <CardHeader className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Analysis Report</CardTitle>
            <p className="mt-1 truncate text-xs text-muted-foreground">Client-facing document view for {report.property_address}</p>
          </div>
          <Button variant="ghost" size="sm" className="hidden shrink-0 sm:inline-flex" onClick={onDownload}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Raw text
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="mx-auto max-w-[960px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:scroll-mt-28 prose-a:text-primary">
            <ErrorBoundary fallback={<div className="rounded-xl border border-border bg-muted/40 p-5"><div className="text-sm font-medium text-foreground">Report content couldn't be displayed.</div><div className="mt-1 text-sm text-muted-foreground">You can still download the raw report text.</div><div className="mt-3"><Button variant="outline" size="sm" onClick={onDownload}><Download className="h-3 w-3 mr-1" />Download raw text</Button></div></div>}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.report_content}</ReactMarkdown>
              {includeSources && report.sources_content && (
                <section className="mt-12 rounded-2xl border border-border bg-muted/20 p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center gap-2 border-b border-border/70 pb-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary"><Link className="h-4 w-4" /></div>
                    <div>
                      <h2 className="m-0 text-lg font-semibold text-foreground">Sources & references</h2>
                      <p className="m-0 text-xs text-muted-foreground">Supporting source material included with this report.</p>
                    </div>
                  </div>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{report.sources_content}</ReactMarkdown>
                </section>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
