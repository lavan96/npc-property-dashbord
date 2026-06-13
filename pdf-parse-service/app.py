"""
pdf-parse-service — Docling sidecar for the template PDF import pipeline.

Endpoints
---------
GET  /healthz                      — liveness/readiness probe.
POST /parse   { url | pdf_base64 } — returns Docling DoclingDocument JSON + per-page metadata.
POST /raster  { url | pdf_base64, dpi, pages? } — rasterises pages to base64 PNG/JPEG for Hybrid/Pixel-Perfect modes.

Auth
----
Every request must carry `Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN`.

Phase D additions
-----------------
* Formula + code enrichment toggles (LaTeX / code-language detection).
* Picture-image extraction at images_scale=2.0 so embedded crops are sharp.
* Optional EasyOCR fallback (heavy) gated by ENABLE_OCR_FALLBACK.
* DocTags + Markdown serialisations returned alongside the JSON doc.
* Document outline (TOC), cross-references, and per-page language exposed.
* Layout-model override via LAYOUT_MODEL env (best-effort across Docling versions).
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from typing import Any, Optional

import httpx
import pypdfium2 as pdfium
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption

LOG = logging.getLogger("pdf-parse-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

SERVICE_TOKEN = os.environ.get("PDF_PARSE_SERVICE_TOKEN", "").strip()
ENGINE_VERSION = "docling-2.14.0+phaseD+waveA"
MAX_PDF_BYTES = int(os.environ.get("DOCLING_MAX_PDF_MB", "75")) * 1024 * 1024


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip() not in {"", "0", "false", "False", "no", "NO"}


# Phase B/D toggles — Wave A raises defaults for maximum extraction quality.
ENABLE_PICTURE_CLASSIFICATION = _env_bool("ENABLE_PICTURE_CLASSIFICATION", True)
ENABLE_PICTURE_DESCRIPTION_DEFAULT = _env_bool("ENABLE_PICTURE_DESCRIPTION", True)
ENABLE_FORMULA_ENRICHMENT = _env_bool("ENABLE_FORMULA_ENRICHMENT", True)
ENABLE_CODE_ENRICHMENT = _env_bool("ENABLE_CODE_ENRICHMENT", True)
# Wave A: force-OCR is now ON by default so scanned PDFs and outline-rendered text are captured.
ENABLE_OCR_FALLBACK = _env_bool("ENABLE_OCR_FALLBACK", True)
FORCE_FULL_PAGE_OCR = _env_bool("DOCLING_FORCE_FULL_PAGE_OCR", True)
# Multi-language OCR — order matters; first match wins per region.
OCR_LANGS = [s.strip() for s in os.environ.get("DOCLING_OCR_LANGS", "en,fr,de,es,zh,ja,ko,ar").split(",") if s.strip()]
# Lower bitmap threshold = OCR runs even on lightly-bitmapped regions.
BITMAP_AREA_THRESHOLD = float(os.environ.get("DOCLING_BITMAP_AREA_THRESHOLD", "0.05"))
IMAGES_SCALE = float(os.environ.get("DOCLING_IMAGES_SCALE", "2.0"))
LAYOUT_MODEL = os.environ.get("DOCLING_LAYOUT_MODEL", "").strip() or None
# Accelerator: AUTO lets Docling pick CUDA / MPS / CPU as available.
ACCEL_DEVICE = os.environ.get("DOCLING_ACCEL_DEVICE", "AUTO").strip().upper()
ACCEL_THREADS = int(os.environ.get("DOCLING_ACCEL_THREADS", os.environ.get("OMP_NUM_THREADS", "4")))
# Wave A: markdown serialisation is now ON by default so downstream consumers always get it.
INCLUDE_MARKDOWN_DEFAULT = _env_bool("DOCLING_INCLUDE_MARKDOWN_DEFAULT", True)

app = FastAPI(title="pdf-parse-service", version=ENGINE_VERSION)


# ---------------------------------------------------------------------------
# Pipeline construction
# ---------------------------------------------------------------------------
def _safe_set(options: object, attr: str, value: Any) -> bool:
    """Best-effort setter for Docling pipeline flags that vary across releases."""
    try:
        setattr(options, attr, value)
        return True
    except Exception as exc:  # pragma: no cover
        LOG.warning("docling option %s=%r not supported: %s", attr, value, exc)
        return False


def _build_converter(*, enable_picture_description: bool) -> DocumentConverter:
    pipeline = PdfPipelineOptions()
    pipeline.do_ocr = True
    pipeline.do_table_structure = True
    pipeline.table_structure_options.mode = TableFormerMode.ACCURATE
    pipeline.table_structure_options.do_cell_matching = True
    pipeline.generate_page_images = False
    pipeline.generate_picture_images = True
    # Phase D: crisper picture crops (2× default).
    _safe_set(pipeline, "images_scale", IMAGES_SCALE)
    # Phase D: enrichments (defensive — Docling renamed a few of these between minors).
    if ENABLE_PICTURE_CLASSIFICATION:
        _safe_set(pipeline, "do_picture_classification", True)
    if enable_picture_description:
        _safe_set(pipeline, "do_picture_description", True)
    if ENABLE_FORMULA_ENRICHMENT:
        _safe_set(pipeline, "do_formula_enrichment", True)
    if ENABLE_CODE_ENRICHMENT:
        _safe_set(pipeline, "do_code_enrichment", True)

    # Wave A: configure OCR aggressively for scanned / hybrid PDFs.
    ocr_opts = getattr(pipeline, "ocr_options", None)
    if ocr_opts is not None:
        if FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK:
            _safe_set(ocr_opts, "force_full_page_ocr", True)
        if OCR_LANGS:
            # Most OCR engines (EasyOCR/Tesseract) accept a list of language codes.
            _safe_set(ocr_opts, "lang", OCR_LANGS)
        _safe_set(ocr_opts, "bitmap_area_threshold", BITMAP_AREA_THRESHOLD)
    else:
        # Older Docling exposed force_full_page_ocr on the pipeline directly.
        if FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK:
            _safe_set(pipeline, "force_full_page_ocr", True)

    # Wave A: pass an AcceleratorOptions when the running Docling version exposes it.
    try:
        from docling.datamodel.pipeline_options import AcceleratorOptions, AcceleratorDevice  # type: ignore
        try:
            device = getattr(AcceleratorDevice, ACCEL_DEVICE, AcceleratorDevice.AUTO)
        except Exception:
            device = AcceleratorDevice.AUTO
        _safe_set(pipeline, "accelerator_options",
                  AcceleratorOptions(num_threads=ACCEL_THREADS, device=device))
    except Exception as exc:  # pragma: no cover — Docling minor without accelerator opts
        LOG.info("AcceleratorOptions not available in this Docling build: %s", exc)

    if LAYOUT_MODEL:
        # Some Docling builds accept `layout_model` directly; others nest under
        # `layout_options`. Try both.
        if not _safe_set(pipeline, "layout_model", LAYOUT_MODEL):
            layout_opts = getattr(pipeline, "layout_options", None)
            if layout_opts is not None:
                _safe_set(layout_opts, "model", LAYOUT_MODEL)

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)}
    )


CONVERTER = _build_converter(enable_picture_description=ENABLE_PICTURE_DESCRIPTION_DEFAULT)
_CONVERTER_VARIANTS: dict[bool, DocumentConverter] = {ENABLE_PICTURE_DESCRIPTION_DEFAULT: CONVERTER}


def _get_converter(enable_picture_description: bool) -> DocumentConverter:
    cached = _CONVERTER_VARIANTS.get(enable_picture_description)
    if cached is not None:
        return cached
    LOG.info("Building Docling converter variant (picture_description=%s)", enable_picture_description)
    built = _build_converter(enable_picture_description=enable_picture_description)
    _CONVERTER_VARIANTS[enable_picture_description] = built
    return built


LOG.info(
    "Docling converter ready (version=%s, classification=%s, description_default=%s, "
    "formula=%s, code=%s, ocr_fallback=%s, images_scale=%.2f, layout_model=%s)",
    ENGINE_VERSION,
    ENABLE_PICTURE_CLASSIFICATION,
    ENABLE_PICTURE_DESCRIPTION_DEFAULT,
    ENABLE_FORMULA_ENRICHMENT,
    ENABLE_CODE_ENRICHMENT,
    ENABLE_OCR_FALLBACK,
    IMAGES_SCALE,
    LAYOUT_MODEL or "(default)",
)


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def require_bearer(request: Request, call_next):
    if request.url.path in {"/healthz", "/"}:
        return await call_next(request)
    if not SERVICE_TOKEN:
        return JSONResponse({"error": "service_token_not_configured"}, status_code=503)
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer ") or auth.split(" ", 1)[1].strip() != SERVICE_TOKEN:
        return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ParseRequest(BaseModel):
    url: Optional[str] = Field(default=None)
    pdf_base64: Optional[str] = Field(default=None)
    enable_picture_description: Optional[bool] = Field(default=None)
    # Phase D: caller can ask for a lighter / heavier serialization payload.
    include_doctags: bool = Field(default=True)
    include_markdown: bool = Field(default=False)


class RasterRequest(BaseModel):
    url: Optional[str] = None
    pdf_base64: Optional[str] = None
    dpi: int = Field(default=144, ge=72, le=300)
    pages: Optional[list[int]] = Field(default=None)
    format: str = Field(default="png", pattern="^(png|jpeg)$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _resolve_pdf_bytes(url: Optional[str], pdf_base64: Optional[str]) -> bytes:
    if not url and not pdf_base64:
        raise HTTPException(status_code=400, detail="Either `url` or `pdf_base64` is required.")
    if pdf_base64:
        try:
            data = base64.b64decode(pdf_base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc
    else:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)  # type: ignore[arg-type]
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Source URL returned {resp.status_code}")
            data = resp.content
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF exceeds {MAX_PDF_BYTES} bytes")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Payload is not a PDF.")
    return data


def _extract_outline(doc: Any) -> list[dict]:
    """Best-effort document outline / TOC extraction."""
    outline: list[dict] = []
    for attr in ("outlines", "outline", "toc"):
        nodes = getattr(doc, attr, None)
        if not nodes:
            continue
        try:
            for node in nodes:
                outline.append({
                    "title": getattr(node, "title", None) or getattr(node, "text", None) or "",
                    "level": getattr(node, "level", 1),
                    "page_no": getattr(node, "page_no", None) or getattr(node, "page", None),
                })
            if outline:
                return outline
        except Exception:  # pragma: no cover
            continue
    # Fallback: derive outline from section_header / title text items.
    texts = getattr(doc, "texts", None) or []
    for t in texts:
        label = getattr(t, "label", None)
        if label in ("title", "section_header"):
            prov = getattr(t, "prov", None) or []
            page_no = prov[0].page_no if prov else None
            outline.append({
                "title": getattr(t, "text", "") or "",
                "level": 1 if label == "title" else max(1, min(6, int(getattr(t, "level", 2) or 2))),
                "page_no": page_no,
            })
    return outline


def _extract_languages(doc_dict: dict) -> dict[int, str]:
    """Aggregate per-page language hints from text items (when Docling provides them)."""
    counts: dict[int, dict[str, int]] = {}
    for t in (doc_dict.get("texts") or []):
        lang = (t.get("language") or t.get("lang") or "").lower().strip()
        if not lang:
            continue
        for p in (t.get("prov") or []):
            pn = p.get("page_no")
            if pn is None:
                continue
            counts.setdefault(pn, {}).setdefault(lang, 0)
            counts[pn][lang] += 1
    out: dict[int, str] = {}
    for pn, hist in counts.items():
        out[pn] = max(hist.items(), key=lambda kv: kv[1])[0]
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "engine_version": ENGINE_VERSION}


@app.get("/")
def root() -> dict:
    return {"service": "pdf-parse-service", "engine_version": ENGINE_VERSION}


@app.post("/parse")
async def parse(req: ParseRequest) -> dict:
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    t0 = time.monotonic()

    from docling.datamodel.base_models import DocumentStream

    stream = DocumentStream(name="source.pdf", stream=io.BytesIO(pdf_bytes))
    use_description = (
        req.enable_picture_description
        if req.enable_picture_description is not None
        else ENABLE_PICTURE_DESCRIPTION_DEFAULT
    )
    converter = _get_converter(use_description)
    result = converter.convert(stream)
    doc = result.document

    pages_meta: list[dict] = []
    for page_no, page in (doc.pages or {}).items():
        size = page.size
        pages_meta.append({
            "page_no": page_no,
            "width": size.width,
            "height": size.height,
        })
    pages_meta.sort(key=lambda p: p["page_no"])

    doc_dict = doc.export_to_dict()

    # Phase D: surface auxiliary serialisations & document-level structure.
    extras: dict[str, Any] = {}
    if req.include_doctags:
        try:
            extras["doctags"] = doc.export_to_doctags()
        except Exception as exc:  # pragma: no cover
            LOG.warning("doctags export failed: %s", exc)
    if req.include_markdown:
        try:
            extras["markdown"] = doc.export_to_markdown()
        except Exception as exc:  # pragma: no cover
            LOG.warning("markdown export failed: %s", exc)

    outline = _extract_outline(doc)
    page_languages = _extract_languages(doc_dict)

    # Annotate per-page metadata with language when available.
    for pm in pages_meta:
        lang = page_languages.get(pm["page_no"])
        if lang:
            pm["language"] = lang

    parsed_ms = int((time.monotonic() - t0) * 1000)
    LOG.info("Parsed %d-page PDF (%d bytes) in %d ms", len(pages_meta), len(pdf_bytes), parsed_ms)

    return {
        "engine_version": ENGINE_VERSION,
        "parsed_ms": parsed_ms,
        "page_count": len(pages_meta),
        "pages": pages_meta,
        "outline": outline,
        "page_languages": page_languages,
        "docling_document": doc_dict,
        **extras,
    }


@app.post("/raster")
async def raster(req: RasterRequest) -> dict:
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    t0 = time.monotonic()

    pdf = pdfium.PdfDocument(pdf_bytes)
    total = len(pdf)
    page_indices = (
        [p - 1 for p in req.pages if 1 <= p <= total] if req.pages else list(range(total))
    )

    scale = req.dpi / 72.0
    images: list[dict] = []
    for idx in page_indices:
        page = pdf[idx]
        bitmap = page.render(scale=scale)
        pil_img = bitmap.to_pil()
        buf = io.BytesIO()
        if req.format == "jpeg":
            pil_img.convert("RGB").save(buf, format="JPEG", quality=88, optimize=True)
            mime = "image/jpeg"
        else:
            pil_img.save(buf, format="PNG", optimize=True)
            mime = "image/png"
        images.append({
            "page_no": idx + 1,
            "mime": mime,
            "width_px": pil_img.width,
            "height_px": pil_img.height,
            "base64": base64.b64encode(buf.getvalue()).decode("ascii"),
        })

    raster_ms = int((time.monotonic() - t0) * 1000)
    LOG.info("Rasterised %d pages @ %d DPI in %d ms", len(images), req.dpi, raster_ms)

    return {
        "engine_version": ENGINE_VERSION,
        "raster_ms": raster_ms,
        "dpi": req.dpi,
        "pages": images,
    }
