/* @vitest-environment jsdom */
/**
 * VisualQualityPageReviewGrid / Card render + interaction (Path-to-100 v2 · C7).
 *
 * Proves the real per-page review surface: one card per page with source /
 * generated / diff imagery (lazy beyond the top of the grid), score + coverage,
 * and per-page actions whose availability follows the pure action policy —
 * raster fallbacks are disabled (with a reason) when a page has no source
 * raster, and a confirm-gated action only fires after confirmation.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisualQualityPageReviewGrid } from './VisualQualityPageReviewGrid';
import { buildPageReviewModels } from '@/lib/reportTemplate/ingestion/visualQuality';
import type { VisualImportQualityReport, VisualPageQualityReport } from '@/lib/reportTemplate/ingestion/visualQuality';
import type { ReportTemplate } from '@/lib/reportTemplate/templateSchema';

function pageReport(n: number, overrides: Partial<VisualPageQualityReport> = {}): VisualPageQualityReport {
  return {
    pageId: `docling-page-${n}`,
    pageNumber: n,
    overallScore: 0.9,
    pixelDifferenceScore: 0.9,
    textCoverageScore: 0.85,
    layoutDriftScore: 0.8,
    missingElementScore: 0.95,
    colorSimilarityScore: 0.92,
    recommendedAction: 'accept',
    warnings: [],
    ...overrides,
  };
}

function report(pages: VisualPageQualityReport[]): VisualImportQualityReport {
  return {
    importId: 'imp-1', templateId: 't-1', overallScore: 0.9, pages,
    repairPassesApplied: 0, finalMode: 'hybrid', manualReviewRequired: false,
    generatedAt: '2026-07-16T00:00:00.000Z',
  };
}

function template(pageCount: number): ReportTemplate {
  return {
    version: 1, tokens: { colors: {}, fonts: {}, spacing: {} },
    pages: Array.from({ length: pageCount }, (_, i) => ({
      id: `docling-page-${i + 1}`, name: `Cover ${i + 1}`,
      size: { width: 595, height: 842 }, background: {}, blocks: [],
    })),
  } as unknown as ReportTemplate;
}

// Page 1 has all three rasters; page 2 has none (no source raster to fall back to).
const SIGNED = {
  '1:source': 'https://x/1-source.png',
  '1:generated': 'https://x/1-generated.png',
  '1:diff': 'https://x/1-diff.png',
};

function collection() {
  return buildPageReviewModels({
    report: report([pageReport(1), pageReport(2, { recommendedAction: 'manual_review' })]),
    signedUrls: SIGNED,
    template: template(2),
  });
}

function cardFor(label: string): HTMLElement {
  return screen.getByText(label).closest('div.flex.flex-col') as HTMLElement;
}

describe('VisualQualityPageReviewGrid', () => {
  it('renders one card per page with the header counts', () => {
    render(<VisualQualityPageReviewGrid collection={collection()} />);
    expect(screen.getByText('Per-page review')).toBeInTheDocument();
    expect(screen.getByText('Cover 1')).toBeInTheDocument();
    expect(screen.getByText('Cover 2')).toBeInTheDocument();
    expect(screen.getByText('2 scored')).toBeInTheDocument();
    // page 2 recommended manual_review → needs review.
    expect(screen.getByText('1 need review')).toBeInTheDocument();
  });

  it('renders per-page source/generated/diff imagery with eager loading at the top', () => {
    render(<VisualQualityPageReviewGrid collection={collection()} />);
    const source = screen.getByAltText('Source raster') as HTMLImageElement;
    expect(source.getAttribute('src')).toBe('https://x/1-source.png');
    expect(source.getAttribute('loading')).toBe('eager');
    // Page 1 has three images; page 2 has none (three ImageOff placeholders).
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('disables raster fallbacks (with a reason) on a page with no source raster', () => {
    render(<VisualQualityPageReviewGrid collection={collection()} onAction={vi.fn()} />);
    const card2 = cardFor('Cover 2');
    const forcePixel = within(card2).getByRole('button', { name: 'Force pixel' });
    expect(forcePixel).toBeDisabled();
    expect(forcePixel.getAttribute('title')).toMatch(/no source raster/i);
  });

  it('fires a non-confirm action immediately', () => {
    const onAction = vi.fn();
    render(<VisualQualityPageReviewGrid collection={collection()} onAction={onAction} />);
    const card1 = cardFor('Cover 1');
    fireEvent.click(within(card1).getByRole('button', { name: 'Accept page' }));
    expect(onAction).toHaveBeenCalledWith('docling-page-1', 'accept');
  });

  it('gates a confirm-required action behind a confirmation dialog', () => {
    const onAction = vi.fn();
    render(<VisualQualityPageReviewGrid collection={collection()} onAction={onAction} />);
    const card1 = cardFor('Cover 1');
    // Force pixel requires confirmation → does not fire immediately.
    fireEvent.click(within(card1).getByRole('button', { name: 'Force pixel' }));
    expect(onAction).not.toHaveBeenCalled();
    // Confirm in the dialog → the action fires.
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Force pixel' }));
    expect(onAction).toHaveBeenCalledWith('docling-page-1', 'force_pixel');
  });

  it('shows a friendly empty state when there are no pages', () => {
    render(<VisualQualityPageReviewGrid collection={buildPageReviewModels({})} />);
    expect(screen.getByText(/No per-page review data/i)).toBeInTheDocument();
  });
});
