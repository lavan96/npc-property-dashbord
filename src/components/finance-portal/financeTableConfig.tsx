/**
 * Finance Portal table field configuration.
 * Defines the editable fields for each of the 8 sub-tables exposed to finance partners.
 * These mirror the existing client portal forms (see src/components/portal/Portal*Form.tsx)
 * but are streamlined for partner-facing use.
 */

export type TableKey =
  | 'properties' | 'income' | 'expenses' | 'assets'
  | 'liabilities' | 'employment' | 'notes' | 'contacts';

export type FieldType = 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'select' | 'email' | 'tel';

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Hide in the compact list summary (still editable in the form). */
  hideInSummary?: boolean;
  /** Used as the primary headline in card view. */
  primary?: boolean;
  /** Used as the secondary line in card view. */
  secondary?: boolean;
}

const FREQ_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export const TABLE_FIELD_CONFIG: Record<TableKey, FieldConfig[]> = {
  properties: [
    { key: 'address', label: 'Address', type: 'text', required: true, primary: true },
    { key: 'property_type', label: 'Type', type: 'select', secondary: true, options: [
      { value: 'owner_occupied', label: 'Owner Occupied' },
      { value: 'investment', label: 'Investment' },
      { value: 'rental', label: 'Rental' },
      { value: 'holiday', label: 'Holiday Home' },
    ]},
    { key: 'estimated_value', label: 'Estimated Value', type: 'currency' },
    { key: 'purchase_price', label: 'Purchase Price', type: 'currency' },
    { key: 'purchase_date', label: 'Purchase Date', type: 'date' },
    { key: 'current_loan_balance', label: 'Current Loan Balance', type: 'currency' },
    { key: 'rental_income', label: 'Weekly Rental Income', type: 'currency' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInSummary: true },
  ],

  income: [
    { key: 'contact_type', label: 'Contact', type: 'select', primary: true, options: [
      { value: 'primary', label: 'Primary Applicant' },
      { value: 'secondary', label: 'Secondary Applicant' },
    ]},
    { key: 'gross_salary', label: 'Gross Salary', type: 'currency', secondary: true },
    { key: 'salary_frequency', label: 'Frequency', type: 'select', options: FREQ_OPTIONS },
    { key: 'bonus', label: 'Bonus (annual)', type: 'currency' },
    { key: 'commission', label: 'Commission (annual)', type: 'currency' },
    { key: 'allowance', label: 'Allowance (annual)', type: 'currency' },
    { key: 'overtime_essential', label: 'Overtime - Essential (annual)', type: 'currency' },
    { key: 'overtime_non_essential', label: 'Overtime - Non-essential (annual)', type: 'currency' },
    { key: 'other_taxable_income', label: 'Other Taxable Income (annual)', type: 'currency' },
  ],

  expenses: [
    { key: 'expense_category', label: 'Category', type: 'text', required: true, primary: true },
    { key: 'expense_name', label: 'Description', type: 'text', secondary: true },
    { key: 'monthly_amount', label: 'Monthly Amount', type: 'currency', required: true },
    { key: 'frequency', label: 'Original Frequency', type: 'select', options: FREQ_OPTIONS },
    { key: 'is_essential', label: 'Essential', type: 'select', options: YES_NO },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInSummary: true },
  ],

  assets: [
    { key: 'asset_type', label: 'Asset Type', type: 'text', required: true, primary: true },
    { key: 'description', label: 'Description', type: 'text', secondary: true },
    { key: 'value', label: 'Value', type: 'currency' },
    { key: 'institution_name', label: 'Institution', type: 'text' },
    { key: 'make_model', label: 'Make / Model', type: 'text' },
    { key: 'vehicle_type', label: 'Vehicle Type', type: 'text' },
  ],

  liabilities: [
    { key: 'liability_type', label: 'Liability Type', type: 'text', required: true, primary: true },
    { key: 'lender_name', label: 'Lender', type: 'text', secondary: true },
    { key: 'current_balance', label: 'Current Balance', type: 'currency' },
    { key: 'credit_limit', label: 'Credit Limit', type: 'currency' },
    { key: 'monthly_repayment', label: 'Monthly Repayment', type: 'currency' },
    { key: 'interest_rate', label: 'Interest Rate (%)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInSummary: true },
  ],

  employment: [
    { key: 'contact_type', label: 'Contact', type: 'select', primary: true, options: [
      { value: 'primary', label: 'Primary Applicant' },
      { value: 'secondary', label: 'Secondary Applicant' },
    ]},
    { key: 'employer_name', label: 'Employer', type: 'text', secondary: true },
    { key: 'occupation_role', label: 'Role / Occupation', type: 'text' },
    { key: 'employment_type', label: 'Employment Type', type: 'select', options: [
      { value: 'full_time', label: 'Full-time' },
      { value: 'part_time', label: 'Part-time' },
      { value: 'casual', label: 'Casual' },
      { value: 'self_employed', label: 'Self-employed' },
      { value: 'contractor', label: 'Contractor' },
    ]},
    { key: 'gross_annual_salary', label: 'Gross Annual Salary', type: 'currency' },
    { key: 'salary_amount', label: 'Salary Amount', type: 'currency' },
    { key: 'salary_frequency', label: 'Salary Frequency', type: 'select', options: FREQ_OPTIONS },
    { key: 'start_date', label: 'Start Date', type: 'date' },
  ],

  notes: [
    { key: 'title', label: 'Title', type: 'text', required: true, primary: true },
    { key: 'content', label: 'Note', type: 'textarea', required: true, secondary: true },
  ],

  contacts: [
    { key: 'first_name', label: 'First Name', type: 'text', required: true, primary: true },
    { key: 'surname', label: 'Surname', type: 'text', required: true, primary: true },
    { key: 'relationship', label: 'Relationship', type: 'text', secondary: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'mobile', label: 'Mobile', type: 'tel' },
    { key: 'dob', label: 'Date of Birth', type: 'date' },
    { key: 'current_address', label: 'Current Address', type: 'text' },
    { key: 'gender', label: 'Gender', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea', hideInSummary: true },
  ],
};
