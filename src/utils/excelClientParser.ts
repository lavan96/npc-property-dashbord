import * as XLSX from 'xlsx';

// Types for parsed client data
export interface ParsedContact {
  firstName: string | null;
  middleName: string | null;
  surname: string | null;
  mobile: string | null;
  email: string | null;
  gender: string | null;
  dob: string | null;
}

export interface ParsedAddress {
  currentAddress: string | null;
  country: string | null;
  livingSituation: string | null;
}

export interface ParsedFamilyRelations {
  maritalStatus: string | null;
  dependentsCount: number;
}

export interface ParsedEmployment {
  contactType: 'primary' | 'secondary';
  employerName: string | null;
  employmentType: string | null;
  occupationRole: string | null;
  startDate: string | null;
}

export interface ParsedIncome {
  contactType: 'primary' | 'secondary';
  grossSalary: number;
  salaryFrequency: string;
  bonus: number;
  allowance: number;
  commission: number;
  overtimeEssential: number;
  overtimeNonEssential: number;
  otherTaxableIncome: number;
}

export interface ParsedProperty {
  propertyType: 'owner_occupied' | 'investment';
  address: string | null;
  value: number;
  loanRemaining: number;
  interestRate: number;
  ownershipPercentage: number;
  monthlyInterestRepayment: number;
  monthlyBodyCorporate: number;
  monthlyCouncilRates: number;
  monthlyWaterRates: number;
  monthlyRepairsMaintenance: number;
  monthlyPropertyManagement: number;
  monthlyLandlordInsurance: number;
  monthlyBuildingInsurance: number;
  monthlyRentalIncome: number;
  weeklyRentalIncome: number;
  totalMonthlyExpenditure: number;
  netMonthlyCashflow: number;
}

export interface ParsedAsset {
  assetType: 'vehicle' | 'savings' | 'superfund' | 'other';
  vehicleType?: string;
  makeModel?: string;
  institutionName?: string;
  description?: string;
  value: number;
}

export interface ParsedLiability {
  liabilityType: 'mortgage' | 'credit_card' | 'personal_loan' | 'vehicle_loan' | 'student_loan' | 'other';
  providerName?: string;
  currentBalance: number;
  creditLimit?: number;
  interestRate?: number;
  monthlyRepayment: number;
  repaymentType?: string;
}

export interface ParsedPortfolioSummary {
  totalPortfolioValue: number;
  totalDebt: number;
  totalMonthlyExpenditure: number;
  totalMonthlyIncome: number;
  totalMonthlyRentalIncome: number;
  netMonthlyCashFlow: number;
}

export interface ParsedClient {
  primaryContact: ParsedContact;
  secondaryContact?: ParsedContact;
  address?: ParsedAddress;
  residentialStatus?: string;
  familyRelations?: ParsedFamilyRelations;
  employment?: ParsedEmployment[];
  income?: ParsedIncome[];
  properties?: ParsedProperty[];
  assets?: ParsedAsset[];
  liabilities?: ParsedLiability[];
  portfolioSummary?: ParsedPortfolioSummary;
}

// Helper to safely get cell value
function getCellValue(sheet: XLSX.WorkSheet, cellRef: string): any {
  const cell = sheet[cellRef];
  return cell ? cell.v : null;
}

// Helper to parse currency values
function parseCurrency(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols, commas, and spaces
    const cleaned = value.replace(/[$,\s]/g, '').replace(/[()]/g, '-');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to parse percentage values
function parsePercentage(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    // If already a decimal (0.059 for 5.9%), convert to percentage
    return value < 1 ? value * 100 : value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[%\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to find row by label in column A
function findRowByLabel(sheet: XLSX.WorkSheet, label: string, startRow: number = 1, endRow: number = 200): number | null {
  for (let row = startRow; row <= endRow; row++) {
    const cellValue = getCellValue(sheet, `A${row}`);
    if (cellValue && typeof cellValue === 'string' && cellValue.toLowerCase().includes(label.toLowerCase())) {
      return row;
    }
  }
  return null;
}

// Helper to find column by header
function findColumnByHeader(sheet: XLSX.WorkSheet, header: string, row: number = 1): string | null {
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  for (const col of cols) {
    const cellValue = getCellValue(sheet, `${col}${row}`);
    if (cellValue && typeof cellValue === 'string' && cellValue.toLowerCase().includes(header.toLowerCase())) {
      return col;
    }
  }
  return null;
}

// Parse a single sheet into a client
function parseSheetToClient(sheet: XLSX.WorkSheet): ParsedClient | null {
  try {
    // Find key sections by looking for labels
    const primaryContactRow = findRowByLabel(sheet, 'Primary Contact') || findRowByLabel(sheet, 'First name');
    
    if (!primaryContactRow) {
      return null; // No valid client data found
    }

    // Parse primary contact
    const primaryContact: ParsedContact = {
      firstName: getCellValue(sheet, `B${primaryContactRow + 1}`) || getCellValue(sheet, `B9`),
      middleName: getCellValue(sheet, `B${primaryContactRow + 2}`) || getCellValue(sheet, `B10`),
      surname: getCellValue(sheet, `B${primaryContactRow + 3}`) || getCellValue(sheet, `B11`),
      mobile: getCellValue(sheet, `B${primaryContactRow + 4}`) || getCellValue(sheet, `B12`),
      email: getCellValue(sheet, `B${primaryContactRow + 5}`) || getCellValue(sheet, `B13`),
      gender: getCellValue(sheet, `B${primaryContactRow + 6}`) || getCellValue(sheet, `B14`),
      dob: null // Would need date parsing
    };

    // If no first name found in expected location, search more broadly
    if (!primaryContact.firstName) {
      // Try to find name in column B near "First name" label
      for (let row = 5; row <= 20; row++) {
        const labelCell = getCellValue(sheet, `A${row}`);
        if (labelCell && typeof labelCell === 'string' && labelCell.toLowerCase().includes('first name')) {
          primaryContact.firstName = getCellValue(sheet, `B${row}`);
          primaryContact.middleName = getCellValue(sheet, `B${row + 1}`);
          primaryContact.surname = getCellValue(sheet, `B${row + 2}`);
          break;
        }
      }
    }

    // Parse secondary contact
    const secondaryRow = findRowByLabel(sheet, 'Secondary Contact');
    let secondaryContact: ParsedContact | undefined;
    
    if (secondaryRow) {
      const secFirstName = getCellValue(sheet, `B${secondaryRow + 1}`);
      if (secFirstName) {
        secondaryContact = {
          firstName: secFirstName,
          middleName: getCellValue(sheet, `B${secondaryRow + 2}`),
          surname: getCellValue(sheet, `B${secondaryRow + 3}`),
          mobile: getCellValue(sheet, `B${secondaryRow + 4}`),
          email: getCellValue(sheet, `B${secondaryRow + 5}`),
          gender: getCellValue(sheet, `B${secondaryRow + 6}`),
          dob: null
        };
      }
    }

    // Parse properties - look for "Property (Owner Occupied)" and "Investment Property"
    const properties: ParsedProperty[] = [];

    // Owner Occupied Property - typically in column E/F
    const ownerOccupiedRow = findRowByLabel(sheet, 'Owner Occupied');
    if (ownerOccupiedRow) {
      const value = parseCurrency(getCellValue(sheet, `F${ownerOccupiedRow + 2}`) || getCellValue(sheet, `F10`));
      const loanRemaining = parseCurrency(getCellValue(sheet, `F${ownerOccupiedRow + 3}`) || getCellValue(sheet, `F11`));
      
      if (value > 0 || loanRemaining > 0) {
        properties.push({
          propertyType: 'owner_occupied',
          address: getCellValue(sheet, `F${ownerOccupiedRow + 1}`) || getCellValue(sheet, `F9`),
          value,
          loanRemaining,
          interestRate: parsePercentage(getCellValue(sheet, `F${ownerOccupiedRow + 4}`) || getCellValue(sheet, `F12`)),
          ownershipPercentage: parsePercentage(getCellValue(sheet, `F${ownerOccupiedRow + 5}`) || getCellValue(sheet, `F13`)) || 100,
          monthlyInterestRepayment: parseCurrency(getCellValue(sheet, `F${ownerOccupiedRow + 6}`) || getCellValue(sheet, `F14`)),
          monthlyBodyCorporate: 0,
          monthlyCouncilRates: 0,
          monthlyWaterRates: 0,
          monthlyRepairsMaintenance: 0,
          monthlyPropertyManagement: 0,
          monthlyLandlordInsurance: 0,
          monthlyBuildingInsurance: 0,
          monthlyRentalIncome: 0,
          weeklyRentalIncome: 0,
          totalMonthlyExpenditure: 0,
          netMonthlyCashflow: 0
        });
      }
    }

    // Investment Properties - search for "Investment Property 1", "Investment Property 2", etc.
    for (let propNum = 1; propNum <= 5; propNum++) {
      const invPropRow = findRowByLabel(sheet, `Investment Property ${propNum}`);
      if (invPropRow) {
        const value = parseCurrency(getCellValue(sheet, `F${invPropRow + 2}`));
        const loanRemaining = parseCurrency(getCellValue(sheet, `F${invPropRow + 3}`));
        const monthlyRental = parseCurrency(getCellValue(sheet, `F${invPropRow + 16}`)); // Monthly Rental Income row
        
        if (value > 0 || monthlyRental > 0) {
          const monthlyBodyCorp = parseCurrency(getCellValue(sheet, `F${invPropRow + 7}`));
          const monthlyCouncil = parseCurrency(getCellValue(sheet, `F${invPropRow + 8}`));
          const monthlyWater = parseCurrency(getCellValue(sheet, `F${invPropRow + 9}`));
          const monthlyRepairs = parseCurrency(getCellValue(sheet, `F${invPropRow + 10}`));
          const monthlyPM = parseCurrency(getCellValue(sheet, `F${invPropRow + 11}`));
          const monthlyLandlord = parseCurrency(getCellValue(sheet, `F${invPropRow + 12}`));
          const monthlyBuilding = parseCurrency(getCellValue(sheet, `F${invPropRow + 13}`));
          const totalExpenditure = parseCurrency(getCellValue(sheet, `F${invPropRow + 14}`));
          
          properties.push({
            propertyType: 'investment',
            address: getCellValue(sheet, `F${invPropRow + 1}`),
            value,
            loanRemaining,
            interestRate: parsePercentage(getCellValue(sheet, `F${invPropRow + 4}`)),
            ownershipPercentage: parsePercentage(getCellValue(sheet, `F${invPropRow + 5}`)) || 100,
            monthlyInterestRepayment: parseCurrency(getCellValue(sheet, `F${invPropRow + 6}`)),
            monthlyBodyCorporate: monthlyBodyCorp,
            monthlyCouncilRates: monthlyCouncil,
            monthlyWaterRates: monthlyWater,
            monthlyRepairsMaintenance: monthlyRepairs,
            monthlyPropertyManagement: monthlyPM,
            monthlyLandlordInsurance: monthlyLandlord,
            monthlyBuildingInsurance: monthlyBuilding,
            monthlyRentalIncome: monthlyRental,
            weeklyRentalIncome: parseCurrency(getCellValue(sheet, `G${invPropRow + 16}`)),
            totalMonthlyExpenditure: totalExpenditure,
            netMonthlyCashflow: parseCurrency(getCellValue(sheet, `F${invPropRow + 17}`))
          });
        }
      }
    }

    // Parse Portfolio Summary
    const portfolioRow = findRowByLabel(sheet, 'Portfolio Cashflow Analysis');
    let portfolioSummary: ParsedPortfolioSummary | undefined;
    
    if (portfolioRow) {
      portfolioSummary = {
        totalPortfolioValue: parseCurrency(getCellValue(sheet, `F${portfolioRow + 2}`)),
        totalDebt: parseCurrency(getCellValue(sheet, `F${portfolioRow + 3}`)),
        totalMonthlyExpenditure: parseCurrency(getCellValue(sheet, `F${portfolioRow + 4}`)),
        totalMonthlyIncome: parseCurrency(getCellValue(sheet, `F${portfolioRow + 5}`)),
        totalMonthlyRentalIncome: parseCurrency(getCellValue(sheet, `F${portfolioRow + 6}`)),
        netMonthlyCashFlow: parseCurrency(getCellValue(sheet, `F${portfolioRow + 8}`))
      };
    }

    // Only return if we have valid primary contact data
    if (!primaryContact.firstName && !primaryContact.surname) {
      return null;
    }

    return {
      primaryContact,
      secondaryContact,
      properties: properties.length > 0 ? properties : undefined,
      portfolioSummary
    };
  } catch (error) {
    console.error('Error parsing sheet:', error);
    return null;
  }
}

// Main export function
export function parseExcelToClients(workbook: XLSX.WorkBook): ParsedClient[] {
  const clients: ParsedClient[] = [];
  
  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const client = parseSheetToClient(sheet);
    
    if (client) {
      clients.push(client);
    }
  }

  // If no clients found from individual sheets, the workbook might have a different structure
  // Try parsing the first sheet as a single client
  if (clients.length === 0 && workbook.SheetNames.length > 0) {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const client = parseSheetToClient(firstSheet);
    if (client) {
      clients.push(client);
    }
  }

  return clients;
}
