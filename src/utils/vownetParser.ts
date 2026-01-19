import * as XLSX from 'xlsx';
import { 
  ParsedClient, 
  ParsedContact, 
  ParsedProperty, 
  ParsedPortfolioSummary,
  ParsedEmployment,
  ParsedIncome,
  ParsedAsset,
  ParsedLiability,
  ParsedAddress,
  ParsedFamilyRelations
} from './excelClientParser';

// Helper to safely get cell value
function getCellValue(sheet: XLSX.WorkSheet, cellRef: string): any {
  const cell = sheet[cellRef];
  return cell ? cell.v : null;
}

// Helper to parse currency values with enhanced handling for edge cases
function parseCurrency(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    let str = value.trim();
    
    // Handle "Paid Off", "N/A", "-" etc.
    if (/^(paid off|n\/a|nil|none|-|—)$/i.test(str)) return 0;
    
    // Handle "Million" notation (e.g., "1.15Million" → 1150000)
    const millionMatch = str.match(/^[\$]?\s*([\d.,]+)\s*million/i);
    if (millionMatch) {
      const num = parseFloat(millionMatch[1].replace(/,/g, ''));
      return isNaN(num) ? 0 : num * 1000000;
    }
    
    // Handle "K" notation (e.g., "950K" → 950000, "85k" → 85000)
    const kMatch = str.match(/^[\$]?\s*([\d.,]+)\s*k(?:\s|$|-|–)/i);
    if (kMatch) {
      const num = parseFloat(kMatch[1].replace(/,/g, ''));
      return isNaN(num) ? 0 : num * 1000;
    }
    
    // Handle range values (e.g., "120-130" → take midpoint 125)
    const rangeMatch = str.match(/^[\$]?\s*([\d.,]+)\s*[-–]\s*([\d.,]+)/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
      if (!isNaN(low) && !isNaN(high)) {
        return (low + high) / 2 * 1000; // Assume it's in thousands if no suffix
      }
    }
    
    // Handle European-style decimals (e.g., "476.433.17" → 476433.17)
    // Count periods - if more than one, treat all but last as thousand separators
    const periods = (str.match(/\./g) || []).length;
    if (periods > 1) {
      // Replace all periods except the last one
      const parts = str.split('.');
      const lastPart = parts.pop();
      str = parts.join('') + '.' + lastPart;
    }
    
    // Standard cleanup: remove currency symbols, commas, spaces
    const cleaned = str.replace(/[$,\s]/g, '').replace(/[()]/g, '-');
    
    // Extract the first valid number from the string
    const numMatch = cleaned.match(/-?[\d.]+/);
    if (numMatch) {
      const parsed = parseFloat(numMatch[0]);
      return isNaN(parsed) ? 0 : parsed;
    }
  }
  return 0;
}

// Helper to parse percentage values with enhanced handling
function parsePercentage(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    // If already a decimal (0.059 for 5.9%), convert to percentage
    return value < 1 ? value * 100 : value;
  }
  if (typeof value === 'string') {
    // Handle "$1.00" mistakenly entered as percentage (should be 100%)
    if (value.startsWith('$')) {
      const num = parseCurrency(value);
      // If it's $1.00 or similar, likely meant to be 100%
      if (num === 1) return 100;
      return num;
    }
    const cleaned = value.replace(/[%\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to parse text-based dates (e.g., "8/9/73", "6/29/81", "1992")
function parseTextDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const str = dateStr.toString().trim();
  
  // Handle year-only (e.g., "1992")
  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }
  
  // Handle "X Years" format (e.g., "10 Years")
  if (/^\d+\s*years?$/i.test(str)) {
    return null; // Not a valid date, just duration
  }
  
  // Handle MM/DD/YY or M/D/YY format (US format common in Excel)
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    let [, month, day, year] = usMatch;
    // Handle 2-digit year
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Handle DD/MM/YYYY format (AU format)
  const auMatch = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (auMatch) {
    const [, day, month, year] = auMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Return original if no pattern matched
  return str;
}

// Helper to find row by label in column A (or any column)
function findRowByLabel(sheet: XLSX.WorkSheet, label: string, startRow: number = 1, endRow: number = 300): number | null {
  const searchLabel = label.toLowerCase().trim();
  for (let row = startRow; row <= endRow; row++) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const cellValue = getCellValue(sheet, `${col}${row}`);
      if (cellValue && typeof cellValue === 'string') {
        const cellText = cellValue.toLowerCase().trim();
        if (cellText === searchLabel || cellText.includes(searchLabel)) {
          return row;
        }
      }
    }
  }
  return null;
}

// Helper to get value from adjacent cell (typically column B for labels in A, or F for labels in E)
function getValueNextToLabel(sheet: XLSX.WorkSheet, labelRow: number, labelCol: string): any {
  const nextCols: Record<string, string> = { 'A': 'B', 'B': 'C', 'C': 'D', 'D': 'E', 'E': 'F', 'F': 'G' };
  return getCellValue(sheet, `${nextCols[labelCol] || 'B'}${labelRow}`);
}

// Search for a cell value by looking for a label in the row
function findValueByRowLabel(sheet: XLSX.WorkSheet, label: string, valueCol: string = 'B'): any {
  const row = findRowByLabel(sheet, label);
  if (row) {
    return getCellValue(sheet, `${valueCol}${row}`);
  }
  return null;
}

// Parse personal details from VowNet form
function parsePersonalDetails(sheet: XLSX.WorkSheet): { primary: ParsedContact; secondary?: ParsedContact; address?: ParsedAddress; family?: ParsedFamilyRelations; residentialStatus?: string } {
  const primary: ParsedContact = {
    firstName: null,
    middleName: null,
    surname: null,
    mobile: null,
    email: null,
    gender: null,
    dob: null
  };

  // Search for primary contact details
  const firstNameRow = findRowByLabel(sheet, 'first name');
  if (firstNameRow) {
    primary.firstName = getCellValue(sheet, `B${firstNameRow}`);
    
    // Look for subsequent fields
    for (let offset = 1; offset <= 10; offset++) {
      const label = getCellValue(sheet, `A${firstNameRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${firstNameRow + offset}`);
      
      if (label.includes('middle')) primary.middleName = value;
      if (label.includes('surname') || label.includes('last name')) primary.surname = value;
      if (label.includes('mobile') || label.includes('phone')) primary.mobile = value?.toString();
      if (label.includes('email')) primary.email = value;
      if (label.includes('gender')) primary.gender = value;
      if (label.includes('dob') || label.includes('date of birth') || label.includes('birth')) {
        if (value) {
          // Handle Excel date serial or string
          if (typeof value === 'number') {
            const date = XLSX.SSF.parse_date_code(value);
            primary.dob = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          } else {
            primary.dob = parseTextDate(value?.toString());
          }
        }
      }
    }
  }

  // Search for secondary contact
  let secondary: ParsedContact | undefined;
  const secondaryRow = findRowByLabel(sheet, 'secondary contact');
  if (secondaryRow) {
    const secFirstNameRow = findRowByLabel(sheet, 'first name', secondaryRow, secondaryRow + 20);
    if (secFirstNameRow && secFirstNameRow > secondaryRow) {
      const secFirstName = getCellValue(sheet, `B${secFirstNameRow}`);
      if (secFirstName) {
        secondary = {
          firstName: secFirstName,
          middleName: null,
          surname: null,
          mobile: null,
          email: null,
          gender: null,
          dob: null
        };
        
        // Extend search range to include DOB which may be further down
        for (let offset = 1; offset <= 15; offset++) {
          const label = getCellValue(sheet, `A${secFirstNameRow + offset}`)?.toString().toLowerCase() || '';
          const value = getCellValue(sheet, `B${secFirstNameRow + offset}`);
          
          if (label.includes('middle')) secondary.middleName = value;
          if (label.includes('surname') || label.includes('last name')) secondary.surname = value;
          if (label.includes('mobile') || label.includes('phone')) secondary.mobile = value?.toString();
          if (label.includes('email')) secondary.email = value;
          if (label.includes('gender')) secondary.gender = value;
          if (label.includes('dob') || label.includes('date of birth') || label.includes('birth')) {
            if (value) {
              if (typeof value === 'number') {
                const date = XLSX.SSF.parse_date_code(value);
                secondary.dob = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
              } else {
                secondary.dob = parseTextDate(value?.toString());
              }
            }
          }
        }
      }
    }
  }

  // Parse address
  const address: ParsedAddress = {
    currentAddress: null,
    country: null,
    livingSituation: null
  };
  
  const addressRow = findRowByLabel(sheet, 'current address') || findRowByLabel(sheet, 'address');
  if (addressRow) {
    address.currentAddress = getCellValue(sheet, `B${addressRow}`);
  }
  
  const countryRow = findRowByLabel(sheet, 'country');
  if (countryRow) {
    address.country = getCellValue(sheet, `B${countryRow}`);
  }

  // Parse family relations
  const family: ParsedFamilyRelations = {
    maritalStatus: null,
    dependentsCount: 0
  };
  
  const maritalRow = findRowByLabel(sheet, 'marital');
  if (maritalRow) {
    family.maritalStatus = getCellValue(sheet, `B${maritalRow}`);
  }
  
  const dependentsRow = findRowByLabel(sheet, 'dependent');
  if (dependentsRow) {
    const depValue = getCellValue(sheet, `B${dependentsRow}`);
    family.dependentsCount = typeof depValue === 'number' ? depValue : parseInt(depValue) || 0;
  }

  // Residential status
  let residentialStatus: string | undefined;
  const residentialRow = findRowByLabel(sheet, 'residential status');
  if (residentialRow) {
    residentialStatus = getCellValue(sheet, `B${residentialRow}`);
  }

  return { primary, secondary, address, family, residentialStatus };
}

// Parse employment data
function parseEmployment(sheet: XLSX.WorkSheet): ParsedEmployment[] {
  const employment: ParsedEmployment[] = [];

  // Look for primary employment
  const empRow = findRowByLabel(sheet, 'employment') || findRowByLabel(sheet, 'employer');
  if (empRow) {
    const primaryEmp: ParsedEmployment = {
      contactType: 'primary',
      employerName: null,
      employmentType: null,
      occupationRole: null,
      startDate: null
    };

    for (let offset = 0; offset <= 15; offset++) {
      const label = getCellValue(sheet, `A${empRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${empRow + offset}`);
      
      if (label.includes('employer') && !label.includes('type')) primaryEmp.employerName = value;
      if (label.includes('employment type') || label.includes('type of employment')) primaryEmp.employmentType = value;
      if (label.includes('occupation') || label.includes('role') || label.includes('position')) primaryEmp.occupationRole = value;
      if (label.includes('start date') || label.includes('commenced')) {
        if (value && typeof value === 'number') {
          const date = XLSX.SSF.parse_date_code(value);
          primaryEmp.startDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        } else if (value) {
          primaryEmp.startDate = value?.toString();
        }
      }
    }

    if (primaryEmp.employerName || primaryEmp.occupationRole) {
      employment.push(primaryEmp);
    }
  }

  // Look for secondary employment (after secondary contact section)
  const secondaryContactRow = findRowByLabel(sheet, 'secondary contact');
  if (secondaryContactRow) {
    const secEmpRow = findRowByLabel(sheet, 'employer', secondaryContactRow, secondaryContactRow + 50);
    if (secEmpRow && secEmpRow > secondaryContactRow) {
      const secondaryEmp: ParsedEmployment = {
        contactType: 'secondary',
        employerName: null,
        employmentType: null,
        occupationRole: null,
        startDate: null
      };

      for (let offset = 0; offset <= 15; offset++) {
        const label = getCellValue(sheet, `A${secEmpRow + offset}`)?.toString().toLowerCase() || '';
        const value = getCellValue(sheet, `B${secEmpRow + offset}`);
        
        if (label.includes('employer') && !label.includes('type')) secondaryEmp.employerName = value;
        if (label.includes('employment type')) secondaryEmp.employmentType = value;
        if (label.includes('occupation') || label.includes('role')) secondaryEmp.occupationRole = value;
      }

      if (secondaryEmp.employerName || secondaryEmp.occupationRole) {
        employment.push(secondaryEmp);
      }
    }
  }

  return employment;
}

// Parse income data
function parseIncome(sheet: XLSX.WorkSheet): ParsedIncome[] {
  const incomeList: ParsedIncome[] = [];

  // Look for income section
  const incomeRow = findRowByLabel(sheet, 'income') || findRowByLabel(sheet, 'gross salary') || findRowByLabel(sheet, 'salary');
  if (incomeRow) {
    const primaryIncome: ParsedIncome = {
      contactType: 'primary',
      grossSalary: 0,
      salaryFrequency: 'annual',
      bonus: 0,
      allowance: 0,
      commission: 0,
      overtimeEssential: 0,
      overtimeNonEssential: 0,
      otherTaxableIncome: 0
    };

    for (let offset = 0; offset <= 20; offset++) {
      const label = getCellValue(sheet, `A${incomeRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${incomeRow + offset}`);
      
      if (label.includes('gross salary') || label.includes('base salary')) primaryIncome.grossSalary = parseCurrency(value);
      if (label.includes('frequency')) primaryIncome.salaryFrequency = value || 'annual';
      if (label.includes('bonus')) primaryIncome.bonus = parseCurrency(value);
      if (label.includes('allowance')) primaryIncome.allowance = parseCurrency(value);
      if (label.includes('commission')) primaryIncome.commission = parseCurrency(value);
      if (label.includes('overtime') && label.includes('essential') && !label.includes('non')) {
        primaryIncome.overtimeEssential = parseCurrency(value);
      }
      if (label.includes('overtime') && label.includes('non')) {
        primaryIncome.overtimeNonEssential = parseCurrency(value);
      }
      if (label.includes('other') && label.includes('taxable')) primaryIncome.otherTaxableIncome = parseCurrency(value);
    }

    if (primaryIncome.grossSalary > 0) {
      incomeList.push(primaryIncome);
    }
  }

  // Look for secondary income
  const secondaryContactRow = findRowByLabel(sheet, 'secondary contact');
  if (secondaryContactRow) {
    const secIncomeRow = findRowByLabel(sheet, 'salary', secondaryContactRow, secondaryContactRow + 80);
    if (secIncomeRow && secIncomeRow > secondaryContactRow + 20) {
      const secondaryIncome: ParsedIncome = {
        contactType: 'secondary',
        grossSalary: 0,
        salaryFrequency: 'annual',
        bonus: 0,
        allowance: 0,
        commission: 0,
        overtimeEssential: 0,
        overtimeNonEssential: 0,
        otherTaxableIncome: 0
      };

      for (let offset = 0; offset <= 15; offset++) {
        const label = getCellValue(sheet, `A${secIncomeRow + offset}`)?.toString().toLowerCase() || '';
        const value = getCellValue(sheet, `B${secIncomeRow + offset}`);
        
        if (label.includes('gross salary') || label.includes('base salary')) secondaryIncome.grossSalary = parseCurrency(value);
        if (label.includes('bonus')) secondaryIncome.bonus = parseCurrency(value);
        if (label.includes('allowance')) secondaryIncome.allowance = parseCurrency(value);
        if (label.includes('commission')) secondaryIncome.commission = parseCurrency(value);
      }

      if (secondaryIncome.grossSalary > 0) {
        incomeList.push(secondaryIncome);
      }
    }
  }

  return incomeList;
}

// Parse assets
function parseAssets(sheet: XLSX.WorkSheet): ParsedAsset[] {
  const assets: ParsedAsset[] = [];

  // Look for assets section
  const assetsRow = findRowByLabel(sheet, 'assets') || findRowByLabel(sheet, 'vehicle') || findRowByLabel(sheet, 'savings');
  if (!assetsRow) return assets;

  // Parse vehicles
  for (let i = 1; i <= 3; i++) {
    const vehicleRow = findRowByLabel(sheet, `vehicle ${i}`) || (i === 1 ? findRowByLabel(sheet, 'vehicle') : null);
    if (vehicleRow) {
      let makeModel: string | undefined;
      let value = 0;
      let vehicleType: string | undefined;

      for (let offset = 0; offset <= 5; offset++) {
        const label = getCellValue(sheet, `A${vehicleRow + offset}`)?.toString().toLowerCase() || '';
        const cellValue = getCellValue(sheet, `B${vehicleRow + offset}`);
        
        if (label.includes('make') || label.includes('model')) makeModel = cellValue;
        if (label.includes('type')) vehicleType = cellValue;
        if (label.includes('value') || label.includes('worth')) value = parseCurrency(cellValue);
      }

      if (makeModel || value > 0) {
        assets.push({
          assetType: 'vehicle',
          vehicleType,
          makeModel,
          value
        });
      }
    }
  }

  // Parse savings accounts
  const savingsRow = findRowByLabel(sheet, 'savings');
  if (savingsRow) {
    for (let offset = 0; offset <= 10; offset++) {
      const label = getCellValue(sheet, `A${savingsRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${savingsRow + offset}`);
      
      if (label.includes('bank') || label.includes('institution')) {
        const amount = getCellValue(sheet, `B${savingsRow + offset + 1}`);
        if (value || parseCurrency(amount) > 0) {
          assets.push({
            assetType: 'savings',
            institutionName: value,
            value: parseCurrency(amount)
          });
        }
      }
    }
  }

  // Parse superannuation
  const superRow = findRowByLabel(sheet, 'superannuation') || findRowByLabel(sheet, 'superfund');
  if (superRow) {
    let institutionName: string | undefined;
    let value = 0;

    for (let offset = 0; offset <= 5; offset++) {
      const label = getCellValue(sheet, `A${superRow + offset}`)?.toString().toLowerCase() || '';
      const cellValue = getCellValue(sheet, `B${superRow + offset}`);
      
      if (label.includes('fund') || label.includes('provider') || label.includes('institution')) {
        institutionName = cellValue;
      }
      if (label.includes('balance') || label.includes('value')) {
        value = parseCurrency(cellValue);
      }
    }

    if (institutionName || value > 0) {
      assets.push({
        assetType: 'superfund',
        institutionName,
        value
      });
    }
  }

  return assets;
}

// Parse liabilities
function parseLiabilities(sheet: XLSX.WorkSheet): ParsedLiability[] {
  const liabilities: ParsedLiability[] = [];

  // Credit cards
  const creditCardRow = findRowByLabel(sheet, 'credit card');
  if (creditCardRow) {
    for (let cardNum = 1; cardNum <= 4; cardNum++) {
      const cardRow = findRowByLabel(sheet, `credit card ${cardNum}`, creditCardRow) || 
                      (cardNum === 1 ? creditCardRow : null);
      
      if (cardRow) {
        let providerName: string | undefined;
        let currentBalance = 0;
        let creditLimit: number | undefined;
        let interestRate: number | undefined;
        let monthlyRepayment = 0;

        for (let offset = 0; offset <= 8; offset++) {
          const label = getCellValue(sheet, `A${cardRow + offset}`)?.toString().toLowerCase() || '';
          const value = getCellValue(sheet, `B${cardRow + offset}`);
          
          if (label.includes('provider') || label.includes('bank') || label.includes('issuer')) {
            providerName = value;
          }
          if (label.includes('balance') || label.includes('owing')) {
            currentBalance = parseCurrency(value);
          }
          if (label.includes('limit')) {
            creditLimit = parseCurrency(value);
          }
          if (label.includes('rate') || label.includes('interest')) {
            interestRate = parsePercentage(value);
          }
          if (label.includes('repayment') || label.includes('monthly')) {
            monthlyRepayment = parseCurrency(value);
          }
        }

        if (currentBalance > 0 || creditLimit) {
          liabilities.push({
            liabilityType: 'credit_card',
            providerName,
            currentBalance,
            creditLimit,
            interestRate,
            monthlyRepayment
          });
        }
      }
    }
  }

  // Personal loans
  const personalLoanRow = findRowByLabel(sheet, 'personal loan');
  if (personalLoanRow) {
    let providerName: string | undefined;
    let currentBalance = 0;
    let interestRate: number | undefined;
    let monthlyRepayment = 0;

    for (let offset = 0; offset <= 8; offset++) {
      const label = getCellValue(sheet, `A${personalLoanRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${personalLoanRow + offset}`);
      
      if (label.includes('provider') || label.includes('lender')) providerName = value;
      if (label.includes('balance') || label.includes('owing')) currentBalance = parseCurrency(value);
      if (label.includes('rate')) interestRate = parsePercentage(value);
      if (label.includes('repayment')) monthlyRepayment = parseCurrency(value);
    }

    if (currentBalance > 0) {
      liabilities.push({
        liabilityType: 'personal_loan',
        providerName,
        currentBalance,
        interestRate,
        monthlyRepayment
      });
    }
  }

  // Vehicle loans / car loans
  const vehicleLoanRow = findRowByLabel(sheet, 'vehicle loan') || findRowByLabel(sheet, 'car loan');
  if (vehicleLoanRow) {
    let providerName: string | undefined;
    let currentBalance = 0;
    let interestRate: number | undefined;
    let monthlyRepayment = 0;

    for (let offset = 0; offset <= 8; offset++) {
      const label = getCellValue(sheet, `A${vehicleLoanRow + offset}`)?.toString().toLowerCase() || '';
      const value = getCellValue(sheet, `B${vehicleLoanRow + offset}`);
      
      if (label.includes('provider') || label.includes('lender')) providerName = value;
      if (label.includes('balance') || label.includes('owing')) currentBalance = parseCurrency(value);
      if (label.includes('rate')) interestRate = parsePercentage(value);
      if (label.includes('repayment')) monthlyRepayment = parseCurrency(value);
    }

    if (currentBalance > 0) {
      liabilities.push({
        liabilityType: 'vehicle_loan',
        providerName,
        currentBalance,
        interestRate,
        monthlyRepayment
      });
    }
  }

  return liabilities;
}

// Parse properties (improved version)
function parseProperties(sheet: XLSX.WorkSheet): ParsedProperty[] {
  const properties: ParsedProperty[] = [];

  // Owner Occupied Property
  const ownerOccupiedRow = findRowByLabel(sheet, 'owner occupied') || findRowByLabel(sheet, 'ppor');
  if (ownerOccupiedRow) {
    const prop: ParsedProperty = {
      propertyType: 'owner_occupied',
      address: null,
      value: 0,
      loanRemaining: 0,
      interestRate: 0,
      ownershipPercentage: 100,
      monthlyInterestRepayment: 0,
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
    };

    // Search for values in columns E/F (common VowNet layout)
    for (let offset = 0; offset <= 20; offset++) {
      const labelE = getCellValue(sheet, `E${ownerOccupiedRow + offset}`)?.toString().toLowerCase() || '';
      const labelA = getCellValue(sheet, `A${ownerOccupiedRow + offset}`)?.toString().toLowerCase() || '';
      const valueF = getCellValue(sheet, `F${ownerOccupiedRow + offset}`);
      const valueB = getCellValue(sheet, `B${ownerOccupiedRow + offset}`);
      
      const label = labelE || labelA;
      const value = valueF ?? valueB;

      if (label.includes('address') && !prop.address) prop.address = value;
      if (label.includes('property value') || label.includes('current value') || (label.includes('value') && !label.includes('loan'))) {
        prop.value = parseCurrency(value);
      }
      if (label.includes('loan') && (label.includes('remaining') || label.includes('balance') || label.includes('owing'))) {
        prop.loanRemaining = parseCurrency(value);
      }
      if (label.includes('interest rate') || label.includes('rate')) {
        prop.interestRate = parsePercentage(value);
      }
      if (label.includes('ownership')) prop.ownershipPercentage = parsePercentage(value) || 100;
      if (label.includes('monthly') && label.includes('interest')) prop.monthlyInterestRepayment = parseCurrency(value);
    }

    if (prop.value > 0 || prop.loanRemaining > 0 || prop.address) {
      properties.push(prop);
    }
  }

  // Investment Properties (search for multiple)
  for (let propNum = 1; propNum <= 10; propNum++) {
    const invPropRow = findRowByLabel(sheet, `investment property ${propNum}`) || 
                       (propNum === 1 ? findRowByLabel(sheet, 'investment property') : null);
    
    if (invPropRow) {
      const prop: ParsedProperty = {
        propertyType: 'investment',
        address: null,
        value: 0,
        loanRemaining: 0,
        interestRate: 0,
        ownershipPercentage: 100,
        monthlyInterestRepayment: 0,
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
      };

      for (let offset = 0; offset <= 25; offset++) {
        const labelE = getCellValue(sheet, `E${invPropRow + offset}`)?.toString().toLowerCase() || '';
        const labelA = getCellValue(sheet, `A${invPropRow + offset}`)?.toString().toLowerCase() || '';
        const valueF = getCellValue(sheet, `F${invPropRow + offset}`);
        const valueB = getCellValue(sheet, `B${invPropRow + offset}`);
        const valueG = getCellValue(sheet, `G${invPropRow + offset}`);
        
        const label = labelE || labelA;
        const value = valueF ?? valueB;

        if (label.includes('address') && !prop.address) prop.address = value;
        if (label.includes('property value') || label.includes('current value') || (label.includes('value') && !label.includes('loan'))) {
          prop.value = parseCurrency(value);
        }
        if (label.includes('loan') && (label.includes('remaining') || label.includes('balance'))) {
          prop.loanRemaining = parseCurrency(value);
        }
        if (label.includes('interest rate')) prop.interestRate = parsePercentage(value);
        if (label.includes('ownership')) prop.ownershipPercentage = parsePercentage(value) || 100;
        if (label.includes('monthly') && label.includes('interest') && label.includes('repayment')) {
          prop.monthlyInterestRepayment = parseCurrency(value);
        }
        if (label.includes('body corporate') || label.includes('strata')) prop.monthlyBodyCorporate = parseCurrency(value);
        if (label.includes('council')) prop.monthlyCouncilRates = parseCurrency(value);
        if (label.includes('water')) prop.monthlyWaterRates = parseCurrency(value);
        if (label.includes('repairs') || label.includes('maintenance')) prop.monthlyRepairsMaintenance = parseCurrency(value);
        if (label.includes('property management') || label.includes('agent')) prop.monthlyPropertyManagement = parseCurrency(value);
        if (label.includes('landlord insurance')) prop.monthlyLandlordInsurance = parseCurrency(value);
        if (label.includes('building insurance')) prop.monthlyBuildingInsurance = parseCurrency(value);
        if (label.includes('monthly') && label.includes('rental')) prop.monthlyRentalIncome = parseCurrency(value);
        if (label.includes('weekly') && label.includes('rental')) {
          prop.weeklyRentalIncome = parseCurrency(valueG) || parseCurrency(value);
        }
        if (label.includes('total') && label.includes('expenditure')) prop.totalMonthlyExpenditure = parseCurrency(value);
        if (label.includes('net') && label.includes('cashflow')) prop.netMonthlyCashflow = parseCurrency(value);
      }

      // Verify and reconcile weekly vs monthly rental income
      // If weekly is provided and significantly differs from stated monthly, recalculate
      if (prop.weeklyRentalIncome > 0) {
        const calculatedMonthly = prop.weeklyRentalIncome * (52 / 12); // 4.333...
        // If monthly wasn't captured or differs significantly (>5%), use calculated
        if (prop.monthlyRentalIncome === 0 || 
            Math.abs(prop.monthlyRentalIncome - calculatedMonthly) / calculatedMonthly > 0.05) {
          prop.monthlyRentalIncome = Math.round(calculatedMonthly * 100) / 100;
        }
      }

      // Recalculate net cashflow if not set or seems wrong
      if (prop.monthlyRentalIncome > 0 || prop.totalMonthlyExpenditure > 0) {
        const calculatedNet = prop.monthlyRentalIncome - prop.totalMonthlyExpenditure - prop.monthlyInterestRepayment;
        if (prop.netMonthlyCashflow === 0 || 
            Math.abs(prop.netMonthlyCashflow - calculatedNet) > 100) {
          // Only override if significantly different
          // Keep form value if close, as it may include other factors
        }
      }

      if (prop.value > 0 || prop.monthlyRentalIncome > 0 || prop.address) {
        properties.push(prop);
      }
    }
  }

  return properties;
}

// Parse portfolio summary
function parsePortfolioSummary(sheet: XLSX.WorkSheet): ParsedPortfolioSummary | undefined {
  const portfolioRow = findRowByLabel(sheet, 'portfolio cashflow') || findRowByLabel(sheet, 'portfolio summary');
  if (!portfolioRow) return undefined;

  const summary: ParsedPortfolioSummary = {
    totalPortfolioValue: 0,
    totalDebt: 0,
    totalMonthlyExpenditure: 0,
    totalMonthlyIncome: 0,
    totalMonthlyRentalIncome: 0,
    netMonthlyCashFlow: 0
  };

  for (let offset = 0; offset <= 15; offset++) {
    const labelE = getCellValue(sheet, `E${portfolioRow + offset}`)?.toString().toLowerCase() || '';
    const labelA = getCellValue(sheet, `A${portfolioRow + offset}`)?.toString().toLowerCase() || '';
    const valueF = getCellValue(sheet, `F${portfolioRow + offset}`);
    const valueB = getCellValue(sheet, `B${portfolioRow + offset}`);
    
    const label = labelE || labelA;
    const value = valueF ?? valueB;

    if (label.includes('total') && label.includes('portfolio') && label.includes('value')) {
      summary.totalPortfolioValue = parseCurrency(value);
    }
    if (label.includes('total') && (label.includes('debt') || label.includes('liability'))) {
      summary.totalDebt = parseCurrency(value);
    }
    if (label.includes('total') && label.includes('expenditure')) {
      summary.totalMonthlyExpenditure = parseCurrency(value);
    }
    if (label.includes('total') && label.includes('income') && !label.includes('rental')) {
      summary.totalMonthlyIncome = parseCurrency(value);
    }
    if (label.includes('total') && label.includes('rental')) {
      summary.totalMonthlyRentalIncome = parseCurrency(value);
    }
    if (label.includes('net') && (label.includes('cashflow') || label.includes('cash flow'))) {
      summary.netMonthlyCashFlow = parseCurrency(value);
    }
  }

  return summary;
}

// Main parsing function for VowNet forms
export function parseVownetForm(workbook: XLSX.WorkBook): ParsedClient | null {
  // VowNet forms typically have data in the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  
  try {
    // Parse all sections
    const { primary, secondary, address, family, residentialStatus } = parsePersonalDetails(sheet);
    const employment = parseEmployment(sheet);
    const income = parseIncome(sheet);
    const assets = parseAssets(sheet);
    const liabilities = parseLiabilities(sheet);
    const properties = parseProperties(sheet);
    const portfolioSummary = parsePortfolioSummary(sheet);

    // Only return if we found meaningful data
    if (!primary.firstName && !primary.surname && properties.length === 0) {
      return null;
    }

    return {
      primaryContact: primary,
      secondaryContact: secondary,
      address,
      residentialStatus,
      familyRelations: family,
      employment: employment.length > 0 ? employment : undefined,
      income: income.length > 0 ? income : undefined,
      properties: properties.length > 0 ? properties : undefined,
      assets: assets.length > 0 ? assets : undefined,
      liabilities: liabilities.length > 0 ? liabilities : undefined,
      portfolioSummary
    };
  } catch (error) {
    console.error('Error parsing VowNet form:', error);
    return null;
  }
}
