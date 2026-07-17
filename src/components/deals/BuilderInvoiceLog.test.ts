import { describe, expect, it } from 'vitest';
import { buildBuilderInvoiceProjectRows, getSelectedStage } from './BuilderInvoiceLog';
import type { DealWithClient } from '@/hooks/useAllDeals';

const payment = (id: string, stageName: string, stageNumber: number, overrides = {}) => ({
  id,
  stage_name: stageName,
  stage_number: stageNumber,
  display_order: stageNumber,
  percentage: stageNumber === 1 ? 5 : 15,
  amount: 500,
  builder_invoice_received: false,
  builder_invoice_date: null,
  submitted_to_lender: false,
  submitted_to_lender_date: null,
  funds_released: false,
  funds_released_date: null,
  paid_to_builder: false,
  paid_to_builder_date: null,
  commission_received: false,
  ...overrides,
});

const deal = (overrides: Partial<DealWithClient> = {}) => ({
  id: 'deal-1',
  client_id: 'client-1',
  client_name: 'Client One',
  property_address: '1 Project Street',
  build_price: 100_000,
  builder_invoice_current_payment_id: null,
  buildPayments: [payment('deposit', 'Deposit', 1), payment('slab', 'Slab/Base', 2)],
  ...overrides,
} as DealWithClient);

describe('Builder Invoice Log project rows', () => {
  it('creates one row per deal while retaining every stage record', () => {
    const rows = buildBuilderInvoiceProjectRows([deal()]);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowKey).toBe('deal-1');
    expect(rows[0].stages.map((stage) => stage.stageName)).toEqual(['Deposit', 'Slab/Base']);
  });

  it('keeps separate projects for the same client and uses the build price for stage amounts', () => {
    const rows = buildBuilderInvoiceProjectRows([
      deal(),
      deal({ id: 'deal-2', property_address: '2 Project Street', build_price: 200_000 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.rowKey)).toEqual(['deal-1', 'deal-2']);
    expect(rows[1].stages[1].amount).toBe(30_000);
  });

  it('selects the persisted stage and falls back to the latest stage with progress', () => {
    const persisted = buildBuilderInvoiceProjectRows([
      deal({ builder_invoice_current_payment_id: 'deposit' }),
    ])[0];
    expect(getSelectedStage(persisted)?.paymentId).toBe('deposit');

    const inferred = buildBuilderInvoiceProjectRows([
      deal({ buildPayments: [
        payment('deposit', 'Deposit', 1, { builder_invoice_received: true }),
        payment('slab', 'Slab/Base', 2, { funds_released: true }),
        payment('frame', 'Frame', 3),
      ] }),
    ])[0];
    expect(getSelectedStage(inferred)?.paymentId).toBe('slab');
  });

  it('uses an immediate local selection ahead of the persisted value', () => {
    const row = buildBuilderInvoiceProjectRows([
      deal({ builder_invoice_current_payment_id: 'deposit' }),
    ])[0];

    expect(getSelectedStage(row, 'slab')?.stageName).toBe('Slab/Base');
  });
});
