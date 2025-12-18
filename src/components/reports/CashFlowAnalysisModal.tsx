import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Calculator, Download, TrendingUp, TrendingDown, DollarSign, Percent, Home, Calendar } from 'lucide-react';

interface InvestmentReport {
  id: string;
  property_address: string;
  financial_calculations?: any;
  manual_overrides?: any;
}

interface CashFlowAnalysisModalProps {
  report: InvestmentReport | null;
  isOpen: boolean;
  onClose: () => void;
}

interface YearlyProjection {
  year: number;
  capitalGrowthRate: number;
  propertyMarketValue: number;
  loanAmount: number;
  equityInProperty: number;
  loanToValueRatio: number;
  rentalIncome: number;
  grossYield: number;
  netYield: number;
  propertyExpenses: number;
  interestRate: number;
  interestPayments: number;
  principalPayments: number;
  preTaxCashFlowPA: number;
  preTaxCashFlowPW: number;
  depreciation: number;
  totalDeductions: number;
  netProfitLoss: number;
  taxRefund: number;
  landTax: number;
  afterTaxCashFlowPA: number;
  afterTaxCashFlowPW: number;
}

export function CashFlowAnalysisModal({ report, isOpen, onClose }: CashFlowAnalysisModalProps) {
  const { toast } = useToast();

  // Extract financial data from report with manual overrides taking precedence
  const financialData = useMemo(() => {
    if (!report) return null;

    const fc = report.financial_calculations || {};
    const mo = report.manual_overrides || {};
    const cashFlow = fc.cashFlow || {};

    return {
      // Purchase & Loan
      purchasePrice: mo.purchasePrice || fc.purchasePrice || fc.propertyValue || 0,
      landPrice: mo.landPrice || fc.landPrice || 0,
      buildPrice: mo.buildPrice || fc.buildPrice || 0,
      marketValueNow: mo.marketValueNow || cashFlow.marketValueNow || mo.purchasePrice || fc.purchasePrice || 0,
      depositValue: mo.depositValue || fc.depositValue || 0,
      loanAmount: mo.loanAmount || cashFlow.loanAmount || 0,
      loanToValueRatio: mo.loanToValueRatio || fc.loanToValueRatio || 80,
      loanType: mo.loanType || cashFlow.loanType || 'interest_only',
      loanTermYears: mo.loanTermYears || cashFlow.loanTermYears || 30,
      interestRate: mo.interestRate || fc.interestRate || 5.5,
      capitalGrowth: mo.capitalGrowth || fc.capitalGrowth || 5,

      // Rental Income
      weeklyRent: mo.weeklyRent || fc.weeklyRent || 0,
      occupancyRate: mo.occupancyRate || cashFlow.occupancyRate || 52,

      // Expenses
      stampDuty: mo.stampDuty || fc.stampDuty || 0,
      bodyCorporateFees: mo.bodyCorporateFees || fc.bodyCorporateFees || 0,
      landTax: mo.landTax || fc.landTax || 0,
      councilRates: mo.councilRates || fc.councilRates || 0,
      waterRates: mo.waterRates || fc.waterRates || 0,
      solicitorFees: mo.solicitorFees || fc.solicitorFees || 0,
      buildingLandlordInsurance: mo.buildingLandlordInsurance || fc.buildingLandlordInsurance || 0,
      propertyManagementFees: mo.propertyManagementFees || fc.propertyManagementFees || 7,
      repairsMaintenance: mo.repairsMaintenance || fc.repairsMaintenance || 0,
      lettingFees: mo.lettingFees || fc.lettingFees || 0,

      // Tax & Growth
      cpiGrowthRate: mo.cpiGrowthRate || cashFlow.cpiGrowthRate || 3,
      depreciation: mo.depreciation || cashFlow.depreciation || 6000,
      taxRate: mo.taxRate || cashFlow.taxRate || 30,
      constructionYear: mo.constructionYear || cashFlow.constructionYear || new Date().getFullYear(),
    };
  }, [report]);

  // Calculate 10-year projections
  const projections = useMemo(() => {
    if (!financialData) return [];

    const results: YearlyProjection[] = [];
    
    // Calculate initial values
    const purchasePrice = financialData.purchasePrice;
    const loanAmount = financialData.loanAmount || (purchasePrice * (financialData.loanToValueRatio / 100));
    const weeklyRent = financialData.weeklyRent;
    const occupancyRate = financialData.occupancyRate;
    const capitalGrowthRate = financialData.capitalGrowth / 100;
    const interestRate = financialData.interestRate / 100;
    const cpiRate = financialData.cpiGrowthRate / 100;
    const taxRate = financialData.taxRate / 100;
    const isInterestOnly = financialData.loanType === 'interest_only';

    // Calculate initial annual expenses
    const baseExpenses = 
      financialData.councilRates +
      financialData.waterRates +
      financialData.bodyCorporateFees +
      financialData.buildingLandlordInsurance +
      financialData.repairsMaintenance;

    // Calculate property management as percentage of rent
    const propertyManagementPercent = financialData.propertyManagementFees / 100;

    for (let year = 0; year <= 10; year++) {
      // Property value grows with capital growth
      const propertyValue = year === 0 
        ? financialData.marketValueNow || purchasePrice 
        : purchasePrice * Math.pow(1 + capitalGrowthRate, year);

      // Loan balance (stays same for interest-only, decreases for P&I)
      const currentLoanAmount = isInterestOnly ? loanAmount : loanAmount; // Simplified - would need amortization calc

      // Equity = Property Value - Loan Amount
      const equity = propertyValue - currentLoanAmount;

      // LVR
      const lvr = (currentLoanAmount / propertyValue) * 100;

      // Rental income grows with CPI
      const annualRent = year === 0 
        ? weeklyRent * occupancyRate 
        : weeklyRent * occupancyRate * Math.pow(1 + cpiRate, year);

      // Expenses grow with CPI
      const expenses = year === 0 
        ? baseExpenses 
        : baseExpenses * Math.pow(1 + cpiRate, year);

      // Property management based on rent
      const propertyManagement = annualRent * propertyManagementPercent;

      // Total property expenses
      const totalExpenses = expenses + propertyManagement;

      // Interest payments
      const interestPayments = currentLoanAmount * interestRate;

      // Principal payments (0 for interest-only)
      const principalPayments = isInterestOnly ? 0 : 0; // Simplified

      // Gross yield
      const grossYield = year === 0 ? 0 : (annualRent / propertyValue) * 100;

      // Net yield (after expenses, before interest)
      const netYield = year === 0 ? 0 : ((annualRent - totalExpenses) / propertyValue) * 100;

      // Pre-tax cash flow
      const preTaxCashFlow = year === 0 ? 0 : annualRent - totalExpenses - interestPayments - principalPayments;

      // Depreciation
      const depreciation = year === 0 ? 0 : financialData.depreciation;

      // Total deductions
      const totalDeductions = totalExpenses + interestPayments + depreciation;

      // Net profit/loss (for tax purposes)
      const netProfitLoss = year === 0 ? 0 : annualRent - totalDeductions;

      // Tax refund (if negative gearing)
      const taxRefund = year === 0 ? 0 : (netProfitLoss < 0 ? Math.abs(netProfitLoss) * taxRate : 0);

      // After-tax cash flow
      const afterTaxCashFlow = year === 0 ? 0 : preTaxCashFlow + taxRefund;

      results.push({
        year,
        capitalGrowthRate: financialData.capitalGrowth,
        propertyMarketValue: Math.round(propertyValue),
        loanAmount: Math.round(currentLoanAmount),
        equityInProperty: Math.round(equity),
        loanToValueRatio: Math.round(lvr * 100) / 100,
        rentalIncome: Math.round(annualRent),
        grossYield: Math.round(grossYield * 100) / 100,
        netYield: Math.round(netYield * 100) / 100,
        propertyExpenses: Math.round(totalExpenses),
        interestRate: financialData.interestRate,
        interestPayments: Math.round(interestPayments),
        principalPayments: Math.round(principalPayments),
        preTaxCashFlowPA: Math.round(preTaxCashFlow),
        preTaxCashFlowPW: Math.round(preTaxCashFlow / 52),
        depreciation: Math.round(depreciation),
        totalDeductions: Math.round(totalDeductions),
        netProfitLoss: Math.round(netProfitLoss),
        taxRefund: Math.round(taxRefund),
        landTax: financialData.landTax,
        afterTaxCashFlowPA: Math.round(afterTaxCashFlow),
        afterTaxCashFlowPW: Math.round(afterTaxCashFlow / 52),
      });
    }

    return results;
  }, [financialData]);

  const formatCurrency = (value: number) => {
    if (value === 0) return '-';
    const formatted = Math.abs(value).toLocaleString('en-AU', { maximumFractionDigits: 0 });
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleExportExcel = () => {
    // Create CSV data
    const headers = ['Year', 'Property Value', 'Loan Amount', 'Equity', 'LVR %', 'Rental Income', 'Gross Yield %', 'Net Yield %', 'Expenses', 'Interest', 'Pre-Tax CF', 'After-Tax CF'];
    const rows = projections.map(p => [
      p.year === 0 ? 'Today' : `Year ${p.year}`,
      p.propertyMarketValue,
      p.loanAmount,
      p.equityInProperty,
      p.loanToValueRatio,
      p.rentalIncome,
      p.grossYield,
      p.netYield,
      p.propertyExpenses,
      p.interestPayments,
      p.preTaxCashFlowPA,
      p.afterTaxCashFlowPA
    ]);

    const csvContent = [
      `10 Year Cash Flow Analysis - ${report?.property_address}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-flow-analysis-${report?.property_address?.replace(/[^a-z0-9]/gi, '-')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Cash flow analysis exported to CSV file.",
    });
  };

  if (!report || !financialData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col gap-0 p-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              10-Year Cash Flow Analysis
            </DialogTitle>
            <DialogDescription>
              {report.property_address}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {/* Input Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Purchase Price
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(financialData.purchasePrice)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Weekly Rent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(financialData.weeklyRent)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Interest Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatPercent(financialData.interestRate)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Capital Growth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatPercent(financialData.capitalGrowth)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Input Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Input Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Land Price</p>
                    <p className="font-medium">{formatCurrency(financialData.landPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Build Price</p>
                    <p className="font-medium">{formatCurrency(financialData.buildPrice)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Deposit</p>
                    <p className="font-medium">{formatCurrency(financialData.depositValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">LVR</p>
                    <p className="font-medium">{formatPercent(financialData.loanToValueRatio)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stamp Duty</p>
                    <p className="font-medium">{formatCurrency(financialData.stampDuty)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Council Rates</p>
                    <p className="font-medium">{formatCurrency(financialData.councilRates)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Water Rates</p>
                    <p className="font-medium">{formatCurrency(financialData.waterRates)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Insurance</p>
                    <p className="font-medium">{formatCurrency(financialData.buildingLandlordInsurance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Property Management</p>
                    <p className="font-medium">{formatPercent(financialData.propertyManagementFees)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Loan Type</p>
                    <p className="font-medium">{financialData.loanType === 'interest_only' ? 'Interest Only' : 'P&I'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">CPI Growth</p>
                    <p className="font-medium">{formatPercent(financialData.cpiGrowthRate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tax Rate</p>
                    <p className="font-medium">{formatPercent(financialData.taxRate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 10-Year Projection Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">10-Year Projection Overview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10">Overview</TableHead>
                        {projections.map(p => (
                          <TableHead key={p.year} className="text-center min-w-[100px]">
                            {p.year === 0 ? 'Today' : `Year ${p.year}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Capital Growth %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.capitalGrowthRate}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Value $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.propertyMarketValue.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Loan Amount $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.loanAmount.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Statistics</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Equity $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center text-green-600">{p.equityInProperty.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">LVR %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.loanToValueRatio}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Rental Income $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">
                            {p.year === 0 ? `${financialData.weeklyRent}pw` : p.rentalIncome.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Gross Yield %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.grossYield}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Net Yield %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.netYield}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Cash Deductions</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Property Expenses $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? 0 : p.propertyExpenses.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Rate %</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.interestRate}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Interest Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? 0 : p.interestPayments.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Principal Payments $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.principalPayments}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Pre-Tax Cash Flow p/a $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.preTaxCashFlowPA < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.preTaxCashFlowPA.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Pre-Tax Cash Flow p/w $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.preTaxCashFlowPW < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.preTaxCashFlowPW.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Non-Cash Deductions</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Depreciation $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.depreciation.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="sticky left-0 bg-muted/30 font-medium" colSpan={12}>Summary</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Total Deductions $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.totalDeductions.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Net Profit/Loss $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center ${p.netProfitLoss < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.netProfitLoss.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Tax Refund $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center text-green-600">{p.year === 0 ? '' : p.taxRefund.toLocaleString()}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="sticky left-0 bg-background font-medium">Land Tax $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className="text-center">{p.year === 0 ? '' : p.landTax}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/10">
                        <TableCell className="sticky left-0 bg-primary/10 font-bold">After-Tax Cash Flow p/a $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center font-bold ${p.afterTaxCashFlowPA < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.afterTaxCashFlowPA.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-primary/10">
                        <TableCell className="sticky left-0 bg-primary/10 font-bold">After-Tax Cash Flow p/w $</TableCell>
                        {projections.map(p => (
                          <TableCell key={p.year} className={`text-center font-bold ${p.afterTaxCashFlowPW < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {p.year === 0 ? '' : p.afterTaxCashFlowPW.toLocaleString()}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-sm text-muted-foreground">
            Data sourced from investment report manual overrides
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export to CSV
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
