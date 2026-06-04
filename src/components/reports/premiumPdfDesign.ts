export type PdfDesignPreset = "signature" | "editorial_navy" | "minimal_ink" | "high_contrast";
export type PdfDensity = "compact" | "balanced" | "spacious";
export type PdfChapterStyle = "classic" | "opener_band" | "minimal";
export type PdfTableStyle = "classic" | "ledger" | "minimal";
export type PdfCoverStyle = "image" | "title_overlay" | "editorial";

export interface PdfDesignOptions {
  preset: PdfDesignPreset;
  density: PdfDensity;
  chapterStyle: PdfChapterStyle;
  tableStyle: PdfTableStyle;
  coverStyle: PdfCoverStyle;
  bodyScale: number;
  visualIntensity: number;
  showDropCaps: boolean;
  showSectionNumbers: boolean;
  justifyText: boolean;
}

export const DEFAULT_PDF_DESIGN_OPTIONS: PdfDesignOptions = {
  preset: "signature",
  density: "balanced",
  chapterStyle: "classic",
  tableStyle: "classic",
  coverStyle: "title_overlay",
  bodyScale: 100,
  visualIntensity: 70,
  showDropCaps: true,
  showSectionNumbers: true,
  justifyText: true,
};
