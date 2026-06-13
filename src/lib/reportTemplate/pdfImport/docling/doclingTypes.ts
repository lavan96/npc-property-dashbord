/**
 * Typed view of the slice of Docling `DoclingDocument` JSON we consume.
 *
 * Docling emits a much richer schema; we intentionally narrow it to the fields
 * the adapter needs. Unknown fields are preserved as `unknown` so we don't
 * break if Docling adds new properties between versions.
 *
 * Reference: https://github.com/docling-project/docling/blob/main/docling_core/types/doc/document.py
 */

export type DoclingCoordOrigin = 'TOPLEFT' | 'BOTTOMLEFT';

export interface DoclingBBox {
  l: number;
  t: number;
  r: number;
  b: number;
  coord_origin?: DoclingCoordOrigin;
}

export interface DoclingProvenance {
  page_no: number;
  bbox: DoclingBBox;
  charspan?: [number, number];
}

export type DoclingTextLabel =
  | 'title'
  | 'section_header'
  | 'paragraph'
  | 'text'
  | 'caption'
  | 'list_item'
  | 'footnote'
  | 'page_header'
  | 'page_footer'
  | 'code'
  | 'formula'
  | string;

export interface DoclingTextItem {
  self_ref?: string;
  label?: DoclingTextLabel;
  text: string;
  prov?: DoclingProvenance[];
  /** Heading depth (1–6) when label is `section_header` / `title`. */
  level?: number;
  /** Some Docling versions emit per-item font hints. */
  font?: {
    family?: string;
    size?: number;
    weight?: number | string;
    color?: string;
    italic?: boolean;
  };
  confidence?: number;
}

export interface DoclingTableCell {
  text: string;
  row_span?: number;
  col_span?: number;
  start_row_offset_idx?: number;
  end_row_offset_idx?: number;
  start_col_offset_idx?: number;
  end_col_offset_idx?: number;
  column_header?: boolean;
  row_header?: boolean;
}

export interface DoclingTableData {
  num_rows: number;
  num_cols: number;
  table_cells?: DoclingTableCell[];
  grid?: DoclingTableCell[][];
}

export interface DoclingTableItem {
  self_ref?: string;
  prov?: DoclingProvenance[];
  data: DoclingTableData;
  caption?: string;
  /** Refs to caption text items linked by the parser. */
  captions?: Array<DoclingRef | string>;
  confidence?: number;
}

export interface DoclingPictureClassification {
  predicted_class?: string;
  /** Some Docling builds emit `predicted_classes: [{class_name, confidence}, …]`. */
  predicted_classes?: Array<{ class_name?: string; confidence?: number }>;
  confidence?: number;
}

export interface DoclingPictureAnnotation {
  /** e.g. 'description' (SmolVLM caption), 'classification'. */
  kind?: string;
  text?: string;
  provenance?: string; // model name
  confidence?: number;
}

export interface DoclingRef {
  $ref?: string;
  cref?: string;
}

export interface DoclingPictureItem {
  self_ref?: string;
  prov?: DoclingProvenance[];
  /** Storage path or data URI for the extracted image, when present. */
  image?: { uri?: string; mimetype?: string; size?: { width: number; height: number } };
  caption?: string;
  /** Refs to caption text items (Docling links captions explicitly when it can). */
  captions?: Array<DoclingRef | string>;
  /** Phase B: picture classifier output (chart, logo, photo, diagram, etc). */
  classification?: DoclingPictureClassification;
  /** Phase B: VLM-generated annotations (alt-text / description). */
  annotations?: DoclingPictureAnnotation[];
  confidence?: number;
}

export interface DoclingPageSize {
  width: number;
  height: number;
}

export interface DoclingPageInfo {
  page_no: number;
  size: DoclingPageSize;
  /** Optional rasterised reference (sidecar may attach a URL when /raster ran). */
  image_uri?: string;
}

export interface DoclingDocument {
  schema_version?: string;
  origin?: { filename?: string; mimetype?: string };
  pages?: Record<string, DoclingPageInfo>;
  texts?: DoclingTextItem[];
  tables?: DoclingTableItem[];
  pictures?: DoclingPictureItem[];
}

/** The envelope our `pdf-parse-service /parse` endpoint returns. */
export interface DoclingParseResponse {
  engine: 'docling';
  engine_version?: string;
  pages: Array<{ page_no: number; width: number; height: number }>;
  docling_document: DoclingDocument;
}

/** Optional /raster sidecar envelope (one entry per page). */
export interface DoclingRasterResponse {
  format: 'png' | 'jpeg';
  dpi: number;
  pages: Array<{ page_no: number; width: number; height: number; image_base64: string }>;
}

/** Convenience: page-keyed lookup of rasters. */
export type DoclingRasterByPage = Record<number, { width: number; height: number; dataUrl: string }>;
