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

Wave F-Option-3 (callback / async) additions
--------------------------------------------
When `/parse` receives `callback_url` + `callback_token` + `job_id`, the sidecar
runs parse (and optional rasterise) as a BackgroundTask, uploads artifacts
directly to the Supabase `pdf-import-diagnostics` bucket via the Storage REST
API, and POSTs the completion payload to `callback_url`. The HTTP response to
`/parse` returns immediately with 202 so the edge dispatcher's wall-clock
budget is freed.

Required additional env for callback uploads:
    SUPABASE_URL                       Base URL for the Supabase REST API.
    SUPABASE_SERVICE_ROLE_KEY          Service role key (storage upload auth).
    PDF_DIAGNOSTICS_BUCKET             Defaults to "pdf-import-diagnostics".
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
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
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
ENGINE_VERSION = "docling-2.14.0+phaseD+waveD+option3+waveG-chunked+phase1-plan-router+phase3-raster-manifest+phase2a-dedupe"
MAX_PDF_BYTES = int(os.environ.get("DOCLING_MAX_PDF_MB", "75")) * 1024 * 1024
# Phase 3 raster artifact config.
RASTER_ARTIFACT_MODE = os.environ.get("DOCLING_RASTER_ARTIFACT_MODE", "manifest").lower()
WRITE_LEGACY_RASTERS_JSON = os.environ.get("DOCLING_WRITE_LEGACY_RASTERS_JSON", "false").lower() == "true"
RASTER_FORMAT = os.environ.get("DOCLING_RASTER_FORMAT", "png").lower()
RASTER_DPI = int(os.environ.get("DOCLING_RASTER_DPI", "200"))

# Wave F-Option-3 storage upload config.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
DIAGNOSTICS_BUCKET = os.environ.get("PDF_DIAGNOSTICS_BUCKET", "pdf-import-diagnostics").strip()


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
    _safe_set(pipeline, "images_scale", IMAGES_SCALE)
    if ENABLE_PICTURE_CLASSIFICATION:
        _safe_set(pipeline, "do_picture_classification", True)
    if enable_picture_description:
        _safe_set(pipeline, "do_picture_description", True)
    if ENABLE_FORMULA_ENRICHMENT:
        _safe_set(pipeline, "do_formula_enrichment", True)
    if ENABLE_CODE_ENRICHMENT:
        _safe_set(pipeline, "do_code_enrichment", True)

    ocr_opts = getattr(pipeline, "ocr_options", None)
    if ocr_opts is not None:
        if FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK:
            _safe_set(ocr_opts, "force_full_page_ocr", True)
        if OCR_LANGS:
            _safe_set(ocr_opts, "lang", OCR_LANGS)
        _safe_set(ocr_opts, "bitmap_area_threshold", BITMAP_AREA_THRESHOLD)
    else:
        if FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK:
            _safe_set(pipeline, "force_full_page_ocr", True)

    try:
        from docling.datamodel.pipeline_options import AcceleratorOptions, AcceleratorDevice  # type: ignore
        try:
            device = getattr(AcceleratorDevice, ACCEL_DEVICE, AcceleratorDevice.AUTO)
        except Exception:
            device = AcceleratorDevice.AUTO
        _safe_set(pipeline, "accelerator_options",
                  AcceleratorOptions(num_threads=ACCEL_THREADS, device=device))
    except Exception as exc:  # pragma: no cover
        LOG.info("AcceleratorOptions not available in this Docling build: %s", exc)

    if LAYOUT_MODEL:
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
    "Docling converter ready (version=%s, callback_upload_configured=%s)",
    ENGINE_VERSION,
    bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
)


def _build_prewarm_pdf() -> bytes:
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
    if not PREWARM_ON_STARTUP:
        LOG.info("Docling startup prewarm disabled")
        return
    started = time.monotonic()
    from docling.datamodel.base_models import DocumentStream

    try:
        stream = DocumentStream(name="prewarm.pdf", stream=io.BytesIO(_build_prewarm_pdf()))
        CONVERTER.convert(stream)
        LOG.info("Docling startup prewarm complete", extra={"duration_ms": int((time.monotonic() - started) * 1000)})
    except Exception as exc:  # pragma: no cover
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
    LOG.warning(exc.message, extra={"error_code": exc.error_code, "retryable": exc.retryable})
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
    include_doctags: bool = Field(default=True)
    include_markdown: bool = Field(default_factory=lambda: INCLUDE_MARKDOWN_DEFAULT)
    redact_pii: bool = Field(default=False)
    # Wave F-Option-3 callback fields. When all three are present, sidecar runs
    # parse + raster in a BackgroundTask, uploads artifacts to Supabase Storage,
    # and POSTs completion to `callback_url`. Sidecar returns 202 immediately.
    callback_url: Optional[str] = Field(default=None)
    callback_token: Optional[str] = Field(default=None)
    job_id: Optional[str] = Field(default=None)
    # Hybrid / pixel-perfect → also rasterise in the same background task.
    mode: Optional[str] = Field(default=None)
    raster_dpi: Optional[int] = Field(default=None, ge=72, le=300)
    raster_format: str = Field(default="png", pattern="^(png|jpeg)$")
    allow_mode_override: bool = Field(default=True)


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
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
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


def _do_parse(pdf_bytes: bytes, *, use_description: bool, include_doctags: bool, include_markdown: bool, redact_pii: bool) -> dict:
    """Synchronous Docling parse — shared by /parse sync path and async background path."""
    from docling.datamodel.base_models import DocumentStream

    t0 = time.monotonic()
    stream = DocumentStream(name="source.pdf", stream=io.BytesIO(pdf_bytes))
    converter = _get_converter(use_description)
    try:
        result = converter.convert(stream)
    except Exception as exc:
        raise SidecarError(500, "docling_convert_failed", f"Docling conversion failed: {exc}", retryable=True) from exc
    doc = result.document

    pages_meta: list[dict] = []
    for page_no, page in (doc.pages or {}).items():
        size = page.size
        pages_meta.append({"page_no": page_no, "width": size.width, "height": size.height})
    pages_meta.sort(key=lambda p: p["page_no"])

    doc_dict = doc.export_to_dict()
    pii_redactions = _redact_docling_pii(doc_dict) if redact_pii else 0

    extras: dict[str, Any] = {}
    if include_doctags:
        try:
            extras["doctags"] = _redact_text(doc.export_to_doctags()) if redact_pii else doc.export_to_doctags()
        except Exception as exc:  # pragma: no cover
            LOG.warning("doctags export failed: %s", exc)
    if include_markdown:
        try:
            extras["markdown"] = _redact_text(doc.export_to_markdown()) if redact_pii else doc.export_to_markdown()
        except Exception as exc:  # pragma: no cover
            LOG.warning("markdown export failed: %s", exc)

    outline = _extract_outline(doc)
    page_languages = _extract_languages(doc_dict)
    for pm in pages_meta:
        lang = page_languages.get(pm["page_no"])
        if lang:
            pm["language"] = lang

    summary = _summarise_doc(doc_dict)
    if redact_pii:
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


def _do_raster(pdf_bytes: bytes, *, dpi: int, fmt: str, pages: Optional[list[int]] = None) -> dict:
    t0 = time.monotonic()
    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise SidecarError(400, "raster_pdf_open_failed", f"Could not open PDF for rastering: {exc}") from exc
    total = len(pdf)
    page_indices = [p - 1 for p in pages if 1 <= p <= total] if pages else list(range(total))
    scale = dpi / 72.0
    images: list[dict] = []
    for idx in page_indices:
        page = pdf[idx]
        try:
            bitmap = page.render(scale=scale)
            pil_img = bitmap.to_pil()
        except Exception as exc:
            raise SidecarError(500, "raster_page_failed", f"Could not raster page {idx + 1}: {exc}", retryable=True) from exc
        buf = io.BytesIO()
        if fmt == "jpeg":
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
    LOG.info("Rasterised %d pages @ %d DPI in %d ms", len(images), dpi, raster_ms)
    return {"engine_version": ENGINE_VERSION, "raster_ms": raster_ms, "dpi": dpi, "format": fmt, "pages": images}


# ---------------------------------------------------------------------------
# Wave F-Option-3 storage upload helpers
# ---------------------------------------------------------------------------
def _ocr_ratio(summary: dict, page_count: int) -> float:
    if not page_count:
        return 0.0
    return len(summary.get("ocr_pages") or []) / float(page_count)


async def _storage_upload(client: httpx.AsyncClient, object_path: str, body: bytes, content_type: str) -> Optional[str]:
    """Upload a single artifact to the Supabase Storage REST API. Returns the object path on success."""
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        LOG.error("Storage upload skipped — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
        return None
    url = f"{SUPABASE_URL}/storage/v1/object/{DIAGNOSTICS_BUCKET}/{object_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
        "cache-control": "3600",
    }
    try:
        resp = await client.post(url, content=body, headers=headers)
        if resp.status_code >= 300:
            LOG.error("storage upload failed %s: %s", resp.status_code, resp.text[:300])
            return None
        return object_path
    except Exception as exc:
        LOG.error("storage upload exception: %s", exc)
        return None



def _normalize_raster_ext(mime: str) -> str:
    mime = (mime or "image/png").lower()
    if "jpeg" in mime or "jpg" in mime:
        return "jpg"
    return "png"


def _decode_raster_page_bytes(page: dict) -> tuple[bytes, str]:
    raw_b64 = page.get("base64") or page.get("image_base64")
    if not raw_b64:
        raise ValueError("raster page missing base64")
    mime = page.get("mime") or "image/png"
    return base64.b64decode(raw_b64), mime


async def _upload_raster_manifest_artifacts(
    client: httpx.AsyncClient,
    prefix: str,
    raster_result: dict,
    *,
    global_page_offset: int = 0,
) -> dict:
    page_raster_paths: list[str] = []
    manifest_pages: list[dict] = []
    total_bytes = 0

    pages = raster_result.get("pages") or []
    dpi = raster_result.get("dpi")
    fmt = (raster_result.get("format") or RASTER_FORMAT or "png").lower()

    for page in pages:
        try:
            page_no = int(page.get("page_no") or 0)
            if page_no <= 0:
                continue

            data, mime = _decode_raster_page_bytes(page)
            ext = _normalize_raster_ext(mime)
            object_path = f"{prefix}/pages/page-{page_no:03d}.{ext}"

            uploaded_path = await _storage_upload(client, object_path, data, mime)
            if not uploaded_path:
                LOG.error("Page raster upload failed page=%s path=%s", page_no, object_path)
                continue

            byte_count = len(data)
            total_bytes += byte_count
            page_raster_paths.append(uploaded_path)

            manifest_pages.append({
                "page_no": page_no,
                "global_page_no": global_page_offset + page_no,
                "width": page.get("width_px") or page.get("width"),
                "height": page.get("height_px") or page.get("height"),
                "path": uploaded_path,
                "mime": mime,
                "bytes": byte_count,
            })

            LOG.info("Uploaded page raster page=%s path=%s bytes=%s", page_no, uploaded_path, byte_count)
        except Exception as exc:
            LOG.error("Failed to upload raster page: %s", exc)

    manifest = {
        "version": "phase3-raster-manifest-v1",
        "format": fmt,
        "dpi": dpi,
        "page_count": len(manifest_pages),
        "pages": manifest_pages,
    }

    manifest_body = json.dumps(manifest).encode("utf-8")
    manifest_path = await _storage_upload(
        client,
        f"{prefix}/rasters-manifest.json",
        manifest_body,
        "application/json",
    )
    total_bytes += len(manifest_body)

    LOG.info("Uploaded raster manifest path=%s pages=%s", manifest_path, len(page_raster_paths))

    return {
        "rasters_manifest_path": manifest_path,
        "page_raster_paths": page_raster_paths,
        "manifest": manifest,
        "bytes_out": total_bytes,
    }

def _parse_data_uri(uri: str) -> Optional[tuple[str, bytes, str]]:
    m = re.match(r"^data:([^;,]+);base64,(.+)$", uri or "")
    if not m:
        return None
    mime = m.group(1)
    try:
        data = base64.b64decode(m.group(2))
    except Exception:
        return None
    ext = "jpg" if "jpeg" in mime else ("png" if "png" in mime else "")
    if not ext:
        return None
    return mime, data, ext


async def _upload_picture_assets(client: httpx.AsyncClient, job_id: str, doclingDoc: dict) -> int:
    pictures = doclingDoc.get("pictures") if isinstance(doclingDoc, dict) else None
    if not isinstance(pictures, list):
        return 0
    total = 0
    for i, pic in enumerate(pictures):
        image = pic.get("image") if isinstance(pic, dict) else None
        uri = image.get("uri") if isinstance(image, dict) else None
        parsed = _parse_data_uri(uri) if isinstance(uri, str) else None
        if not parsed:
            continue
        mime, data, ext = parsed
        path = f"{job_id}/images/picture-{i+1}.{ext}"
        ok = await _storage_upload(client, path, data, mime)
        if ok:
            image["diagnostics_path"] = path
            total += len(data)
    return total


async def _post_callback(client: httpx.AsyncClient, callback_url: str, callback_token: str, job_id: str, payload: dict) -> None:
    headers = {
        "Authorization": f"Bearer {callback_token}",
        "Content-Type": "application/json",
        "X-Request-Id": job_id,
    }
    try:
        resp = await client.post(callback_url, json=payload, headers=headers, timeout=30)
        if resp.status_code >= 300:
            LOG.error("callback POST failed %s: %s", resp.status_code, resp.text[:500])
    except Exception as exc:
        LOG.error("callback POST exception: %s", exc)


async def _run_async_job(req: ParseRequest) -> None:
    """Background task: parse + optional raster, upload artifacts, POST callback."""
    job_id = req.job_id or "unknown"
    callback_url = req.callback_url or ""
    callback_token = req.callback_token or ""
    started = time.monotonic()
    bytes_in = 0
    bytes_out = 0
    cloud_run_ms = 0
    try:
        pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
        bytes_in = len(pdf_bytes)

        use_description = (
            req.enable_picture_description
            if req.enable_picture_description is not None
            else ENABLE_PICTURE_DESCRIPTION_DEFAULT
        )

        parse_result = _do_parse(
            pdf_bytes,
            use_description=use_description,
            include_doctags=req.include_doctags,
            include_markdown=req.include_markdown,
            redact_pii=req.redact_pii,
        )
        cloud_run_ms += int(parse_result.get("parsed_ms") or 0)

        page_count = int(parse_result.get("page_count") or 0)
        summary = parse_result.get("summary") or {}
        requested_mode = (req.mode or "semantic").lower()
        effective_mode = requested_mode
        # Auto-promote hybrid → pixel_perfect when OCR ratio > 0.3.
        if (
            requested_mode == "hybrid"
            and req.allow_mode_override
            and _ocr_ratio(summary, page_count) > 0.3
        ):
            effective_mode = "pixel_perfect"

        async with httpx.AsyncClient(timeout=120) as client:
            doclingDoc = parse_result.get("docling_document") or {}
            if isinstance(doclingDoc, dict) and summary:
                doclingDoc["summary"] = summary
            picture_bytes = await _upload_picture_assets(client, job_id, doclingDoc)
            bytes_out += picture_bytes

            docling_body = json.dumps(doclingDoc).encode("utf-8")
            docling_path = await _storage_upload(client, f"{job_id}/docling.json", docling_body, "application/json")
            bytes_out += len(docling_body)

            doctags_path = None
            markdown_path = None
            outline_path = None
            if parse_result.get("doctags"):
                body = str(parse_result["doctags"]).encode("utf-8")
                doctags_path = await _storage_upload(client, f"{job_id}/doctags.md", body, "text/markdown")
                bytes_out += len(body)
            if parse_result.get("markdown"):
                body = str(parse_result["markdown"]).encode("utf-8")
                markdown_path = await _storage_upload(client, f"{job_id}/document.md", body, "text/markdown")
                bytes_out += len(body)
            outline = parse_result.get("outline") or []
            if outline:
                body = json.dumps({"outline": outline, "page_languages": parse_result.get("page_languages") or {}}).encode("utf-8")
                outline_path = await _storage_upload(client, f"{job_id}/outline.json", body, "application/json")
                bytes_out += len(body)

            # Raster pass (hybrid / pixel_perfect)
            rasters_path = None
            rasters_manifest_path = None
            page_raster_paths = []
            legacy_rasters_path = None
            if effective_mode in {"hybrid", "pixel_perfect", "pixel-perfect"} and page_count > 0:
                dpi = req.raster_dpi or RASTER_DPI or (200 if "pixel" in effective_mode else 144)
                raster_fmt = (req.raster_format or RASTER_FORMAT or "png").lower()
                raster_result = _do_raster(pdf_bytes, dpi=dpi, fmt=raster_fmt)
                cloud_run_ms += int(raster_result.get("raster_ms") or 0)

                normalized = {
                    "format": raster_result.get("format"),
                    "dpi": raster_result.get("dpi"),
                    "engine_version": raster_result.get("engine_version"),
                    "pages": [
                        {
                            "page_no": page.get("page_no"),
                            "width": page.get("width_px"),
                            "height": page.get("height_px"),
                            "image_base64": page.get("base64"),
                        }
                        for page in raster_result.get("pages") or []
                    ],
                }

                if RASTER_ARTIFACT_MODE == "manifest":
                    raster_artifacts = await _upload_raster_manifest_artifacts(
                        client,
                        job_id,
                        raster_result,
                        global_page_offset=0,
                    )
                    rasters_manifest_path = raster_artifacts.get("rasters_manifest_path")
                    page_raster_paths = raster_artifacts.get("page_raster_paths") or []
                    bytes_out += int(raster_artifacts.get("bytes_out") or 0)

                    if WRITE_LEGACY_RASTERS_JSON:
                        body = json.dumps(normalized).encode("utf-8")
                        legacy_rasters_path = await _storage_upload(client, f"{job_id}/rasters.json", body, "application/json")
                        rasters_path = legacy_rasters_path
                        bytes_out += len(body)
                    else:
                        LOG.info("Legacy rasters.json skipped")
                else:
                    body = json.dumps(normalized).encode("utf-8")
                    rasters_path = await _storage_upload(client, f"{job_id}/rasters.json", body, "application/json")
                    bytes_out += len(body)

            duration_ms = int((time.monotonic() - started) * 1000)
            await _post_callback(client, callback_url, callback_token, job_id, {
                "job_id": job_id,
                "status": "succeeded",
                "engine_version": parse_result.get("engine_version"),
                "page_count": page_count,
                "bytes_in": bytes_in,
                "bytes_out": bytes_out,
                "cloud_run_ms": cloud_run_ms,
                "duration_ms": duration_ms,
                "requested_mode": requested_mode,
                "effective_mode": effective_mode,
                "auto_mode_selected": effective_mode != requested_mode,
                "ocr_page_ratio": _ocr_ratio(summary, page_count),
                "result_payload": {
                    "docling_path": docling_path,
                    "rasters_path": rasters_path,
                    "rasters_manifest_path": rasters_manifest_path,
                    "page_raster_paths": page_raster_paths,
                    "legacy_rasters_path": legacy_rasters_path,
                    "doctags_path": doctags_path,
                    "markdown_path": markdown_path,
                    "outline_path": outline_path,
                    "page_count": page_count,
                    "page_languages": parse_result.get("page_languages") or {},
                    "outline_node_count": len(outline),
                    "summary": summary,
                    "mode": effective_mode,
                    "requested_mode": requested_mode,
                    "auto_mode_selected": effective_mode != requested_mode,
                    "cache_hit": False,
                },
            })
    except SidecarError as exc:
        LOG.warning("async job failed (sidecar error): %s", exc.message)
        async with httpx.AsyncClient(timeout=30) as client:
            await _post_callback(client, callback_url, callback_token, job_id, {
                "job_id": job_id,
                "status": "failed",
                "error_code": exc.error_code,
                "message": exc.message,
                "retryable": exc.retryable,
            })
    except Exception as exc:
        LOG.exception("async job unhandled failure")
        async with httpx.AsyncClient(timeout=30) as client:
            await _post_callback(client, callback_url, callback_token, job_id, {
                "job_id": job_id,
                "status": "failed",
                "error_code": "sidecar_async_unhandled",
                "message": str(exc)[:500],
                "retryable": True,
            })


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": True,
        "engine_version": ENGINE_VERSION,
        "callback_upload_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
    }


@app.get("/")
def root() -> dict:
    return {"service": "pdf-parse-service", "engine_version": ENGINE_VERSION}


@app.post("/parse")
async def parse(req: ParseRequest, background_tasks: BackgroundTasks):
    # Wave F-Option-3: callback mode — when callback fields are present, run as
    # background task and return 202 immediately so the edge dispatcher never
    # waits on Docling. Requires storage upload env to be configured.
    if req.callback_url and req.callback_token and req.job_id:
        if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
            raise SidecarError(
                503,
                "callback_upload_not_configured",
                "Callback mode requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the sidecar.",
                retryable=False,
            )
        background_tasks.add_task(_run_async_job, req)
        return JSONResponse(
            {"accepted": True, "job_id": req.job_id, "engine_version": ENGINE_VERSION, "mode": "callback"},
            status_code=202,
        )

    # Legacy synchronous mode (backwards compatible).
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    use_description = (
        req.enable_picture_description
        if req.enable_picture_description is not None
        else ENABLE_PICTURE_DESCRIPTION_DEFAULT
    )
    return _do_parse(
        pdf_bytes,
        use_description=use_description,
        include_doctags=req.include_doctags,
        include_markdown=req.include_markdown,
        redact_pii=req.redact_pii,
    )


@app.post("/raster")
async def raster(req: RasterRequest) -> dict:
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    return _do_raster(pdf_bytes, dpi=req.dpi, fmt=req.format, pages=req.pages)


# ---------------------------------------------------------------------------
# Chunked pipeline (Wave G) — additive; legacy /parse path untouched.
# ---------------------------------------------------------------------------
# A 100+ page PDF is too heavy to parse in a single Cloud Run invocation
# (memory + 300s timeout). The dispatcher plans page ranges and fans them out
# to /parse-chunk. Each chunk runs Docling on a small temporary PDF carved out
# with pypdfium2, uploads its artifacts to chunks/<chunk_index>/ in the
# diagnostics bucket, and POSTs to a Supabase chunk-callback edge function.

class PlanRequest(BaseModel):
    url: Optional[str] = None
    pdf_base64: Optional[str] = None
    mode: str = Field(default="hybrid")
    max_chunk_pages: Optional[int] = Field(default=None, ge=1, le=50)
    force_chunking: bool = Field(default=False)


class ChunkRequest(BaseModel):
    job_id: str
    chunk_id: str
    chunk_index: int
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    url: Optional[str] = None
    pdf_base64: Optional[str] = None
    mode: str = Field(default="semantic")
    callback_url: str
    callback_token: str
    enable_picture_description: Optional[bool] = None
    include_doctags: bool = True
    include_markdown: bool = True
    redact_pii: bool = False
    raster_dpi: Optional[int] = Field(default=None, ge=72, le=300)
    raster_format: str = Field(default="png", pattern="^(png|jpeg)$")


def _extract_page_range(pdf_bytes: bytes, page_start: int, page_end: int) -> tuple[bytes, int]:
    """Carve [page_start, page_end] (1-based, inclusive) into a new in-memory PDF.

    Returns (bytes, actual_page_count). Raises SidecarError on out-of-range.
    """
    try:
        src = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise SidecarError(400, "source_fetch_error", f"Could not open source PDF: {exc}", retryable=False) from exc
    total = len(src)
    start = max(1, page_start)
    end = min(total, page_end)
    if start > end:
        raise SidecarError(400, "chunk_out_of_range", f"page range {page_start}-{page_end} outside 1-{total}", retryable=False)
    try:
        dst = pdfium.PdfDocument.new()
        dst.import_pages(src, pages=list(range(start - 1, end)))
        buf = io.BytesIO()
        dst.save(buf)
        return buf.getvalue(), (end - start + 1)
    except Exception as exc:
        raise SidecarError(500, "chunk_extract_failed", f"Failed to extract chunk: {exc}", retryable=True) from exc


def _quick_ocr_hint(pdf_bytes: bytes, sample_pages: int = 3) -> dict:
    """Cheap heuristic: sample up to N pages and check if pypdfium can pull text.

    A page with very little extractable text → likely scanned/needs OCR. The
    dispatcher uses this to pick smaller chunk sizes (OCR is ~5× slower).
    """
    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise SidecarError(400, "source_fetch_error", f"Could not open PDF for planning: {exc}", retryable=False) from exc
    n = len(pdf)
    if n == 0:
        return {"page_count": 0, "ocr_hint": False, "scanned_page_ratio": 0.0}
    sample = min(sample_pages, n)
    # Sample evenly across the document.
    indices = sorted({int(round(i * (n - 1) / max(1, sample - 1))) for i in range(sample)})
    low_text = 0
    for idx in indices:
        try:
            tp = pdf[idx].get_textpage()
            text = tp.get_text_range()
            tp.close()
        except Exception:
            text = ""
        if len((text or "").strip()) < 40:
            low_text += 1
    ratio = low_text / float(len(indices))
    return {
        "page_count": n,
        "scanned_page_ratio": round(ratio, 3),
        "ocr_hint": ratio >= 0.5,
    }


async def _post_chunk_callback(
    callback_url: str,
    callback_token: str,
    job_id: str,
    payload: dict,
) -> None:
    headers = {
        "Authorization": f"Bearer {callback_token}",
        "Content-Type": "application/json",
        "X-Request-Id": job_id,
    }
    # Retry callback up to 3× on transient failures so a flaky edge bounce
    # doesn't leave the dispatcher waiting on a chunk that already finished.
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(callback_url, json=payload, headers=headers)
                if resp.status_code < 300:
                    return
                LOG.error("chunk callback failed %s (attempt %d): %s", resp.status_code, attempt, resp.text[:300])
                if resp.status_code < 500 and resp.status_code != 429:
                    return  # 4xx (not 429) is permanent
        except Exception as exc:
            LOG.error("chunk callback exception (attempt %d): %s", attempt, exc)
        await __import__("asyncio").sleep(2 ** attempt)


async def _run_chunk_job(req: ChunkRequest) -> None:
    started = time.monotonic()
    artifacts: dict[str, Optional[str]] = {}
    bytes_in = 0
    bytes_out = 0
    try:
        pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
        bytes_in = len(pdf_bytes)
        chunk_pdf, actual_pages = _extract_page_range(pdf_bytes, req.page_start, req.page_end)

        use_description = (
            req.enable_picture_description
            if req.enable_picture_description is not None
            else ENABLE_PICTURE_DESCRIPTION_DEFAULT
        )
        parse_result = _do_parse(
            chunk_pdf,
            use_description=use_description,
            include_doctags=req.include_doctags,
            include_markdown=req.include_markdown,
            redact_pii=req.redact_pii,
        )

        prefix = f"{req.job_id}/chunks/{req.chunk_index:04d}"
        async with httpx.AsyncClient(timeout=120) as client:
            doclingDoc = parse_result.get("docling_document") or {}
            picture_bytes = await _upload_picture_assets(client, f"{req.job_id}/chunks/{req.chunk_index:04d}", doclingDoc)
            bytes_out += picture_bytes

            docling_body = json.dumps(doclingDoc).encode("utf-8")
            artifacts["docling_path"] = await _storage_upload(client, f"{prefix}/docling.json", docling_body, "application/json")
            bytes_out += len(docling_body)
            if parse_result.get("doctags"):
                body = str(parse_result["doctags"]).encode("utf-8")
                artifacts["doctags_path"] = await _storage_upload(client, f"{prefix}/doctags.md", body, "text/markdown")
                bytes_out += len(body)
            if parse_result.get("markdown"):
                body = str(parse_result["markdown"]).encode("utf-8")
                artifacts["markdown_path"] = await _storage_upload(client, f"{prefix}/document.md", body, "text/markdown")
                bytes_out += len(body)
            outline = parse_result.get("outline") or []
            outline_body = json.dumps({
                "outline": outline,
                "page_languages": parse_result.get("page_languages") or {},
            }).encode("utf-8")
            artifacts["outline_path"] = await _storage_upload(client, f"{prefix}/outline.json", outline_body, "application/json")
            bytes_out += len(outline_body)

            # Raster the chunk only when the mode demands page images.
            mode = (req.mode or "semantic").lower()
            if mode in {"hybrid", "pixel_perfect", "pixel-perfect"}:
                dpi = req.raster_dpi or (200 if "pixel" in mode else 144)
                try:
                    raster_fmt = (req.raster_format or RASTER_FORMAT or "png").lower()
                    raster_result = _do_raster(chunk_pdf, dpi=dpi, fmt=raster_fmt)
                    normalized = {
                        "format": raster_result.get("format"),
                        "dpi": raster_result.get("dpi"),
                        "engine_version": raster_result.get("engine_version"),
                        # NOTE: chunk-local page_no — finalizer rebases to global page numbers.
                        "pages": [
                            {
                                "page_no": page.get("page_no"),
                                "global_page_no": req.page_start + int(page.get("page_no", 1)) - 1,
                                "width": page.get("width_px"),
                                "height": page.get("height_px"),
                                "image_base64": page.get("base64"),
                            }
                            for page in raster_result.get("pages") or []
                        ],
                    }

                    if RASTER_ARTIFACT_MODE == "manifest":
                        raster_artifacts = await _upload_raster_manifest_artifacts(
                            client,
                            prefix,
                            raster_result,
                            global_page_offset=req.page_start - 1,
                        )
                        artifacts["rasters_manifest_path"] = raster_artifacts.get("rasters_manifest_path")
                        artifacts["page_raster_paths"] = raster_artifacts.get("page_raster_paths") or []
                        bytes_out += int(raster_artifacts.get("bytes_out") or 0)

                        if WRITE_LEGACY_RASTERS_JSON:
                            raster_body = json.dumps(normalized).encode("utf-8")
                            artifacts["legacy_rasters_path"] = await _storage_upload(
                                client,
                                f"{prefix}/rasters.json",
                                raster_body,
                                "application/json",
                            )
                            artifacts["rasters_path"] = artifacts["legacy_rasters_path"]
                            bytes_out += len(raster_body)
                        else:
                            LOG.info("Legacy chunk rasters.json skipped prefix=%s", prefix)
                    else:
                        raster_body = json.dumps(normalized).encode("utf-8")
                        artifacts["rasters_path"] = await _storage_upload(
                            client,
                            f"{prefix}/rasters.json",
                            raster_body,
                            "application/json",
                        )
                        bytes_out += len(raster_body)
                except SidecarError as exc:
                    LOG.warning("chunk raster failed (continuing): %s", exc.message)

        duration_ms = int((time.monotonic() - started) * 1000)
        await _post_chunk_callback(req.callback_url, req.callback_token, req.job_id, {
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "status": "succeeded",
            "engine_version": ENGINE_VERSION,
            "page_start": req.page_start,
            "page_end": req.page_end,
            "actual_pages": actual_pages,
            "artifact_paths": artifacts,
            "summary": parse_result.get("summary") or {},
            "bytes_in": bytes_in,
            "bytes_out": bytes_out,
            "duration_ms": duration_ms,
        })
    except SidecarError as exc:
        LOG.warning("chunk job %s/%d failed: %s", req.job_id, req.chunk_index, exc.message)
        await _post_chunk_callback(req.callback_url, req.callback_token, req.job_id, {
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "status": "failed",
            "error_code": exc.error_code,
            "message": exc.message,
            "retryable": exc.retryable,
            "page_start": req.page_start,
            "page_end": req.page_end,
            "duration_ms": int((time.monotonic() - started) * 1000),
        })
    except MemoryError as exc:
        LOG.exception("chunk job %s/%d OOM", req.job_id, req.chunk_index)
        await _post_chunk_callback(req.callback_url, req.callback_token, req.job_id, {
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "status": "failed",
            "error_code": "chunk_oom",
            "message": str(exc)[:300],
            "retryable": True,
            "page_start": req.page_start,
            "page_end": req.page_end,
        })
    except Exception as exc:
        LOG.exception("chunk job %s/%d unhandled", req.job_id, req.chunk_index)
        await _post_chunk_callback(req.callback_url, req.callback_token, req.job_id, {
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "status": "failed",
            "error_code": "chunk_unhandled",
            "message": str(exc)[:500],
            "retryable": True,
            "page_start": req.page_start,
            "page_end": req.page_end,
        })


def _safe_pdf_text_for_page(page) -> str:
    try:
        textpage = page.get_textpage()
        try:
            return textpage.get_text_range() or ""
        finally:
            try:
                textpage.close()
            except Exception:
                pass
    except Exception:
        return ""


def _estimate_plan_from_pdf(pdf_bytes: bytes, mode: str, max_chunk_pages: Optional[int], force_chunking: bool) -> dict:
    started = time.monotonic()
    pdf = pdfium.PdfDocument(pdf_bytes)
    page_count = len(pdf)

    sample_indices: list[int] = []
    if page_count:
        sample_indices = sorted(set([
            0,
            min(page_count - 1, page_count // 2),
            page_count - 1,
            *range(0, min(page_count, 5)),
        ]))

    sampled_chars = 0
    pages_with_text = 0
    digit_count = 0
    currency_count = 0
    table_hint_count = 0

    for idx in sample_indices:
        try:
            page = pdf[idx]
            text = _safe_pdf_text_for_page(page)
        except Exception:
            text = ""

        clean = " ".join(text.split())
        char_count = len(clean)
        sampled_chars += char_count

        if char_count >= 40:
            pages_with_text += 1

        digit_count += sum(ch.isdigit() for ch in clean)
        currency_count += sum(1 for ch in clean if ch in "$£€¥%")
        # Heuristic: repeated numeric columns / finance report style.
        table_hint_count += clean.count("%") + clean.count("$") + clean.count("|")

    sample_count = max(1, len(sample_indices))
    selectable_text_ratio = round(pages_with_text / sample_count, 4)
    scanned_page_ratio = round(1.0 - selectable_text_ratio, 4)
    ocr_hint = scanned_page_ratio >= 0.35 or sampled_chars < max(80, sample_count * 40)

    bytes_per_page = len(pdf_bytes) / max(1, page_count)
    image_heavy = bytes_per_page > 900_000 and selectable_text_ratio < 0.75
    design_heavy = image_heavy or (bytes_per_page > 650_000 and table_hint_count < 3)

    table_score = digit_count + (currency_count * 5) + (table_hint_count * 8)
    if table_score > 250:
        table_likelihood = "high"
    elif table_score > 80:
        table_likelihood = "medium"
    else:
        table_likelihood = "low"

    if page_count >= 80 or image_heavy or ocr_hint:
        estimated_complexity = "high"
    elif page_count >= 25 or table_likelihood in {"medium", "high"} or design_heavy:
        estimated_complexity = "medium"
    else:
        estimated_complexity = "low"

    requested_mode = (mode or "hybrid").replace("_", "-").lower()

    if requested_mode in {"pixel-perfect", "pixel"}:
        recommended_mode = "pixel-perfect"
        recommended_lane = "pixel_raster_only"
    elif ocr_hint:
        recommended_mode = "hybrid"
        recommended_lane = "ocr_scanned"
    elif design_heavy:
        recommended_mode = "hybrid"
        recommended_lane = "design_heavy"
    elif table_likelihood == "high":
        recommended_mode = "hybrid"
        recommended_lane = "accurate_table"
    else:
        recommended_mode = "hybrid"
        recommended_lane = "fast_native"

    if max_chunk_pages:
        recommended_chunk_size = min(max_chunk_pages, page_count or max_chunk_pages)
    elif recommended_lane in {"ocr_scanned", "design_heavy", "pixel_raster_only"}:
        recommended_chunk_size = 5
    elif page_count <= 20 and not force_chunking:
        recommended_chunk_size = page_count or 1
    elif page_count <= 60:
        recommended_chunk_size = 10
    else:
        recommended_chunk_size = 5

    recommended_chunk_size = max(1, min(int(recommended_chunk_size), 50))

    requires_raster = recommended_mode in {"hybrid", "pixel-perfect"} or recommended_lane in {"design_heavy", "pixel_raster_only", "ocr_scanned"}
    requires_ocr = recommended_lane == "ocr_scanned"
    requires_picture_description = recommended_lane == "design_heavy" and image_heavy

    plan_ms = int((time.monotonic() - started) * 1000)

    return {
        "engine_version": ENGINE_VERSION,
        "file_type": "pdf",
        "page_count": page_count,
        "byte_size": len(pdf_bytes),
        "has_selectable_text": selectable_text_ratio > 0.0,
        "selectable_text_ratio": selectable_text_ratio,
        "scanned_page_ratio": scanned_page_ratio,
        "ocr_hint": ocr_hint,
        "estimated_complexity": estimated_complexity,
        "table_likelihood": table_likelihood,
        "image_heavy": image_heavy,
        "design_heavy": design_heavy,
        "recommended_mode": recommended_mode,
        "recommended_lane": recommended_lane,
        "recommended_chunk_size": recommended_chunk_size,
        "requires_raster": requires_raster,
        "requires_ocr": requires_ocr,
        "requires_picture_description": requires_picture_description,
        "plan_ms": plan_ms,
        "max_pdf_bytes": MAX_PDF_BYTES,
    }


@app.post("/plan")
async def plan(req: PlanRequest) -> dict:
    """Phase 1 preflight router. Counts pages and recommends extraction lane without running Docling."""
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    try:
        return _estimate_plan_from_pdf(
            pdf_bytes,
            req.mode,
            req.max_chunk_pages,
            req.force_chunking,
        )
    except SidecarError:
        raise
    except Exception as exc:
        raise SidecarError(
            400,
            "plan_failed",
            f"Could not generate PDF preflight plan: {exc}",
            retryable=False,
        ) from exc


@app.post("/parse")
async def parse(req: ParseRequest, background_tasks: BackgroundTasks):
    # Wave F-Option-3: callback mode — when callback fields are present, run as
    # background task and return 202 immediately so the edge dispatcher never
    # waits on Docling. Requires storage upload env to be configured.
    if req.callback_url and req.callback_token and req.job_id:
        if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
            raise SidecarError(
                503,
                "callback_upload_not_configured",
                "Callback mode requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the sidecar.",
                retryable=False,
            )
        background_tasks.add_task(_run_async_job, req)
        return JSONResponse(
            {"accepted": True, "job_id": req.job_id, "engine_version": ENGINE_VERSION, "mode": "callback"},
            status_code=202,
        )

    # Legacy synchronous mode (backwards compatible).
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    use_description = (
        req.enable_picture_description
        if req.enable_picture_description is not None
        else ENABLE_PICTURE_DESCRIPTION_DEFAULT
    )
    return _do_parse(
        pdf_bytes,
        use_description=use_description,
        include_doctags=req.include_doctags,
        include_markdown=req.include_markdown,
        redact_pii=req.redact_pii,
    )


@app.post("/raster")
async def raster(req: RasterRequest) -> dict:
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    return _do_raster(pdf_bytes, dpi=req.dpi, fmt=req.format, pages=req.pages)


# ---------------------------------------------------------------------------
# Chunked pipeline (Wave G) — additive; legacy /parse path untouched.
# ---------------------------------------------------------------------------
# A 100+ page PDF is too heavy to parse in a single Cloud Run invocation
# (memory + 300s timeout). The dispatcher plans page ranges and fans them out
# to /parse-chunk. Each chunk runs Docling on a small temporary PDF carved out
# with pypdfium2, uploads its artifacts to chunks/<chunk_index>/ in the
# diagnostics bucket, and POSTs to a Supabase chunk-callback edge function.


# /parse-chunk uses the single PlanRequest/ChunkRequest/_run_chunk_job definitions above.

@app.post("/parse-chunk")
async def parse_chunk(req: ChunkRequest, background_tasks: BackgroundTasks):
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise SidecarError(
            503,
            "callback_upload_not_configured",
            "/parse-chunk requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the sidecar.",
            retryable=False,
        )
    background_tasks.add_task(_run_chunk_job, req)
    return JSONResponse(
        {
            "accepted": True,
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "page_start": req.page_start,
            "page_end": req.page_end,
            "engine_version": ENGINE_VERSION,
        },
        status_code=202,
    )
