export interface TemplateBindingContext {
  data: Record<string, any>;
  meta: { reportId: string; reportType: string; variant: string | null; tier: string | null };
}

export interface BrandContext {
  tokens?: Record<string, any>;
  logoUrl?: string | null;
}

export interface RoutingContext {
  reportId: string;
  reportType: string;
  variant: string | null;
  tier: string | null;
  title?: string | null;
  fileLabel?: string | null;
  sourceTable?: string;
  legacyFallback?: LegacyFallbackDescriptor;
}

export interface LegacyFallbackDescriptor {
  label: string;
  route?: string;
  reason?: string;
}

export interface ReportTemplateAdapter {
  reportType: string;
  label: string;
  supportsProduction: boolean;
  samplePresetIds?: string[];
  legacyFallback?: LegacyFallbackDescriptor;
  resolveRoutingContext(input: { reportId: string }): Promise<RoutingContext | null>;
  buildBindingContext(input: { reportId: string; brand?: BrandContext | null }): Promise<TemplateBindingContext | null>;
}
