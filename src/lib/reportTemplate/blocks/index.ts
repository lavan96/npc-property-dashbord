/**
 * Block registry: each block type knows how to draw itself with jsPDF.
 *
 * To add a new block type:
 *   1. Create a new file in this folder exporting a `BlockRenderer`.
 *   2. Register it in BLOCK_RENDERERS below.
 *   3. Add a default-props factory + inspector schema to BLOCK_DEFS.
 */
import type { jsPDF } from 'jspdf';
import type { Block } from '../templateSchema';
import type { ResolveContext } from '../bindingResolver';
import { drawDisclaimerBlock } from './disclaimer';
import { drawHeroBlock } from './hero';
import { drawKpiGridBlock } from './kpiGrid';
import { drawDataTableBlock } from './dataTable';
import { drawChartBlock } from './chart';
import { drawImageBlock } from './imageBlock';
import { drawTextBlock } from './textBlock';
import { drawFooterBlock } from './footer';
import { drawCoverBlock } from './cover';
import { drawDividerBlock } from './divider';
import { drawCalloutBlock } from './callout';
import { drawTwoColumnBlock } from './twoColumn';
import { drawGalleryBlock } from './gallery';
import { drawPageNumberBlock } from './pageNumber';
import { drawSpacerBlock } from './spacer';
import { drawQrBlock } from './qrCode';
import { drawBadgeListBlock } from './badgeList';
import { drawTocBlock } from './toc';
import { drawSignatureBlock } from './signature';
import { drawSlotBlock } from './slot';
import { drawScorecardBlock } from './scorecard';
import { drawRiskRegisterBlock } from './riskRegister';
import { drawInfraTimelineBlock } from './infraTimeline';
import { drawAmenityMatrixBlock } from './amenityMatrix';
import { drawPlanningTableBlock } from './planningTable';
import { drawDDChecklistBlock } from './ddChecklist';
import { drawDecisionBoxBlock } from './decisionBox';
import { drawStrengthsWatchBlock } from './strengthsWatch';

export interface BlockRenderContext extends ResolveContext {
  doc: jsPDF;
  page: { width: number; height: number };
  /** All visible pages in render order — used by TOC and similar blocks. */
  pages?: Array<{ name: string; id: string }>;
  /** Reusable slots (Header/Footer/etc) keyed by slotKey. */
  slots?: Record<string, Block>;
  /** Internal: draw a single overlay (provided by pdfRenderer). */
  _drawOverlay?: (overlay: import('../templateSchema').Overlay, ctx: BlockRenderContext) => void;
}

export type BlockRenderer = (block: Block, ctx: BlockRenderContext) => void;

export const BLOCK_RENDERERS: Record<string, BlockRenderer> = {
  disclaimer: drawDisclaimerBlock,
  hero: drawHeroBlock,
  'kpi-grid': drawKpiGridBlock,
  'data-table': drawDataTableBlock,
  chart: drawChartBlock,
  image: drawImageBlock,
  'text-block': drawTextBlock,
  footer: drawFooterBlock,
  cover: drawCoverBlock,
  divider: drawDividerBlock,
  callout: drawCalloutBlock,
  'two-column': drawTwoColumnBlock,
  gallery: drawGalleryBlock,
  'page-number': drawPageNumberBlock,
  spacer: drawSpacerBlock,
  qr: drawQrBlock,
  'badge-list': drawBadgeListBlock,
  toc: drawTocBlock,
  signature: drawSignatureBlock,
  slot: drawSlotBlock,
  // Compass-40 visual components (Phase 4)
  scorecard: drawScorecardBlock,
  'risk-register': drawRiskRegisterBlock,
  'infra-timeline': drawInfraTimelineBlock,
  'amenity-matrix': drawAmenityMatrixBlock,
  'planning-table': drawPlanningTableBlock,
  'dd-checklist': drawDDChecklistBlock,
  'decision-box': drawDecisionBoxBlock,
  'strengths-watch': drawStrengthsWatchBlock,
};

export function getBlockRenderer(type: string): BlockRenderer | null {
  return BLOCK_RENDERERS[type] ?? null;
}

// ─── Inspector schemas + defaults ────────────────────────────────────────────
export type BlockField =
  | { kind: 'bindable'; key: string; label: string; multiline?: boolean; placeholder?: string }
  | { kind: 'number'; key: string; label: string; step?: number; min?: number; max?: number }
  | { kind: 'color'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: string[] }
  | { kind: 'list-strings'; key: string; label: string }
  | { kind: 'list-rows'; key: string; label: string };

export interface BlockDef {
  type: string;
  label: string;
  defaultProps: () => Record<string, unknown>;
  fields: BlockField[];
}

export const BLOCK_DEFS: Record<string, BlockDef> = {
  cover: {
    type: 'cover',
    label: 'Cover page',
    defaultProps: () => ({
      eyebrow: 'Investment Report',
      title: '{{property.address}}',
      subtitle: 'Prepared for {{client.name}}',
      footnote: '{{reportType | upper}}',
      bg: 'token:bg',
      accent: 'token:primary',
      titleSize: 40,
    }),
    fields: [
      { kind: 'bindable', key: 'eyebrow', label: 'Eyebrow' },
      { kind: 'bindable', key: 'title', label: 'Title', multiline: true },
      { kind: 'bindable', key: 'subtitle', label: 'Subtitle' },
      { kind: 'bindable', key: 'footnote', label: 'Footnote' },
      { kind: 'bindable', key: 'imageUrl', label: 'Background image URL' },
      { kind: 'color', key: 'bg', label: 'Background' },
      { kind: 'color', key: 'accent', label: 'Accent' },
      { kind: 'number', key: 'titleSize', label: 'Title size', min: 10, max: 80 },
    ],
  },
  hero: {
    type: 'hero',
    label: 'Hero banner',
    defaultProps: () => ({
      title: '{{property.address}}',
      subtitle: '{{property.suburb}}',
      align: 'left',
      x: 0, y: 0, width: 595, height: 280,
      titleSize: 28,
      subtitleSize: 14,
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'bindable', key: 'subtitle', label: 'Subtitle' },
      { kind: 'bindable', key: 'imageUrl', label: 'Background image URL' },
      { kind: 'color', key: 'tint', label: 'Tint' },
      { kind: 'select', key: 'align', label: 'Align', options: ['left', 'center', 'right'] },
      { kind: 'number', key: 'x', label: 'X' },
      { kind: 'number', key: 'y', label: 'Y' },
      { kind: 'number', key: 'width', label: 'Width' },
      { kind: 'number', key: 'height', label: 'Height' },
    ],
  },
  'kpi-grid': {
    type: 'kpi-grid',
    label: 'KPI grid',
    defaultProps: () => ({
      x: 24, y: 320, width: 547, height: 90, columns: 3, gap: 12,
      items: [
        { label: 'Weekly rent', value: '{{financials.weeklyRent | currency}}' },
        { label: 'Purchase price', value: '{{financials.purchasePrice | currency}}' },
        { label: 'Tier', value: '{{tier | upper}}' },
      ],
    }),
    fields: [
      { kind: 'number', key: 'columns', label: 'Columns', min: 1, max: 6 },
      { kind: 'number', key: 'gap', label: 'Gap (pt)' },
      { kind: 'color', key: 'tileBg', label: 'Tile bg' },
      { kind: 'color', key: 'accent', label: 'Accent' },
    ],
  },
  'data-table': {
    type: 'data-table',
    label: 'Data table',
    defaultProps: () => ({
      x: 24, y: 440, width: 547, rowHeight: 22,
      headers: ['Field', 'Value'],
      rows: [
        { cells: ['Address', '{{property.address}}'] },
        { cells: ['Suburb', '{{property.suburb}}'] },
        { cells: ['Weekly rent', '{{financials.weeklyRent | currency}}'] },
      ],
    }),
    fields: [
      { kind: 'list-strings', key: 'headers', label: 'Headers' },
      { kind: 'list-rows', key: 'rows', label: 'Rows' },
      { kind: 'number', key: 'rowHeight', label: 'Row height' },
      { kind: 'color', key: 'headerBg', label: 'Header bg' },
    ],
  },
  chart: {
    type: 'chart',
    label: 'Chart (URL)',
    defaultProps: () => ({
      x: 24, y: 320, width: 547, height: 240,
      chartUrl:
        'https://quickchart.io/chart?c={type:%27bar%27,data:{labels:[%27Q1%27,%27Q2%27,%27Q3%27,%27Q4%27],datasets:[{label:%27Yield%27,data:[3.2,3.5,3.8,4.1]}]}}',
      caption: 'Sample chart — replace URL with your QuickChart link.',
    }),
    fields: [
      { kind: 'bindable', key: 'chartUrl', label: 'Chart URL' },
      { kind: 'bindable', key: 'caption', label: 'Caption' },
    ],
  },
  image: {
    type: 'image',
    label: 'Image block',
    defaultProps: () => ({
      x: 24, y: 320, width: 547, height: 220,
      src: '{{property.imageUrl}}',
      caption: '',
    }),
    fields: [
      { kind: 'bindable', key: 'src', label: 'Image URL' },
      { kind: 'bindable', key: 'caption', label: 'Caption' },
    ],
  },
  'text-block': {
    type: 'text-block',
    label: 'Text block',
    defaultProps: () => ({
      x: 24, y: 320, width: 547,
      heading: 'Section heading',
      body: 'Body copy supports {{property.address}} bindings and \\nline breaks.',
      headingSize: 16,
      bodySize: 10,
    }),
    fields: [
      { kind: 'bindable', key: 'heading', label: 'Heading' },
      { kind: 'bindable', key: 'body', label: 'Body', multiline: true },
      { kind: 'number', key: 'headingSize', label: 'Heading size' },
      { kind: 'number', key: 'bodySize', label: 'Body size' },
      { kind: 'color', key: 'color', label: 'Body color' },
    ],
  },
  footer: {
    type: 'footer',
    label: 'Footer bar',
    defaultProps: () => ({
      text: '{{client.name}} — {{reportType}}',
      bg: 'token:bg',
      color: 'token:muted',
      align: 'center',
      height: 28,
    }),
    fields: [
      { kind: 'bindable', key: 'text', label: 'Text' },
      { kind: 'color', key: 'bg', label: 'Background' },
      { kind: 'color', key: 'color', label: 'Text color' },
      { kind: 'select', key: 'align', label: 'Align', options: ['left', 'center', 'right'] },
      { kind: 'number', key: 'height', label: 'Height' },
    ],
  },
  disclaimer: {
    type: 'disclaimer',
    label: 'Disclaimer page',
    defaultProps: () => ({
      companyName: 'Property Consulting',
      website: 'example.com.au',
      email: 'hello@example.com.au',
      phone: '+61 0 0000 0000',
      address: 'Sydney, NSW 2000',
      abn: '00 000 000 000',
      disclaimerText:
        'This document is general information only and does not constitute financial advice.',
    }),
    fields: [
      { kind: 'bindable', key: 'companyName', label: 'Company name' },
      { kind: 'bindable', key: 'website', label: 'Website' },
      { kind: 'bindable', key: 'email', label: 'Email' },
      { kind: 'bindable', key: 'phone', label: 'Phone' },
      { kind: 'bindable', key: 'address', label: 'Address' },
      { kind: 'bindable', key: 'abn', label: 'ABN' },
      { kind: 'bindable', key: 'disclaimerText', label: 'Disclaimer text', multiline: true },
    ],
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    defaultProps: () => ({ x: 24, y: 200, width: 547, thickness: 1, color: 'token:muted', style: 'solid' }),
    fields: [
      { kind: 'number', key: 'y', label: 'Y' },
      { kind: 'number', key: 'width', label: 'Width' },
      { kind: 'number', key: 'thickness', label: 'Thickness' },
      { kind: 'color', key: 'color', label: 'Color' },
      { kind: 'select', key: 'style', label: 'Style', options: ['solid', 'dashed', 'dotted'] },
    ],
  },
  callout: {
    type: 'callout',
    label: 'Callout',
    defaultProps: () => ({
      x: 24, y: 320, width: 547,
      variant: 'info',
      title: 'Heads up',
      body: 'Use callouts to highlight key takeaways or warnings.',
    }),
    fields: [
      { kind: 'select', key: 'variant', label: 'Variant', options: ['info', 'success', 'warning', 'danger', 'quote'] },
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'bindable', key: 'body', label: 'Body', multiline: true },
      { kind: 'color', key: 'accent', label: 'Accent' },
    ],
  },
  'two-column': {
    type: 'two-column',
    label: 'Two-column',
    defaultProps: () => ({
      x: 24, y: 320, width: 547, gap: 16, ratio: 0.5,
      leftHeading: 'Left heading',
      leftBody: 'Left column body copy.',
      rightHeading: 'Right heading',
      rightBody: 'Right column body copy.',
    }),
    fields: [
      { kind: 'bindable', key: 'leftHeading', label: 'Left heading' },
      { kind: 'bindable', key: 'leftBody', label: 'Left body', multiline: true },
      { kind: 'bindable', key: 'rightHeading', label: 'Right heading' },
      { kind: 'bindable', key: 'rightBody', label: 'Right body', multiline: true },
      { kind: 'number', key: 'ratio', label: 'Left ratio (0-1)', step: 0.05, min: 0.1, max: 0.9 },
      { kind: 'number', key: 'gap', label: 'Gap' },
    ],
  },
  gallery: {
    type: 'gallery',
    label: 'Image gallery',
    defaultProps: () => ({
      x: 24, y: 320, width: 547, height: 260, columns: 3, gap: 8,
      items: [
        { src: '{{property.imageUrl}}', caption: 'Front' },
        { src: '{{property.imageUrl}}', caption: 'Side' },
        { src: '{{property.imageUrl}}', caption: 'Rear' },
      ],
    }),
    fields: [
      { kind: 'number', key: 'columns', label: 'Columns', min: 1, max: 6 },
      { kind: 'number', key: 'gap', label: 'Gap' },
    ],
  },
  'page-number': {
    type: 'page-number',
    label: 'Page number',
    defaultProps: () => ({
      text: 'Page {{pageNumber}} of {{pageCount}}',
      align: 'center',
      size: 8,
    }),
    fields: [
      { kind: 'bindable', key: 'text', label: 'Text' },
      { kind: 'select', key: 'align', label: 'Align', options: ['left', 'center', 'right'] },
      { kind: 'number', key: 'size', label: 'Size' },
      { kind: 'color', key: 'color', label: 'Color' },
    ],
  },
  spacer: {
    type: 'spacer',
    label: 'Spacer',
    defaultProps: () => ({ x: 24, y: 200, width: 547, height: 24, showGuide: false }),
    fields: [
      { kind: 'number', key: 'y', label: 'Y' },
      { kind: 'number', key: 'height', label: 'Height' },
      { kind: 'select', key: 'showGuide', label: 'Show guide', options: ['true', 'false'] },
    ],
  },
  qr: {
    type: 'qr',
    label: 'QR code',
    defaultProps: () => ({
      x: 24, y: 320, size: 120,
      data: 'https://example.com',
      caption: 'Scan to learn more',
    }),
    fields: [
      { kind: 'bindable', key: 'data', label: 'Encoded data / URL' },
      { kind: 'number', key: 'size', label: 'Size (pt)' },
      { kind: 'bindable', key: 'caption', label: 'Caption' },
      { kind: 'color', key: 'color', label: 'Caption color' },
    ],
  },
  'badge-list': {
    type: 'badge-list',
    label: 'Badge list',
    defaultProps: () => ({
      x: 24, y: 320, width: 547,
      items: ['Investor ready', 'High yield', 'Sub-3% vacancy'],
      bg: 'token:primary',
      color: '#FFFFFF',
    }),
    fields: [
      { kind: 'list-strings', key: 'items', label: 'Badges' },
      { kind: 'color', key: 'bg', label: 'Background' },
      { kind: 'color', key: 'color', label: 'Text color' },
      { kind: 'number', key: 'fontSize', label: 'Font size' },
      { kind: 'number', key: 'radius', label: 'Radius' },
    ],
  },
  toc: {
    type: 'toc',
    label: 'Table of contents',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Contents',
      titleSize: 22,
      size: 11,
      lineHeight: 18,
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'number', key: 'titleSize', label: 'Title size' },
      { kind: 'number', key: 'size', label: 'Entry size' },
      { kind: 'number', key: 'lineHeight', label: 'Line height' },
      { kind: 'color', key: 'color', label: 'Entry color' },
      { kind: 'color', key: 'indexColor', label: 'Index color' },
    ],
  },
  signature: {
    type: 'signature',
    label: 'Signature',
    defaultProps: () => ({
      x: 24, y: 720, width: 240,
      signerName: '{{client.name}}',
      signerRole: 'Buyer signature',
      dateLabel: 'Date: ____________',
    }),
    fields: [
      { kind: 'bindable', key: 'signerName', label: 'Name' },
      { kind: 'bindable', key: 'signerRole', label: 'Role / label' },
      { kind: 'bindable', key: 'dateLabel', label: 'Date label' },
      { kind: 'number', key: 'width', label: 'Line width' },
      { kind: 'color', key: 'lineColor', label: 'Line color' },
    ],
  },
  slot: {
    type: 'slot',
    label: 'Slot reference',
    defaultProps: () => ({ slotKey: 'header' }),
    fields: [
      { kind: 'bindable', key: 'slotKey', label: 'Slot key (e.g. header, footer)' },
    ],
  },
  // ─── Compass-40 visual components (Phase 4) ────────────────────────────────
  scorecard: {
    type: 'scorecard',
    label: 'Macro Scorecard',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Macro Investment Scorecard',
      items: [
        { category: 'Capital growth outlook', rating: 'Strong',   note: '10-yr CAGR above national median.' },
        { category: 'Rental demand',          rating: 'Strong',   note: 'Vacancy under 2%.' },
        { category: 'Infrastructure pipeline',rating: 'Moderate', note: 'Funded short-term projects.' },
        { category: 'Demographics',           rating: 'Strong',   note: 'Family-skew, growing income.' },
        { category: 'Employment depth',       rating: 'Moderate', note: 'Diverse but concentrated.' },
        { category: 'Planning risk',          rating: 'Watch',    note: 'Active rezoning nearby.' },
        { category: 'Environmental risk',     rating: 'Moderate', note: 'Climate exposure noted.' },
        { category: 'Liquidity',              rating: 'Strong',   note: 'Days-on-market below median.' },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Categories' },
      { kind: 'color', key: 'accent', label: 'Accent' },
    ],
  },
  'risk-register': {
    type: 'risk-register',
    label: 'Risk Register',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Risk Register',
      items: [
        { risk: 'Flood (1-in-100)',  rating: 'Medium', confidence: 'Verified',   why: 'Property within mapped flood overlay.', ddAction: 'Order flood-risk certificate.' },
        { risk: 'Bushfire',          rating: 'Low',    confidence: 'Verified',   why: 'Outside BAL zones.',                    ddAction: 'Confirm at council.' },
        { risk: 'Heat / climate',    rating: 'Medium', confidence: 'Indicative', why: 'Rising summer extremes.',                ddAction: 'Check insulation & cooling.' },
        { risk: 'Crime — property',  rating: 'Low',    confidence: 'Verified',   why: 'Below LGA average.',                     ddAction: 'Review 12-mo BOCSAR data.' },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Risk items' },
    ],
  },
  'infra-timeline': {
    type: 'infra-timeline',
    label: 'Infrastructure Timeline',
    defaultProps: () => ({
      x: 24, y: 80, width: 547, height: 220,
      title: 'Infrastructure & Growth Pipeline',
      items: [
        { phase: 'Existing', label: 'Train station upgrade',     year: 2024, confidence: 'Verified' },
        { phase: 'Short',    label: 'New primary school',        year: 2026, confidence: 'Planned' },
        { phase: 'Medium',   label: 'Town-centre revitalisation', year: 2029, confidence: 'Planned' },
        { phase: 'Long',     label: 'Light-rail extension',      year: 2032, confidence: 'Indicative' },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Pipeline items' },
      { kind: 'number', key: 'height', label: 'Height' },
    ],
  },
  'amenity-matrix': {
    type: 'amenity-matrix',
    label: 'Amenity Matrix',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Amenity & Livability Matrix',
      items: [
        { amenity: 'Schools',    current: '3 within 2km', future: '+1 by 2027',         relevance: 'Drives family demand.' },
        { amenity: 'Transport',  current: 'Bus + train',  future: 'Light-rail station',  relevance: 'Improves liquidity & rent.' },
        { amenity: 'Retail',     current: 'Local strip',  future: 'Town-centre revamp', relevance: 'Lifestyle premium.' },
        { amenity: 'Healthcare', current: 'GP + clinic',  future: 'No change planned',   relevance: 'Adequate for owner-occ.' },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Amenities' },
    ],
  },
  'planning-table': {
    type: 'planning-table',
    label: 'Planning Action Table',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Zoning & Planning — Action Table',
      items: [
        { item: 'Rezoning to R3',  status: 'Lodged',   relevance: 'Could lift land value & density.', action: 'Track council decision Q3.' },
        { item: 'Heritage overlay', status: 'Approved', relevance: 'Restricts external works.',         action: 'Plan compliant cosmetic uplift.' },
        { item: 'DA for adjacent',  status: 'Pending',  relevance: 'May change view / amenity.',         action: 'Object or monitor depending on use.' },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Planning items' },
    ],
  },
  'dd-checklist': {
    type: 'dd-checklist',
    label: 'DD Checklist',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      title: 'Due-Diligence Checklist',
      items: [
        { action: 'Order Section 32 / contract review',  owner: 'Solicitor',     timing: 'Week 1', done: false },
        { action: 'Building & pest inspection',          owner: 'Buyer',         timing: 'Week 1', done: false },
        { action: 'Flood-risk certificate',              owner: 'Buyer agent',   timing: 'Week 2', done: false },
        { action: 'Finance pre-approval refresh',        owner: 'Broker',        timing: 'Week 2', done: false },
        { action: 'Rental appraisal x 2',                owner: 'Property mgr.', timing: 'Week 2', done: false },
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'title', label: 'Title' },
      { kind: 'list-rows', key: 'items', label: 'Checklist items' },
    ],
  },
  'decision-box': {
    type: 'decision-box',
    label: 'Decision Box (What this means)',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      heading: 'What this means',
      body: 'Short, plain-English takeaway. Max 60 words. Use one per section to summarise the investor implication.',
    }),
    fields: [
      { kind: 'bindable', key: 'heading', label: 'Heading' },
      { kind: 'bindable', key: 'body', label: 'Body (≤60 words)', multiline: true },
      { kind: 'color', key: 'accent', label: 'Accent' },
    ],
  },
  'strengths-watch': {
    type: 'strengths-watch',
    label: 'Strengths & Watch Points',
    defaultProps: () => ({
      x: 24, y: 80, width: 547,
      strengthsTitle: 'Strengths',
      watchTitle: 'Watch Points',
      strengths: [
        'Sub-2% vacancy and growing tenant pool.',
        'Funded transport upgrade within 5 years.',
        'Family-skew demographic supporting demand.',
      ],
      watch: [
        'Active rezoning on adjacent lot.',
        'Climate / heat exposure rising.',
        'Single-employer concentration in suburb.',
      ],
    }),
    fields: [
      { kind: 'bindable', key: 'strengthsTitle', label: 'Strengths title' },
      { kind: 'bindable', key: 'watchTitle', label: 'Watch title' },
      { kind: 'list-strings', key: 'strengths', label: 'Strengths' },
      { kind: 'list-strings', key: 'watch', label: 'Watch points' },
    ],
  },
  free: {
    type: 'free',
    label: 'Free / overlays',
    defaultProps: () => ({}),
    fields: [],
  },
};

export function getBlockDef(type: string): BlockDef | null {
  return BLOCK_DEFS[type] ?? null;
}
