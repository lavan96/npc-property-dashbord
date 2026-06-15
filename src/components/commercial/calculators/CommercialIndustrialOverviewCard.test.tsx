/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialIndustrialOverviewCard } from './CommercialIndustrialOverviewCard';
import { getDefaultCommercialIndustrialDealProfile, useCommercialDealState } from '@/utils/commercial/commercialDealState';

const toastSuccess = vi.fn();
const toastError = vi.fn();
const pushBack = vi.fn(async () => ({ ok: true }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: toastSuccess,
    error: toastError,
    message: vi.fn(),
  }),
}));

vi.mock('@/contexts/CalculatorPrefillContext', () => ({
  useCalculatorPrefill: () => ({
    prefill: { propertyId: 'property-1', address: '1 Test Street', domain: 'commercial' },
    property: { id: 'property-1' },
    pushBack,
  }),
}));

describe('CommercialIndustrialOverviewCard report actions placement and actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const profile = getDefaultCommercialIndustrialDealProfile();
    useCommercialDealState.setState({
      profile: {
        ...profile,
        assumptions: {
          missing: {
            fieldKey: 'missing',
            label: 'Missing field',
            confidenceTag: 'Unknown',
            source: 'manual',
            updatedAt: '2026-06-15T00:00:00.000Z',
          } as any,
        },
        aiEstimateMetadata: {
          aiEstimate: {
            fieldKey: 'aiEstimate',
            confidenceTag: 'AI Estimate',
            rationale: 'Test estimate',
          } as any,
        },
      },
    });
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:report'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    HTMLAnchorElement.prototype.click = vi.fn();
    sessionStorage.clear();
  });

  it('renders one Report Actions card directly after the overview summary and before detailed sections', () => {
    const { container } = render(<CommercialIndustrialOverviewCard />);

    expect(screen.getAllByText('Report Actions')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Review Missing Data \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review AI Estimates \(1\)/ })).toBeInTheDocument();

    const overviewTitle = screen.getByText('Commercial / Industrial Assessment Overview');
    const reportActionsTitle = screen.getByText('Report Actions');
    const firstDetailTitle = screen.getByText('Transaction Snapshot');
    const allElements = Array.from(container.querySelectorAll('*'));

    expect(allElements.indexOf(overviewTitle)).toBeLessThan(allElements.indexOf(reportActionsTitle));
    expect(allElements.indexOf(reportActionsTitle)).toBeLessThan(allElements.indexOf(firstDetailTitle));
  });

  it('keeps Report Actions buttons wired to their existing behaviours', async () => {
    render(<CommercialIndustrialOverviewCard />);

    fireEvent.click(screen.getByRole('button', { name: /Generate Client Report/ }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('Client report payload generated'));

    fireEvent.click(screen.getByRole('button', { name: /Review Missing Data \(1\)/ }));
    expect(await screen.findByText('Missing Data & Specialist Review Items')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Close/ }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /Review AI Estimates \(1\)/ }));
    expect(await screen.findByText('AI Estimated Fields')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Back to Property/ }));
    expect(pushBack).toHaveBeenCalledWith(expect.objectContaining({ purchase_price: 3500000, valuation: 3500000 }));

    fireEvent.click(screen.getByRole('button', { name: /Export Summary/ }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /Push to Client Portal/ }));
    expect(sessionStorage.getItem('commercial-portal-pending:property-1')).toContain('transactionSummary');
  });
});
