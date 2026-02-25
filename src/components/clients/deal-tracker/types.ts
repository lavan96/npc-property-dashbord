// Deal Lifecycle Tracker Types

export type DealType = 'existing_property' | 'house_and_land';
export type RiskStatus = 'on_track' | 'needs_follow_up' | 'urgent';
export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'skipped';

export interface Deal {
  id: string;
  client_id: string;
  property_id: string | null;
  deal_type: DealType;
  current_stage: string;
  current_stage_number: number;
  risk_status: RiskStatus;
  responsible_person: string | null;

  // Financial
  total_contract_price: number | null;
  land_price: number | null;
  build_price: number | null;
  loan_amount: number | null;
  valuation_completed: boolean;
  shortfall_required: number | null;
  client_contribution_confirmed: boolean;
  lmi_applied: boolean;
  construction_loan_type: string | null;

  // Dates
  finance_clause_expiry: string | null;
  settlement_date: string | null;
  land_settlement_date: string | null;
  expected_build_start: string | null;
  estimated_completion: string | null;

  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Nested data from get-client-data
  stages?: DealStage[];
  buildPayments?: BuildProgressPayment[];
  invoices?: BuilderInvoice[];
}

export interface DealStage {
  id: string;
  deal_id: string;
  stage_number: number;
  stage_name: string;
  stage_category: string | null;
  status: StageStatus;
  client_action: string | null;
  internal_action: string | null;
  responsible: string | null;
  key_date: string | null;
  completed_at: string | null;
  percentage_or_amount: string | null;
  notes: string | null;
  display_order: number;
  created_at: string;
}

export interface BuildProgressPayment {
  id: string;
  deal_id: string;
  stage_number: number;
  stage_name: string;
  percentage: number;
  amount: number | null;
  builder_invoice_received: boolean;
  builder_invoice_date: string | null;
  submitted_to_lender: boolean;
  submitted_to_lender_date: string | null;
  funds_released: boolean;
  funds_released_date: string | null;
  paid_to_builder: boolean;
  paid_to_builder_date: string | null;
  is_commission_trigger: boolean;
  commission_received: boolean;
  commission_received_date: string | null;
  commission_amount: number | null;
  notes: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BuilderInvoice {
  id: string;
  deal_id: string;
  build_payment_id: string | null;
  client_name: string | null;
  build_stage: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  submitted_to_lender: boolean;
  submitted_date: string | null;
  funds_released: boolean;
  funds_released_date: string | null;
  paid_to_builder: boolean;
  paid_to_builder_date: string | null;
  commission_received: boolean;
  commission_amount: number | null;
  notes: string | null;
  created_at: string;
}

// Stage templates for auto-populating when a deal is created

export const MASTER_LIFECYCLE_STAGES = [
  { stage_number: 1, stage_name: 'Exclusive Client Signed', stage_category: 'Onboarding', responsible: 'Admin', internal_action: 'Upload agreement / CRM entry', client_action: 'Sign agreement' },
  { stage_number: 2, stage_name: 'Strategy Confirmed', stage_category: 'Advisory', responsible: 'Director', internal_action: 'Strategy signed off', client_action: 'Approve strategy' },
  { stage_number: 3, stage_name: 'Property Secured', stage_category: 'Acquisition', responsible: "Buyer's Agent", internal_action: 'Record property type', client_action: 'Confirm property' },
  { stage_number: 4, stage_name: 'Finance in Progress', stage_category: 'Finance', responsible: 'Broker', internal_action: 'Track finance clause date', client_action: 'Submit finance documents' },
  { stage_number: 5, stage_name: 'Settlement Confirmed', stage_category: 'Legal', responsible: 'Solicitor', internal_action: 'Confirm settlement date', client_action: 'Await settlement' },
  { stage_number: 6, stage_name: 'Completed / Settled', stage_category: 'Finalised', responsible: 'Team', internal_action: 'Archive file', client_action: 'Settlement complete' },
];

export const EXISTING_PROPERTY_STAGES = [
  { stage_number: 1, stage_name: 'Initial Holding Deposit (0.25%)', stage_category: 'Deposit', responsible: 'Admin', internal_action: 'Record receipt confirmation', client_action: 'Pay holding deposit', percentage_or_amount: '0.25%' },
  { stage_number: 2, stage_name: 'Contract Review', stage_category: 'Legal', responsible: 'Solicitor', internal_action: 'Ensure solicitor engaged', client_action: 'Sign contract' },
  { stage_number: 3, stage_name: 'Final Deposit', stage_category: 'Deposit', responsible: 'Admin', internal_action: 'Confirm cleared funds', client_action: 'Pay 5% or 10%', percentage_or_amount: '5% / 10%' },
  { stage_number: 4, stage_name: 'Subject to Finance Period', stage_category: 'Finance', responsible: 'Broker', internal_action: 'Track finance clause expiry', client_action: 'Await approval' },
  { stage_number: 5, stage_name: 'Unconditional Finance', stage_category: 'Finance', responsible: 'Broker', internal_action: 'Confirm in writing', client_action: 'Finance approved' },
  { stage_number: 6, stage_name: 'Settlement Confirmed', stage_category: 'Legal', responsible: 'Solicitor', internal_action: 'Confirm date with solicitor', client_action: 'Await settlement' },
  { stage_number: 7, stage_name: 'Settlement Complete', stage_category: 'Finalised', responsible: 'Team', internal_action: 'Close commission tracking', client_action: 'Funds settle', percentage_or_amount: '100%' },
];

export const HOUSE_AND_LAND_STAGES = [
  { stage_number: 1, stage_name: 'Lot Secured', stage_category: 'Land', responsible: 'Admin', internal_action: 'Record lot & estate', client_action: 'Pay $1k–$5k holding deposit' },
  { stage_number: 2, stage_name: 'Contract Review', stage_category: 'Legal', responsible: 'Solicitor', internal_action: 'Send to solicitor', client_action: 'Sign land contract' },
  { stage_number: 3, stage_name: 'Final Deposit', stage_category: 'Deposit', responsible: 'Admin', internal_action: 'Confirm cleared funds', client_action: 'Pay 5% / 10%', percentage_or_amount: '5% / 10%' },
  { stage_number: 4, stage_name: 'Subject to Finance', stage_category: 'Finance', responsible: 'Broker', internal_action: 'Track finance expiry date', client_action: 'Await approval' },
  { stage_number: 5, stage_name: 'Unconditional', stage_category: 'Finance', responsible: 'Broker', internal_action: 'Notify agent', client_action: 'Approval confirmed' },
  { stage_number: 6, stage_name: 'Settlement Date Agreed', stage_category: 'Legal', responsible: 'Conveyancer', internal_action: 'Confirm with vendor solicitor', client_action: 'Await settlement' },
  { stage_number: 7, stage_name: 'Land Settlement', stage_category: 'Settlement', responsible: 'Conveyancer', internal_action: 'Trigger Build Tracker', client_action: 'Completed' },
];

export const BUILD_PAYMENT_STAGES = [
  { stage_number: 1, stage_name: 'Deposit', percentage: 5, is_commission_trigger: false },
  { stage_number: 2, stage_name: 'Slab/Base', percentage: 15, is_commission_trigger: true },
  { stage_number: 3, stage_name: 'Frame', percentage: 20, is_commission_trigger: true },
  { stage_number: 4, stage_name: 'Lock-up', percentage: 25, is_commission_trigger: false },
  { stage_number: 5, stage_name: 'Fixing', percentage: 20, is_commission_trigger: false },
  { stage_number: 6, stage_name: 'Practical Completion', percentage: 15, is_commission_trigger: false },
];

export const RISK_STATUS_CONFIG: Record<RiskStatus, { label: string; color: string; emoji: string }> = {
  on_track: { label: 'On Track', color: 'bg-green-500/10 text-green-700 border-green-500/30', emoji: '🟢' },
  needs_follow_up: { label: 'Needs Follow-Up', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30', emoji: '🟠' },
  urgent: { label: 'Urgent', color: 'bg-red-500/10 text-red-700 border-red-500/30', emoji: '🔴' },
};
