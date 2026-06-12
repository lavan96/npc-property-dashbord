import { computePageSize } from '../../imageGrounding';
import type { ImportAsset, ImportPage } from './types';
import { shortHash, stableImportId } from './ids';

export interface ImageImportAssetArgs {
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
  fileName?: string;
  fileId?: string;
  backgroundColor?: string;
}

export function createImageImportAsset(args: ImageImportAssetArgs): ImportAsset {
  const fingerprint = `${args.fileName ?? 'image'}:${args.imageWidth}x${args.imageHeight}:${args.dataUrl.length}:${shortHash(args.dataUrl.slice(0, 4096))}`;
  const fileId = args.fileId ?? stableImportId('image_import', fingerprint);
  const { pageWidth, pageHeight } = computePageSize(args.imageWidth, args.imageHeight);
  const page: ImportPage = {
    id: `${fileId}_page_1`,
    pageIndex: 0,
    width: pageWidth,
    height: pageHeight,
    referenceImageUrl: args.dataUrl,
    dpiScale: args.imageWidth / Math.max(1, pageWidth),
    source: 'image-normalized',
    backgroundColor: args.backgroundColor,
  };
  return {
    fileId,
    fileName: args.fileName,
    fileType: 'image',
    pages: [page],
    createdAt: new Date().toISOString(),
  };
}
