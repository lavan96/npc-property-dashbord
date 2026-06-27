import { CashFlowMetricsGrid } from './CashFlowMetricsGrid';

type CashFlowKpiStripProps = Parameters<typeof CashFlowMetricsGrid>[0];

export function CashFlowKpiStrip(props: CashFlowKpiStripProps) {
  return <CashFlowMetricsGrid {...props} />;
}
