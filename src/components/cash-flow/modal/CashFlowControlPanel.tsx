import { CashFlowComparisonBar } from './CashFlowComparisonBar';

type CashFlowControlPanelProps = Parameters<typeof CashFlowComparisonBar>[0];

export function CashFlowControlPanel(props: CashFlowControlPanelProps) {
  return <CashFlowComparisonBar {...props} />;
}
