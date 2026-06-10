# Universal file import

The importer accepts **any file** — no MIME/extension gating on the upload inputs. It detects
what a file actually is and routes it to the right worker.

> Status: **implemented** · Last updated: 2026‑06‑10

## Detection → route
Pure, unit‑tested `src/lib/reportTemplate/importFileType.ts` decides the kind from **magic bytes
first** (robust to wrong/missing extensions), then MIME, then extension:

| Detected kind | Route | Worker |
|---|---|---|
| PDF | `pdf` | `extractPdfToTemplate` |
| raster image (png/jpg/webp/gif/bmp/tiff/heic/avif/ico) | `image` | image reconstruct (OCR‑grounded) |
| SVG | `svg` | client canvas rasterise → image |
| text / Markdown | `text` | `pdf-lib` text layout → PDF → pipeline |
| Word/PowerPoint/Excel/ODF, RTF, HTML, CSV, ePub, unknown | `convert` | `convert-to-pdf` → doc‑convert (LibreOffice) → PDF |
| archive (zip/rar/7z/…) | `unsupported` | rejected (nothing to reconstruct) |

`prepareImportFile` (browser) performs the transform and hands the pipeline a PDF or image;
`prepareImportFileAsPdf` always yields a PDF (for the PDF‑only importer — images become a one‑page PDF).

## Services
- **doc‑convert** (`services/doc-convert`, LibreOffice headless) — office/rtf/html/csv/markdown/… → PDF.
  Wired via the `convert-to-pdf` edge function (`DOC_CONVERT_URL` + `DOC_CONVERT_KEY`).
- **page‑render** (`services/page-render`, Playwright) — interactive pages / Figma‑Canva‑Gamma links → image(s)
  (see `docs/IMPORT_FROM_URL.md`).

Without the convert service configured, office/document uploads return a clear "export to PDF" message;
everything that needs no conversion (PDF, image, SVG, text/Markdown) works with **no extra infrastructure**.

## Safety
- Magic‑byte sniffing means a mislabeled file (e.g. a real PDF named `.png`) is still handled correctly.
- The convert service never uses the uploaded filename in a filesystem path (only a validated extension),
  spawns `soffice` with an argv array (no shell), and runs per‑request temp dirs with a timeout.
- Overall upload cap 100 MB; conversion request cap ~25 MB (export larger files to PDF).
