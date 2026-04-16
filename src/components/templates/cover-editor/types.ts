export interface OverlayElement {
  id: string;
  type: 'text' | 'image';
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage
  height: number; // percentage
  rotation: number;
  opacity: number;
  // Text props
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  // Image props
  imageUrl?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
}

export interface CoverPageOverlay {
  id: string;
  name: string;
  report_type: string;
  background_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  overlay_elements: OverlayElement[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const REPORT_TYPE_OPTIONS = [
  { value: 'investment', label: 'Investment Report' },
  { value: 'qa', label: 'Q&A Export' },
  { value: 'cashflow', label: 'Cash Flow' },
  { value: 'portfolio', label: 'Portfolio Analysis' },
  { value: 'borrowing_capacity', label: 'Borrowing Capacity' },
  { value: 'vownet', label: 'Vownet / Client Form' },
  { value: 'suburb', label: 'Suburb Analysis' },
  { value: 'postcode', label: 'Postcode Analysis' },
  { value: 'statewide', label: 'Statewide Analysis' },
  { value: 'comparison', label: 'Comparison Report' },
] as const;

export const FONT_FAMILIES = [
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Arial',
  'Courier New',
  'Playfair Display',
  'Cinzel',
  'Montserrat',
  'Open Sans',
  'Roboto',
] as const;

// Use the same primary cover page for all report types by default
const PRIMARY_COVER = '/templates/npc-portfolio-cover-new.jpg';

export const DEFAULT_BACKGROUND_IMAGES: Record<string, string> = {
  investment: PRIMARY_COVER,
  qa: PRIMARY_COVER,
  cashflow: PRIMARY_COVER,
  portfolio: PRIMARY_COVER,
  borrowing_capacity: PRIMARY_COVER,
  vownet: PRIMARY_COVER,
  suburb: PRIMARY_COVER,
  postcode: PRIMARY_COVER,
  statewide: PRIMARY_COVER,
  comparison: PRIMARY_COVER,
};
