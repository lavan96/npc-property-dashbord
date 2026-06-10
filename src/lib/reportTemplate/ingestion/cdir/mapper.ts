import { parseTemplate, type Block, type Overlay, type ReportTemplate } from '../../templateSchema';
import type { CdirDocument, CdirLayer, CdirPage } from './schema';
import { parseCdirDocument } from './validate';

export interface CdirToTemplateOptions {
  templateName?: string;
  includeTraceLayers?: boolean;
}

function layerBounds(layer: CdirLayer) {
  return {
    x: layer.bounds.x,
    y: layer.bounds.y,
    width: layer.bounds.width,
    height: layer.bounds.height,
    rotation: layer.bounds.rotation ?? 0,
    opacity: layer.opacity ?? 1,
    zIndex: layer.zIndex,
    name: layer.name,
  };
}

function assetUrl(doc: CdirDocument, assetId?: string): string | undefined {
  if (!assetId) return undefined;
  const asset = doc.assets.find((item) => item.id === assetId);
  return asset?.url ?? asset?.dataUrl;
}

function layerToOverlay(layer: Exclude<CdirLayer, { kind: 'group' }>, doc: CdirDocument, groupId?: string): Overlay | null {
  const base = { id: layer.id, ...layerBounds(layer), ...(groupId ? { groupId } : {}) };
  if (layer.kind === 'text') {
    const firstRun = layer.runs?.[0];
    return {
      ...base,
      type: 'text',
      content: layer.text,
      fontFamily: layer.fontFamily ?? firstRun?.fontFamily ?? 'Helvetica',
      fontSize: layer.fontSize ?? firstRun?.fontSize ?? Math.max(6, Math.round(layer.bounds.height * 0.72)),
      fontWeight: layer.fontWeight === 'bold' || Number(layer.fontWeight) >= 600 ? 'bold' : 'normal',
      fontWeightNumeric: typeof layer.fontWeight === 'number' ? layer.fontWeight : undefined,
      fontStyle: layer.fontStyle ?? firstRun?.fontStyle ?? 'normal',
      color: layer.color ?? firstRun?.color ?? '#000000',
      align: layer.align ?? 'left',
      lineHeight: layer.lineHeight ?? 1.2,
      letterSpacing: layer.letterSpacing ?? firstRun?.letterSpacing ?? 0,
      runs: layer.runs,
    };
  }
  if (layer.kind === 'shape') {
    return {
      ...base,
      type: 'shape',
      shape: layer.shape,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth ?? 0,
      borderRadius: layer.borderRadius ?? 0,
    };
  }
  if (layer.kind === 'vector') {
    return {
      ...base,
      type: 'vector',
      viewBox: layer.viewBox,
      paths: layer.paths,
    };
  }
  if (layer.kind === 'image') {
    const src = layer.src ?? assetUrl(doc, layer.assetId);
    if (!src) return null;
    return {
      ...base,
      type: 'image',
      src,
      fit: layer.fit,
    };
  }
  if (layer.kind === 'table') {
    return {
      ...base,
      type: 'table',
      rows: layer.rows,
      columns: layer.columns.length
        ? layer.columns
        : (layer.rows[0] ?? []).map((_, i) => ({ key: `col_${i + 1}`, label: `Column ${i + 1}` })),
      showHeader: layer.showHeader,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize ?? 10,
      borderColor: layer.borderColor,
      borderWidth: layer.borderWidth ?? 0.5,
    };
  }
  return null;
}

function flattenLayers(layers: CdirLayer[], doc: CdirDocument, groupId?: string): Overlay[] {
  const out: Overlay[] = [];
  for (const layer of layers) {
    if (layer.kind === 'group') {
      out.push(...flattenLayers(layer.children, doc, layer.id));
      continue;
    }
    const overlay = layerToOverlay(layer, doc, groupId);
    if (overlay) out.push(overlay);
  }
  return out.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

function pageToBlock(page: CdirPage, doc: CdirDocument): Block {
  return {
    id: `${page.id}_cdir_freeform`,
    type: 'free',
    name: 'Imported editable layers',
    props: {},
    overlays: flattenLayers(page.layers, doc),
  };
}

function pageBackground(page: CdirPage, doc: CdirDocument, includeTraceLayers: boolean) {
  const traceUrl = includeTraceLayers ? assetUrl(doc, page.traceRasterAssetId) : undefined;
  return {
    color: page.background?.color,
    opacity: page.background?.opacity,
    gradient: page.background?.gradient,
    imageUrl: traceUrl,
  };
}

function tokensFromCdir(doc: CdirDocument): ReportTemplate['tokens'] {
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  for (const page of doc.pages) {
    if (page.background?.color) colors[`page_${page.id}_bg`] = page.background.color;
    for (const layer of page.layers) collectLayerTokens(layer, colors, fonts);
  }
  doc.fonts.forEach((font, i) => { fonts[`imported_${i + 1}`] = font.family; });
  return {
    colors,
    fonts,
    spacing: {},
    fontFaces: doc.fonts.map((font) => ({
      family: font.family,
      weight: font.weight,
      style: font.style,
      source: font.assetId ? 'embedded' : undefined,
      src: assetUrl(doc, font.assetId),
    })),
  };
}

function collectLayerTokens(layer: CdirLayer, colors: Record<string, string>, fonts: Record<string, string>) {
  if (layer.kind === 'group') {
    layer.children.forEach((child) => collectLayerTokens(child, colors, fonts));
    return;
  }
  if (layer.kind === 'text') {
    if (layer.color) colors[`text_${layer.id}`] = layer.color;
    if (layer.fontFamily) fonts[`font_${layer.id}`] = layer.fontFamily;
  }
  if (layer.kind === 'shape') {
    if (layer.fill) colors[`fill_${layer.id}`] = layer.fill;
    if (layer.stroke) colors[`stroke_${layer.id}`] = layer.stroke;
  }
}

export function cdirToReportTemplate(input: CdirDocument | unknown, opts: CdirToTemplateOptions = {}): ReportTemplate {
  const doc = parseCdirDocument(input);
  return parseTemplate({
    version: 1,
    tokens: tokensFromCdir(doc),
    pages: doc.pages.map((page, index) => ({
      id: page.id,
      name: page.label || `Imported Page ${index + 1}`,
      size: { width: page.width, height: page.height },
      background: pageBackground(page, doc, opts.includeTraceLayers ?? false),
      blocks: [pageToBlock(page, doc)],
    })),
    slots: {},
    meta: {
      title: opts.templateName ?? doc.source.filename ?? 'Imported template',
      creator: 'Template Builder CDIR importer',
      keywords: `source:${doc.source.kind}`,
    },
  });
}
