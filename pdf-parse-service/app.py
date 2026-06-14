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
import json
import logging
import os
import re
import time
import uuid
from contextvars import ContextVar
from typing import Any, Optional

import httpx
import pypdfium2 as pdfium
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption

REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="-")


class JsonRequestFormatter(logging.Formatter):
    """Emit one JSON object per log line so Cloud Run can index request fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", REQUEST_ID.get()),
        }
        for key in ("method", "path", "status_code", "duration_ms", "error_code", "retryable"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


handler = logging.StreamHandler()
handler.setFormatter(JsonRequestFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
LOG = logging.getLogger("pdf-parse-service")

SERVICE_TOKEN = os.environ.get("PDF_PARSE_SERVICE_TOKEN", "").strip()
SERVICE_TOKEN_NEXT = os.environ.get("PDF_PARSE_SERVICE_TOKEN_NEXT", "").strip()
SERVICE_TOKENS = {t for t in (SERVICE_TOKEN, SERVICE_TOKEN_NEXT) if t}
ENGINE_VERSION = "docling-2.14.0+phaseD+waveD"
MAX_PDF_BYTES = int(os.environ.get("DOCLING_MAX_PDF_MB", "75")) * 1024 * 1024


class SidecarError(Exception):
    def __init__(self, status_code: int, error_code: str, message: str, *, retryable: bool = False):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.retryable = retryable
        super().__init__(message)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip() not in {"", "0", "false", "False", "no", "NO"}


PREWARM_ON_STARTUP = _env_bool("DOCLING_PREWARM_ON_STARTUP", True)


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
    "formula=%s, code=%s, ocr_fallback=%s, force_full_page_ocr=%s, ocr_langs=%s, "
    "bitmap_area_threshold=%.3f, images_scale=%.2f, accel_device=%s, accel_threads=%d, "
    "include_markdown_default=%s, layout_model=%s)",
    ENGINE_VERSION,
    ENABLE_PICTURE_CLASSIFICATION,
    ENABLE_PICTURE_DESCRIPTION_DEFAULT,
    ENABLE_FORMULA_ENRICHMENT,
    ENABLE_CODE_ENRICHMENT,
    ENABLE_OCR_FALLBACK,
    FORCE_FULL_PAGE_OCR,
    ",".join(OCR_LANGS) or "(default)",
    BITMAP_AREA_THRESHOLD,
    IMAGES_SCALE,
    ACCEL_DEVICE,
    ACCEL_THREADS,
    INCLUDE_MARKDOWN_DEFAULT,
    LAYOUT_MODEL or "(default)",
)


def _build_prewarm_pdf() -> bytes:
    """Build a tiny valid one-page PDF with correct xref offsets."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length 44 >>\nstream\nBT /F1 12 Tf 40 120 Td (Docling warmup) Tj ET\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{idx} 0 obj\n".encode("ascii"))
        out.extend(obj)
        out.extend(b"\nendobj\n")
    xref_at = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    out.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode("ascii"))
    return bytes(out)


@app.on_event("startup")
async def prewarm_docling() -> None:
    """Load Docling models at boot so the first user request avoids model-load latency."""
    if not PREWARM_ON_STARTUP:
        LOG.info("Docling startup prewarm disabled")
        return
    started = time.monotonic()
    from docling.datamodel.base_models import DocumentStream

    try:
        stream = DocumentStream(name="prewarm.pdf", stream=io.BytesIO(_build_prewarm_pdf()))
        CONVERTER.convert(stream)
        LOG.info("Docling startup prewarm complete", extra={"duration_ms": int((time.monotonic() - started) * 1000)})
    except Exception as exc:  # pragma: no cover — startup should remain healthy; healthz reveals process state.
        LOG.warning("Docling startup prewarm failed: %s", exc, extra={"duration_ms": int((time.monotonic() - started) * 1000)})


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------
@app.middleware("http")
async def require_bearer(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = REQUEST_ID.set(request_id)
    started = time.monotonic()
    try:
        if request.url.path in {"/healthz", "/"}:
            response = await call_next(request)
        elif not SERVICE_TOKENS:
            response = error_response(503, "service_token_not_configured", "PDF_PARSE_SERVICE_TOKEN is not configured.", retryable=True)
        else:
            auth = request.headers.get("authorization", "")
            if not auth.lower().startswith("bearer ") or auth.split(" ", 1)[1].strip() not in SERVICE_TOKENS:
                response = error_response(401, "unauthorised", "Invalid bearer token.", retryable=False)
            else:
                response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        LOG.info(
            "request complete",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": int((time.monotonic() - started) * 1000),
            },
        )
        return response
    finally:
        REQUEST_ID.reset(token)


def error_response(status_code: int, error_code: str, message: str, *, retryable: bool) -> JSONResponse:
    return JSONResponse(
        {"error_code": error_code, "message": message, "retryable": retryable},
        status_code=status_code,
    )


@app.exception_handler(SidecarError)
async def sidecar_error_handler(_request: Request, exc: SidecarError) -> JSONResponse:
    LOG.warning(
        exc.message,
        extra={"error_code": exc.error_code, "retryable": exc.retryable},
    )
    return error_response(exc.status_code, exc.error_code, exc.message, retryable=exc.retryable)


@app.exception_handler(HTTPException)
async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    status = int(exc.status_code)
    retryable = status in {408, 429, 500, 502, 503, 504}
    return error_response(status, f"http_{status}", str(exc.detail), retryable=retryable)


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    LOG.exception("Unhandled sidecar error", extra={"error_code": "internal_error", "retryable": True})
    return error_response(500, "internal_error", str(exc), retryable=True)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ParseRequest(BaseModel):
    url: Optional[str] = Field(default=None)
    pdf_base64: Optional[str] = Field(default=None)
    enable_picture_description: Optional[bool] = Field(default=None)
    # Phase D: caller can ask for a lighter / heavier serialization payload.
    include_doctags: bool = Field(default=True)
    include_markdown: bool = Field(default_factory=lambda: INCLUDE_MARKDOWN_DEFAULT)
    redact_pii: bool = Field(default=False)


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
        raise SidecarError(400, "missing_source", "Either `url` or `pdf_base64` is required.")
    if pdf_base64:
        try:
            data = base64.b64decode(pdf_base64, validate=True)
        except Exception as exc:
            raise SidecarError(400, "invalid_base64", f"Invalid base64: {exc}") from exc
    else:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(url)  # type: ignore[arg-type]
        except httpx.TimeoutException as exc:
            raise SidecarError(504, "source_fetch_timeout", "Timed out fetching source PDF.", retryable=True) from exc
        except httpx.RequestError as exc:
            raise SidecarError(502, "source_fetch_error", f"Could not fetch source PDF: {exc}", retryable=True) from exc
        if resp.status_code != 200:
            retryable = resp.status_code in {408, 429, 500, 502, 503, 504}
            raise SidecarError(
                502 if retryable else 400,
                "source_fetch_bad_status",
                f"Source URL returned {resp.status_code}.",
                retryable=retryable,
            )
        data = resp.content
    if len(data) > MAX_PDF_BYTES:
        raise SidecarError(413, "pdf_too_large", f"PDF exceeds {MAX_PDF_BYTES} bytes")
    if not data.startswith(b"%PDF"):
        raise SidecarError(400, "invalid_pdf", "Payload is not a PDF.")
    return data



PII_PATTERNS = [
    (re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE), "[redacted-email]"),
    (re.compile(r"\b(?:\+?61|0)[2-478](?:[ -]?\d){8}\b"), "[redacted-phone]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[redacted-number]"),
    (re.compile(r"\b(?:BSB|Account(?: Number)?|Acct)[:# ]+[0-9 -]{4,}\b", re.IGNORECASE), "[redacted-account]"),
    (re.compile(r"\b(?:TFN|Tax File Number)[:# ]+[0-9 -]{8,}\b", re.IGNORECASE), "[redacted-tax-id]"),
]

def _redact_text(value: str) -> str:
    out = value
    for pattern, replacement in PII_PATTERNS:
        out = pattern.sub(replacement, out)
    return out

def _redact_docling_pii(node: Any) -> int:
    redactions = 0
    if isinstance(node, dict):
        for key, value in list(node.items()):
            if key in {"text", "caption", "orig", "markdown"} and isinstance(value, str):
                redacted = _redact_text(value)
                if redacted != value:
                    node[key] = redacted
                    redactions += 1
            else:
                redactions += _redact_docling_pii(value)
    elif isinstance(node, list):
        for item in node:
            redactions += _redact_docling_pii(item)
    return redactions

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


def _summarise_doc(doc_dict: dict) -> dict:
    """Wave D: lightweight roll-up so dispatch + diagnostics can show extraction quality at a glance."""
    texts = doc_dict.get("texts") or []
    tables = doc_dict.get("tables") or []
    pictures = doc_dict.get("pictures") or doc_dict.get("figures") or []
    total_chars = 0
    ocr_chars = 0
    ocr_pages: set[int] = set()
    conf_sum = 0.0
    conf_n = 0
    page_conf: dict[int, dict[str, float | int]] = {}
    for t in texts:
        s = t.get("text") or ""
        total_chars += len(s)
        origin = (t.get("origin") or t.get("source") or "").lower()
        if "ocr" in origin:
            ocr_chars += len(s)
            for p in (t.get("prov") or []):
                pn = p.get("page_no")
                if pn is not None:
                    ocr_pages.add(int(pn))
        conf = t.get("confidence")
        if isinstance(conf, (int, float)) and 0.0 <= float(conf) <= 1.0:
            conf_value = float(conf)
            conf_sum += conf_value
            conf_n += 1
            for p in (t.get("prov") or []):
                pn = p.get("page_no")
                if pn is None:
                    continue
                bucket = page_conf.setdefault(int(pn), {"sum": 0.0, "count": 0})
                bucket["sum"] = float(bucket["sum"]) + conf_value
                bucket["count"] = int(bucket["count"]) + 1
    table_cells = 0
    for tbl in tables:
        data = tbl.get("data") or {}
        rows = data.get("table_cells") or data.get("cells") or []
        if isinstance(rows, list):
            table_cells += len(rows)
    return {
        "text_chars": total_chars,
        "ocr_chars": ocr_chars,
        "ocr_pages": sorted(ocr_pages),
        "avg_text_confidence": round(conf_sum / conf_n, 4) if conf_n else None,
        "page_confidence": [
            {
                "page_no": page_no,
                "avg_text_confidence": round(float(vals["sum"]) / int(vals["count"]), 4) if int(vals["count"]) else None,
                "text_block_count": int(vals["count"]),
            }
            for page_no, vals in sorted(page_conf.items())
        ],
        "table_count": len(tables),
        "table_cell_count": table_cells,
        "picture_count": len(pictures),
        "text_block_count": len(texts),
    }


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
    try:
        result = converter.convert(stream)
    except Exception as exc:
        raise SidecarError(500, "docling_convert_failed", f"Docling conversion failed: {exc}", retryable=True) from exc
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
    pii_redactions = _redact_docling_pii(doc_dict) if req.redact_pii else 0

    # Phase D: surface auxiliary serialisations & document-level structure.
    extras: dict[str, Any] = {}
    if req.include_doctags:
        try:
            extras["doctags"] = _redact_text(doc.export_to_doctags()) if req.redact_pii else doc.export_to_doctags()
        except Exception as exc:  # pragma: no cover
            LOG.warning("doctags export failed: %s", exc)
    if req.include_markdown:
        try:
            extras["markdown"] = _redact_text(doc.export_to_markdown()) if req.redact_pii else doc.export_to_markdown()
        except Exception as exc:  # pragma: no cover
            LOG.warning("markdown export failed: %s", exc)

    outline = _extract_outline(doc)
    page_languages = _extract_languages(doc_dict)

    # Annotate per-page metadata with language when available.
    for pm in pages_meta:
        lang = page_languages.get(pm["page_no"])
        if lang:
            pm["language"] = lang

    summary = _summarise_doc(doc_dict)
    if req.redact_pii:
        summary["pii_redaction"] = {"enabled": True, "redaction_count": pii_redactions}
    parsed_ms = int((time.monotonic() - t0) * 1000)
    LOG.info(
        "Parsed %d-page PDF (%d bytes) in %d ms — %d texts / %d tables / %d pictures / %d OCR pages",
        len(pages_meta), len(pdf_bytes), parsed_ms,
        summary["text_block_count"], summary["table_count"],
        summary["picture_count"], len(summary["ocr_pages"]),
    )

    return {
        "engine_version": ENGINE_VERSION,
        "parsed_ms": parsed_ms,
        "page_count": len(pages_meta),
        "pages": pages_meta,
        "outline": outline,
        "page_languages": page_languages,
        "summary": summary,
        "docling_document": doc_dict,
        **extras,
    }


@app.post("/raster")
async def raster(req: RasterRequest) -> dict:
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    t0 = time.monotonic()

    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise SidecarError(400, "raster_pdf_open_failed", f"Could not open PDF for rastering: {exc}") from exc
    total = len(pdf)
    page_indices = (
        [p - 1 for p in req.pages if 1 <= p <= total] if req.pages else list(range(total))
    )

    scale = req.dpi / 72.0
    images: list[dict] = []
    for idx in page_indices:
        page = pdf[idx]
        try:
            bitmap = page.render(scale=scale)
            pil_img = bitmap.to_pil()
        except Exception as exc:
            raise SidecarError(500, "raster_page_failed", f"Could not raster page {idx + 1}: {exc}", retryable=True) from exc
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
