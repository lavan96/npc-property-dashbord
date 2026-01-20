import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';

// This module provides functions to add borrowing capacity data to PDF exports

interface BorrowingCapacityData {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: 'green' | 'amber' | 'red';
  dtiRatio: number;
  stressTestedCapacity: number;
  assessmentRate: number;
  recommendations: string[];
  warnings: string[];
}

interface PDFDrawingContext {
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  marginLeft: number;
  contentWidth: number;
}

// Color constants
const NPC_GOLD = rgb(0.79, 0.64, 0.15);
const SUCCESS_COLOR = rgb(0.09, 0.64, 0.29);
const DANGER_COLOR = rgb(0.94, 0.27, 0.27);
const WARNING_COLOR = rgb(0.96, 0.62, 0.04);
const MUTED_COLOR = rgb(0.5, 0.5, 0.5);
const NPC_NAVY = rgb(0.05, 0.15, 0.30);

const formatCurrency = (value: number): string => {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('en-AU', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
};

const getBandColor = (band: string) => {
  switch (band) {
    case 'green': return SUCCESS_COLOR;
    case 'amber': return WARNING_COLOR;
    case 'red': return DANGER_COLOR;
    default: return MUTED_COLOR;
  }
};

const getBandLabel = (band: string): string => {
  switch (band) {
    case 'green': return 'STRONG';
    case 'amber': return 'MODERATE';
    case 'red': return 'LIMITED';
    default: return 'UNKNOWN';
  }
};

/**
 * Draws the borrowing capacity section header
 */
export function drawBorrowingCapacitySectionHeader(
  ctx: PDFDrawingContext,
  yPos: number
): number {
  const { page, boldFont, marginLeft, contentWidth } = ctx;
  
  // Section header with gold accent bar
  page.drawRectangle({
    x: marginLeft,
    y: yPos - 5,
    width: 4,
    height: 18,
    color: NPC_GOLD,
  });
  
  page.drawText('Borrowing Capacity Assessment', {
    x: marginLeft + 12,
    y: yPos,
    size: 14,
    font: boldFont,
    color: NPC_NAVY,
  });
  
  return yPos - 35;
}

/**
 * Draws the main borrowing capacity KPI boxes
 */
export function drawBorrowingCapacityKPIs(
  ctx: PDFDrawingContext,
  data: BorrowingCapacityData,
  yPos: number
): number {
  const { page, regularFont, boldFont, marginLeft, contentWidth } = ctx;
  
  const boxWidth = (contentWidth - 20) / 3;
  const boxHeight = 65; // Increased height for "Estimate" label
  const boxPadding = 8;
  
  // Box 1: Borrowing Capacity
  page.drawRectangle({
    x: marginLeft,
    y: yPos - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });
  
  page.drawText('BORROWING CAPACITY', {
    x: marginLeft + boxPadding,
    y: yPos - 16,
    size: 7,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  page.drawText(formatCurrency(data.borrowingCapacity), {
    x: marginLeft + boxPadding,
    y: yPos - 36,
    size: 16,
    font: boldFont,
    color: NPC_NAVY,
  });
  
  // Add "Estimate" label below the figure
  page.drawText('Estimate', {
    x: marginLeft + boxPadding,
    y: yPos - 52,
    size: 8,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  // Box 2: Monthly Surplus
  const box2X = marginLeft + boxWidth + 10;
  const surplusColor = data.monthlySurplus >= 0 ? SUCCESS_COLOR : DANGER_COLOR;
  
  page.drawRectangle({
    x: box2X,
    y: yPos - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });
  
  page.drawText('MONTHLY SURPLUS', {
    x: box2X + boxPadding,
    y: yPos - 16,
    size: 7,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  page.drawText(formatCurrency(data.monthlySurplus), {
    x: box2X + boxPadding,
    y: yPos - 36,
    size: 16,
    font: boldFont,
    color: surplusColor,
  });
  
  // Box 3: Serviceability Band
  const box3X = marginLeft + (boxWidth + 10) * 2;
  const bandColor = getBandColor(data.serviceabilityBand);
  
  page.drawRectangle({
    x: box3X,
    y: yPos - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });
  
  page.drawText('SERVICEABILITY', {
    x: box3X + boxPadding,
    y: yPos - 16,
    size: 7,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  // Draw colored badge
  const badgeLabel = getBandLabel(data.serviceabilityBand);
  const badgeWidth = boldFont.widthOfTextAtSize(badgeLabel, 10) + 16;
  
  page.drawRectangle({
    x: box3X + boxPadding,
    y: yPos - 44,
    width: badgeWidth,
    height: 20,
    color: bandColor,
    borderColor: bandColor,
    borderWidth: 0,
  });
  
  page.drawText(badgeLabel, {
    x: box3X + boxPadding + 8,
    y: yPos - 38,
    size: 10,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  
  return yPos - boxHeight - 15;
}

/**
 * Draws secondary metrics (DTI, stress-tested, assessment rate)
 */
export function drawSecondaryMetrics(
  ctx: PDFDrawingContext,
  data: BorrowingCapacityData,
  yPos: number
): number {
  const { page, regularFont, boldFont, marginLeft, contentWidth } = ctx;
  
  const colWidth = contentWidth / 3;
  
  // DTI Ratio
  const dtiColor = data.dtiRatio < 6 ? SUCCESS_COLOR : data.dtiRatio < 8 ? WARNING_COLOR : DANGER_COLOR;
  
  page.drawText('DTI Ratio:', {
    x: marginLeft,
    y: yPos,
    size: 9,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  page.drawText(`${data.dtiRatio.toFixed(1)}x`, {
    x: marginLeft + 55,
    y: yPos,
    size: 9,
    font: boldFont,
    color: dtiColor,
  });
  
  // Stress Tested
  page.drawText('Stress Tested:', {
    x: marginLeft + colWidth,
    y: yPos,
    size: 9,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  page.drawText(formatCurrency(data.stressTestedCapacity), {
    x: marginLeft + colWidth + 70,
    y: yPos,
    size: 9,
    font: boldFont,
    color: NPC_NAVY,
  });
  
  // Assessment Rate
  page.drawText('Assessment Rate:', {
    x: marginLeft + colWidth * 2,
    y: yPos,
    size: 9,
    font: regularFont,
    color: MUTED_COLOR,
  });
  
  page.drawText(`${data.assessmentRate.toFixed(2)}%`, {
    x: marginLeft + colWidth * 2 + 85,
    y: yPos,
    size: 9,
    font: boldFont,
    color: NPC_NAVY,
  });
  
  return yPos - 25;
}

/**
 * Draws recommendations list
 */
export function drawRecommendations(
  ctx: PDFDrawingContext,
  recommendations: string[],
  yPos: number
): number {
  const { page, regularFont, boldFont, marginLeft, contentWidth } = ctx;
  
  if (recommendations.length === 0) return yPos;
  
  page.drawText('Recommendations:', {
    x: marginLeft,
    y: yPos,
    size: 10,
    font: boldFont,
    color: NPC_NAVY,
  });
  
  yPos -= 18;
  
  for (const rec of recommendations.slice(0, 3)) {
    page.drawText('•', {
      x: marginLeft,
      y: yPos,
      size: 9,
      font: regularFont,
      color: SUCCESS_COLOR,
    });
    
    // Truncate if too long
    const displayText = rec.length > 80 ? rec.slice(0, 77) + '...' : rec;
    
    page.drawText(displayText, {
      x: marginLeft + 12,
      y: yPos,
      size: 9,
      font: regularFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    
    yPos -= 14;
  }
  
  return yPos - 10;
}

/**
 * Draws warnings list
 */
export function drawWarnings(
  ctx: PDFDrawingContext,
  warnings: string[],
  yPos: number
): number {
  const { page, regularFont, boldFont, marginLeft, contentWidth } = ctx;
  
  if (warnings.length === 0) return yPos;
  
  page.drawText('Warnings:', {
    x: marginLeft,
    y: yPos,
    size: 10,
    font: boldFont,
    color: DANGER_COLOR,
  });
  
  yPos -= 18;
  
  for (const warning of warnings.slice(0, 2)) {
    page.drawText('⚠', {
      x: marginLeft,
      y: yPos,
      size: 9,
      font: regularFont,
      color: WARNING_COLOR,
    });
    
    const displayText = warning.length > 80 ? warning.slice(0, 77) + '...' : warning;
    
    page.drawText(displayText, {
      x: marginLeft + 12,
      y: yPos,
      size: 9,
      font: regularFont,
      color: rgb(0.3, 0.2, 0.1),
    });
    
    yPos -= 14;
  }
  
  return yPos - 10;
}

/**
 * Complete function to draw the entire borrowing capacity section
 */
export function drawBorrowingCapacitySection(
  ctx: PDFDrawingContext,
  data: BorrowingCapacityData | null,
  yPos: number
): number {
  if (!data) {
    return yPos; // Skip if no data
  }
  
  yPos = drawBorrowingCapacitySectionHeader(ctx, yPos);
  yPos = drawBorrowingCapacityKPIs(ctx, data, yPos);
  yPos = drawSecondaryMetrics(ctx, data, yPos);
  yPos = drawRecommendations(ctx, data.recommendations, yPos);
  yPos = drawWarnings(ctx, data.warnings, yPos);
  
  return yPos - 20; // Extra spacing after section
}

// Export types for use in PDF generator
export type { BorrowingCapacityData, PDFDrawingContext };
