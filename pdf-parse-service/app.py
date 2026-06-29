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
import importlib.metadata as importlib_metadata
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

try:
    import fitz  # PyMuPDF (AGPL-3.0) — see NOTICE.md. Phase 2 vector + typography pass.
    _FITZ_AVAILABLE = True
except Exception:  # pragma: no cover - extraction degrades gracefully without fitz
    fitz = None  # type: ignore
    _FITZ_AVAILABLE = False

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
ENGINE_VERSION = "docling-2.14.0+phaseD+waveD+option3+waveG-chunked+phase1-plan-router+phase3-raster-manifest+phase4j-capability-activation+phase2-fitz-vectors-typography+phase3-fonts"
DOCLING_CAPABILITY_ACTIVATION_VERSION = "docling-capability-activation-v1"
MAX_PDF_BYTES = int(os.environ.get("DOCLING_MAX_PDF_MB", "75")) * 1024 * 1024
# Phase 3 raster artifact config.
RASTER_ARTIFACT_MODE = os.environ.get("DOCLING_RASTER_ARTIFACT_MODE", "manifest").lower()
WRITE_LEGACY_RASTERS_JSON = os.environ.get("DOCLING_WRITE_LEGACY_RASTERS_JSON", "false").lower() == "true"
RASTER_FORMAT = os.environ.get("DOCLING_RASTER_FORMAT", "png").lower()
# Phase 2: raise the default reference-raster DPI for a crisper builder underlay.
# (Cloud Run memory/time scales with DPI^2 — override down if cold-starts regress.)
RASTER_DPI = int(os.environ.get("DOCLING_RASTER_DPI", "300"))
# Phase 2: PyMuPDF vector/typography extraction toggles. (_env_bool is defined
# below; keep this check self-contained so module import order doesn't matter.)
ENABLE_FITZ_LAYERS = os.environ.get("DOCLING_ENABLE_FITZ_LAYERS", "true").strip().lower() not in {"", "0", "false", "no"}
MAX_VECTORS_PER_PAGE = int(os.environ.get("DOCLING_MAX_VECTORS_PER_PAGE", "400"))
MIN_VECTOR_SIZE_PT = float(os.environ.get("DOCLING_MIN_VECTOR_SIZE_PT", "1.0"))
# Phase 3: font metadata extraction (names + embeddable programs).
MAX_FONTS = int(os.environ.get("DOCLING_MAX_FONTS", "48"))
MAX_FONT_BYTES = int(os.environ.get("DOCLING_MAX_FONT_BYTES", str(512 * 1024)))

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
TABLE_MODE = os.environ.get("DOCLING_TABLE_MODE", "ACCURATE").strip().upper() or "ACCURATE"
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


def _resolve_table_former_mode(mode: Optional[str]) -> Any:
    requested = (mode or TABLE_MODE or "ACCURATE").strip().upper()
    if requested in {"ACCURATE", "PRECISE", "HIGH"}:
        return getattr(TableFormerMode, "ACCURATE", TableFormerMode.FAST)
    if requested in {"FAST", "QUICK"}:
        return TableFormerMode.FAST
    LOG.warning("Unknown DOCLING_TABLE_MODE=%s; falling back to ACCURATE", requested)
    return getattr(TableFormerMode, "ACCURATE", TableFormerMode.FAST)


def _converter_key(*, enable_picture_description: bool, force_full_page_ocr: Optional[bool], table_mode: Optional[str]) -> tuple[bool, bool, str]:
    effective_force_ocr = bool(force_full_page_ocr if force_full_page_ocr is not None else (FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK))
    effective_table_mode = (table_mode or TABLE_MODE or "ACCURATE").strip().upper()
    return (bool(enable_picture_description), effective_force_ocr, effective_table_mode)


def _build_converter(
    *,
    enable_picture_description: bool,
    force_full_page_ocr: Optional[bool] = None,
    table_mode: Optional[str] = None,
) -> DocumentConverter:
    effective_force_ocr = bool(force_full_page_ocr if force_full_page_ocr is not None else (FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK))
    effective_table_mode = (table_mode or TABLE_MODE or "ACCURATE").strip().upper()

    pipeline = PdfPipelineOptions()
    pipeline.do_ocr = True
    pipeline.do_table_structure = True
    pipeline.table_structure_options.mode = _resolve_table_former_mode(effective_table_mode)
    pipeline.table_structure_options.do_cell_matching = True
    pipeline.generate_page_images = False
    pipeline.generate_picture_images = True
    _safe_set(pipeline, "images_scale", IMAGES_SCALE)

    if ENABLE_PICTURE_CLASSIFICATION:
        _safe_set(pipeline, "do_picture_classification", True)
    if enable_picture_description:
        _safe_set(pipeline, "do_picture_description", True)

    formula_supported = _safe_set(pipeline, "do_formula_enrichment", True) if ENABLE_FORMULA_ENRICHMENT else False
    code_supported = _safe_set(pipeline, "do_code_enrichment", True) if ENABLE_CODE_ENRICHMENT else False

    ocr_opts = getattr(pipeline, "ocr_options", None)
    if ocr_opts is not None:
        _safe_set(ocr_opts, "force_full_page_ocr", effective_force_ocr)
        if OCR_LANGS:
            _safe_set(ocr_opts, "lang", OCR_LANGS)
        _safe_set(ocr_opts, "bitmap_area_threshold", BITMAP_AREA_THRESHOLD)
    else:
        _safe_set(pipeline, "force_full_page_ocr", effective_force_ocr)

    try:
        from docling.datamodel.pipeline_options import AcceleratorOptions, AcceleratorDevice  # type: ignore
        try:
            device = getattr(AcceleratorDevice, ACCEL_DEVICE, AcceleratorDevice.AUTO)
        except Exception:
            device = AcceleratorDevice.AUTO
        _safe_set(
            pipeline,
            "accelerator_options",
            AcceleratorOptions(num_threads=ACCEL_THREADS, device=device),
        )
    except Exception as exc:  # pragma: no cover
        LOG.info("AcceleratorOptions not available in this Docling build: %s", exc)

    if LAYOUT_MODEL:
        if not _safe_set(pipeline, "layout_model", LAYOUT_MODEL):
            layout_opts = getattr(pipeline, "layout_options", None)
            if layout_opts is not None:
                _safe_set(layout_opts, "model", LAYOUT_MODEL)

    LOG.info(
        "Building Docling converter variant picture_description=%s force_full_page_ocr=%s table_mode=%s formula_enrichment_supported=%s code_enrichment_supported=%s",
        enable_picture_description,
        effective_force_ocr,
        effective_table_mode,
        formula_supported,
        code_supported,
    )

    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)}
    )


CONVERTER = _build_converter(
    enable_picture_description=ENABLE_PICTURE_DESCRIPTION_DEFAULT,
    force_full_page_ocr=FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK,
    table_mode=TABLE_MODE,
)
_CONVERTER_VARIANTS: dict[tuple[bool, bool, str], DocumentConverter] = {
    _converter_key(
        enable_picture_description=ENABLE_PICTURE_DESCRIPTION_DEFAULT,
        force_full_page_ocr=FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK,
        table_mode=TABLE_MODE,
    ): CONVERTER
}


def _get_converter(
    enable_picture_description: bool,
    *,
    force_full_page_ocr: Optional[bool] = None,
    table_mode: Optional[str] = None,
) -> DocumentConverter:
    key = _converter_key(
        enable_picture_description=enable_picture_description,
        force_full_page_ocr=force_full_page_ocr,
        table_mode=table_mode,
    )
    cached = _CONVERTER_VARIANTS.get(key)
    if cached is not None:
        return cached
    built = _build_converter(
        enable_picture_description=enable_picture_description,
        force_full_page_ocr=force_full_page_ocr,
        table_mode=table_mode,
    )
    _CONVERTER_VARIANTS[key] = built
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
    extractor_lane: Optional[str] = None
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


# ---------------------------------------------------------------------------
# Phase 2 — PyMuPDF (fitz) vector + typography extraction
# ---------------------------------------------------------------------------
def _fmt(n: float) -> str:
    return f"{float(n):.2f}".rstrip("0").rstrip(".")


def _fitz_fill_color_to_hex(color: Any) -> Optional[str]:
    """fitz drawing fill/stroke colors are (r,g,b) floats in 0..1, or None."""
    if not color:
        return None
    try:
        r, g, b = float(color[0]), float(color[1]), float(color[2])
    except Exception:
        return None
    clamp = lambda v: max(0, min(255, round(v * 255)))
    return "#%02x%02x%02x" % (clamp(r), clamp(g), clamp(b))


def _fitz_span_color_to_hex(color: Any) -> Optional[str]:
    """get_text('dict') span colors are packed sRGB integers."""
    try:
        c = int(color)
    except Exception:
        return None
    if c < 0:
        return None
    return "#%02x%02x%02x" % ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def _drawing_to_svg_path(drawing: dict) -> str:
    parts: list[str] = []
    for it in drawing.get("items", []) or []:
        try:
            op = it[0]
            if op == "l":
                p1, p2 = it[1], it[2]
                parts.append(f"M{_fmt(p1.x)},{_fmt(p1.y)} L{_fmt(p2.x)},{_fmt(p2.y)}")
            elif op == "c":
                p1, p2, p3, p4 = it[1], it[2], it[3], it[4]
                parts.append(
                    f"M{_fmt(p1.x)},{_fmt(p1.y)} C{_fmt(p2.x)},{_fmt(p2.y)} "
                    f"{_fmt(p3.x)},{_fmt(p3.y)} {_fmt(p4.x)},{_fmt(p4.y)}"
                )
            elif op == "re":
                r = it[1]
                parts.append(f"M{_fmt(r.x0)},{_fmt(r.y0)} H{_fmt(r.x1)} V{_fmt(r.y1)} H{_fmt(r.x0)} Z")
            elif op == "qu":
                q = it[1]
                parts.append(
                    f"M{_fmt(q.ul.x)},{_fmt(q.ul.y)} L{_fmt(q.ur.x)},{_fmt(q.ur.y)} "
                    f"L{_fmt(q.lr.x)},{_fmt(q.lr.y)} L{_fmt(q.ll.x)},{_fmt(q.ll.y)} Z"
                )
        except Exception:
            continue
    return " ".join(parts)


def _page_vectors(page) -> list[dict]:
    """Extract vector drawings for one fitz page → DoclingVectorItem-shaped dicts."""
    out: list[dict] = []
    try:
        drawings = page.get_drawings()
    except Exception as exc:  # pragma: no cover
        LOG.warning("fitz get_drawings failed: %s", exc)
        return out
    for d in drawings:
        rect = d.get("rect")
        if rect is None:
            continue
        w = float(rect.x1 - rect.x0)
        h = float(rect.y1 - rect.y0)
        if w < MIN_VECTOR_SIZE_PT and h < MIN_VECTOR_SIZE_PT:
            continue
        path_d = _drawing_to_svg_path(d)
        if not path_d:
            continue
        dtype = d.get("type") or ""
        fill = _fitz_fill_color_to_hex(d.get("fill")) if "f" in dtype else None
        stroke = _fitz_fill_color_to_hex(d.get("color")) if "s" in dtype else None
        if not fill and not stroke:
            stroke = _fitz_fill_color_to_hex(d.get("color")) or "#000000"
        path: dict[str, Any] = {"d": path_d}
        if fill:
            path["fill"] = fill
        if stroke:
            path["stroke"] = stroke
            path["strokeWidth"] = float(d.get("width") or 1.0)
        if d.get("even_odd"):
            path["fillRule"] = "evenodd"
        opacity = d.get("fill_opacity")
        if opacity is None:
            opacity = d.get("stroke_opacity")
        if isinstance(opacity, (int, float)) and 0 <= opacity < 1:
            path["opacity"] = float(opacity)
        out.append({
            "viewBox": f"{_fmt(float(rect.x0))} {_fmt(float(rect.y0))} {_fmt(w)} {_fmt(h)}",
            "paths": [path],
            "bbox": {"l": float(rect.x0), "t": float(rect.y0), "r": float(rect.x1), "b": float(rect.y1)},
            "confidence": 0.9,
        })
        if len(out) >= MAX_VECTORS_PER_PAGE:
            break
    return out


def _page_text_lines(page) -> list[dict]:
    """Flatten get_text('dict') into per-line records for typography reconciliation."""
    lines: list[dict] = []
    try:
        data = page.get_text("dict")
    except Exception as exc:  # pragma: no cover
        LOG.warning("fitz get_text(dict) failed: %s", exc)
        return lines
    for block in data.get("blocks", []) or []:
        if block.get("type", 0) != 0:
            continue  # 0 = text block
        for line in block.get("lines", []) or []:
            spans = line.get("spans", []) or []
            if not spans:
                continue
            dom = max(spans, key=lambda s: (s.get("bbox", [0, 0, 0, 0])[2] - s.get("bbox", [0, 0, 0, 0])[0]))
            lbbox = line.get("bbox") or dom.get("bbox") or [0, 0, 0, 0]
            origin = dom.get("origin") or [lbbox[0], lbbox[3]]
            flags = int(dom.get("flags") or 0)
            lines.append({
                "bbox": [float(lbbox[0]), float(lbbox[1]), float(lbbox[2]), float(lbbox[3])],
                "origin_y": float(origin[1]),
                "size": float(dom.get("size") or 0.0),
                "font": str(dom.get("font") or ""),
                "bold": bool(flags & 16),
                "italic": bool(flags & 2),
                "color": _fitz_span_color_to_hex(dom.get("color")),
            })
    return lines


def _extract_fitz_layers(pdf_bytes: bytes) -> dict[int, dict]:
    """Per-(1-based)-page {vectors, text_lines} extracted via PyMuPDF."""
    result: dict[int, dict] = {}
    if not (_FITZ_AVAILABLE and ENABLE_FITZ_LAYERS):
        return result
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # pragma: no cover
        LOG.warning("fitz open failed; skipping vector/typography pass: %s", exc)
        return result
    try:
        for idx in range(doc.page_count):
            try:
                page = doc.load_page(idx)
                result[idx + 1] = {"vectors": _page_vectors(page), "text_lines": _page_text_lines(page)}
            except Exception as exc:  # pragma: no cover
                LOG.warning("fitz page %d extraction failed: %s", idx + 1, exc)
    finally:
        doc.close()
    return result


def _bbox_to_tl(bbox: Any, page_height: float) -> Optional[tuple[float, float, float, float]]:
    """Normalise a Docling bbox (dict or [l,t,r,b]) to top-left (x0,y0,x1,y1)."""
    if isinstance(bbox, dict):
        l, t, r, b = bbox.get("l"), bbox.get("t"), bbox.get("r"), bbox.get("b")
        origin = str(bbox.get("coord_origin") or "TOPLEFT").upper()
    elif isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
        l, t, r, b = bbox[0], bbox[1], bbox[2], bbox[3]
        origin = "TOPLEFT"
    else:
        return None
    try:
        l, t, r, b = float(l), float(t), float(r), float(b)
    except Exception:
        return None
    if origin == "BOTTOMLEFT" and page_height:
        y0, y1 = page_height - max(t, b), page_height - min(t, b)
    else:
        y0, y1 = min(t, b), max(t, b)
    return (min(l, r), y0, max(l, r), y1)


def _infer_alignment(lines: list[dict], ix0: float, ix1: float) -> str:
    width = max(1.0, ix1 - ix0)
    n = len(lines)
    if not n:
        return "left"
    left_gaps = [ln["bbox"][0] - ix0 for ln in lines]
    right_gaps = [ix1 - ln["bbox"][2] for ln in lines]
    fills = [(ln["bbox"][2] - ln["bbox"][0]) / width for ln in lines]
    avg_left = sum(left_gaps) / n
    avg_right = sum(right_gaps) / n
    tol = max(2.0, width * 0.02)
    if n >= 2 and sum(1 for f in fills if f >= 0.95) >= n - 1:
        return "justify"
    if avg_left <= tol and avg_right > tol:
        return "left"
    if avg_right <= tol and avg_left > tol:
        return "right"
    if abs(avg_left - avg_right) <= tol and avg_left > tol:
        return "center"
    return "left"


def _enrich_text_typography(doc_dict: dict, fitz_by_page: dict[int, dict]) -> None:
    """Reconcile fitz line geometry into Docling text items (line-height, align, font)."""
    pages = doc_dict.get("pages") or {}

    def page_height(pn: Any) -> float:
        p = pages.get(pn) or pages.get(str(pn)) or {}
        size = p.get("size") or {}
        try:
            return float(size.get("height") or 0.0)
        except Exception:
            return 0.0

    for item in doc_dict.get("texts") or []:
        prov = item.get("prov") or []
        if not prov:
            continue
        pn = prov[0].get("page_no")
        if pn is None:
            continue
        layer = fitz_by_page.get(int(pn))
        if not layer:
            continue
        ibox = _bbox_to_tl(prov[0].get("bbox"), page_height(pn))
        if not ibox:
            continue
        ix0, iy0, ix1, iy1 = ibox
        matched = []
        for ln in layer.get("text_lines", []):
            lx0, ly0, lx1, ly1 = ln["bbox"]
            cy, cx = (ly0 + ly1) / 2, (lx0 + lx1) / 2
            if iy0 - 1 <= cy <= iy1 + 1 and ix0 - 2 <= cx <= ix1 + 2:
                matched.append(ln)
        if not matched:
            continue
        matched.sort(key=lambda l: l["origin_y"])
        font = item.setdefault("font", {})
        sizes = [m["size"] for m in matched if m["size"] > 0]
        if len(matched) >= 2 and sizes:
            deltas = [matched[i + 1]["origin_y"] - matched[i]["origin_y"] for i in range(len(matched) - 1)]
            deltas = [d for d in deltas if d > 0]
            if deltas:
                med = sorted(deltas)[len(deltas) // 2]
                size = sorted(sizes)[len(sizes) // 2]
                if size > 0:
                    lh = med / size
                    if 0.8 <= lh <= 3.0:
                        font.setdefault("line_height", round(lh, 3))
        dom = max(matched, key=lambda l: (l["bbox"][2] - l["bbox"][0]))
        if not font.get("family") and dom["font"]:
            font["family"] = dom["font"]
        if not font.get("size") and dom["size"]:
            font["size"] = round(dom["size"], 2)
        if not font.get("color") and dom["color"]:
            font["color"] = dom["color"]
        if "weight" not in font and dom["bold"]:
            font["weight"] = 700
        if "italic" not in font and dom["italic"]:
            font["italic"] = True
        if "text_align" not in item:
            item["text_align"] = _infer_alignment(matched, ix0, ix1)


def _collect_vectors(fitz_by_page: dict[int, dict]) -> list[dict]:
    vectors: list[dict] = []
    for pn, layer in sorted(fitz_by_page.items()):
        for v in layer.get("vectors", []):
            bbox = dict(v.get("bbox") or {})
            bbox["coord_origin"] = "TOPLEFT"
            vectors.append({
                "prov": [{"page_no": int(pn), "bbox": bbox}],
                "viewBox": v.get("viewBox"),
                "paths": v.get("paths", []),
                "confidence": v.get("confidence", 0.9),
            })
    return vectors


def _extract_fitz_fonts(pdf_bytes: bytes) -> list[dict]:
    """Document fonts: names (for web-font matching) + embeddable programs.

    Only attaches `base64` for fonts that are safe to reuse as @font-face — i.e.
    NOT subsetted and carrying a usable unicode cmap. Subset/CID fonts (the common
    case) are surfaced name-only so the frontend can match them to a web font.
    """
    out: list[dict] = []
    if not (_FITZ_AVAILABLE and ENABLE_FITZ_LAYERS):
        return out
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # pragma: no cover
        LOG.warning("fitz open (fonts) failed: %s", exc)
        return out
    try:
        seen_xref: set[int] = set()
        seen_name: set[str] = set()
        for pno in range(doc.page_count):
            if len(out) >= MAX_FONTS:
                break
            try:
                fonts = doc.load_page(pno).get_fonts(full=True)
            except Exception as exc:  # pragma: no cover
                LOG.warning("fitz get_fonts page %d failed: %s", pno + 1, exc)
                continue
            for ent in fonts:
                if len(out) >= MAX_FONTS:
                    break
                xref = ent[0]
                if xref in seen_xref:
                    continue
                seen_xref.add(xref)
                ext = str(ent[1] or "").lower()
                basename = str(ent[3] or "")
                stripped = re.sub(r"^[A-Z]{6}\+", "", basename)
                # Dedup by family name — PDFs re-embed the same font (subset per
                # page) under many xrefs; one entry per name keeps doc.fonts small.
                if stripped.lower() in seen_name:
                    continue
                seen_name.add(stripped.lower())
                low = stripped.lower()
                entry: dict[str, Any] = {
                    "basename": stripped,
                    "psName": basename,
                    "ext": ext,
                    "subset": bool(re.match(r"^[A-Z]{6}\+", basename)),
                    "bold": "bold" in low,
                    "italic": ("italic" in low) or ("oblique" in low),
                }
                if ext in ("ttf", "otf"):
                    try:
                        _bn, e2, _st, buf = doc.extract_font(xref)
                        if buf:
                            entry["bytes"] = len(buf)
                            entry["mimetype"] = "font/ttf" if e2 == "ttf" else "font/otf"
                            font = fitz.Font(fontbuffer=buf)
                            entry["glyphCount"] = int(getattr(font, "glyph_count", 0) or 0)
                            hits = sum(1 for c in "AaEeRrTtOoNnIiSs" if font.has_glyph(ord(c)))
                            entry["hasUnicodeCmap"] = hits >= 6
                            # Embed only full (non-subset) fonts with a real cmap,
                            # within the size cap, so reconstructed text renders.
                            if (not entry["subset"]) and entry["hasUnicodeCmap"] and len(buf) <= MAX_FONT_BYTES:
                                entry["base64"] = base64.b64encode(buf).decode("ascii")
                    except Exception as exc:  # pragma: no cover
                        LOG.warning("fitz extract_font xref=%s failed: %s", xref, exc)
                out.append(entry)
    finally:
        doc.close()
    return out


def _do_parse(
    pdf_bytes: bytes,
    *,
    use_description: bool,
    include_doctags: bool,
    include_markdown: bool,
    redact_pii: bool,
    force_full_page_ocr: Optional[bool] = None,
    table_mode: Optional[str] = None,
) -> dict:
    """Synchronous Docling parse — shared by /parse sync path and async background path."""
    from docling.datamodel.base_models import DocumentStream

    t0 = time.monotonic()
    stream = DocumentStream(name="source.pdf", stream=io.BytesIO(pdf_bytes))
    converter = _get_converter(
        use_description,
        force_full_page_ocr=force_full_page_ocr,
        table_mode=table_mode,
    )
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

    # Phase 2: augment with PyMuPDF vector graphics + reconciled span typography.
    # Non-fatal — any failure leaves the Docling-only document intact.
    fitz_vectors = 0
    fitz_fonts = 0
    if _FITZ_AVAILABLE and ENABLE_FITZ_LAYERS:
        try:
            fitz_layers = _extract_fitz_layers(pdf_bytes)
            if fitz_layers:
                _enrich_text_typography(doc_dict, fitz_layers)
                vectors = _collect_vectors(fitz_layers)
                doc_dict["vectors"] = vectors
                fitz_vectors = len(vectors)
        except Exception as exc:  # pragma: no cover
            LOG.warning("fitz layer enrichment failed (non-fatal): %s", exc)
        # Phase 3: document fonts (names + embeddable programs).
        try:
            fonts = _extract_fitz_fonts(pdf_bytes)
            if fonts:
                doc_dict["fonts"] = fonts
                fitz_fonts = len(fonts)
        except Exception as exc:  # pragma: no cover
            LOG.warning("fitz font extraction failed (non-fatal): %s", exc)

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
    summary["vector_count"] = fitz_vectors
    summary["font_count"] = fitz_fonts
    if redact_pii:
        summary["pii_redaction"] = {"enabled": True, "redaction_count": pii_redactions}
    parsed_ms = int((time.monotonic() - t0) * 1000)
    LOG.info(
        "Parsed %d-page PDF (%d bytes) in %d ms — %d texts / %d tables / %d pictures / %d vectors / %d OCR pages",
        len(pages_meta), len(pdf_bytes), parsed_ms,
        summary["text_block_count"], summary["table_count"],
        summary["picture_count"], fitz_vectors, len(summary["ocr_pages"]),
    )

    return {
        "engine_version": ENGINE_VERSION,
        "parsed_ms": parsed_ms,
        "page_count": len(pages_meta),
        "pages": pages_meta,
        "outline": outline,
        "page_languages": page_languages,
        "summary": summary,
        "docling_capability_activation_version": DOCLING_CAPABILITY_ACTIVATION_VERSION,
        "parse_options": {
            "force_full_page_ocr": bool(force_full_page_ocr if force_full_page_ocr is not None else (FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK)),
            "table_mode": (table_mode or TABLE_MODE or "ACCURATE").strip().upper(),
            "picture_description": bool(use_description),
            "ocr_langs": OCR_LANGS,
            "bitmap_area_threshold": BITMAP_AREA_THRESHOLD,
            "images_scale": IMAGES_SCALE,
            "fitz_layers": bool(_FITZ_AVAILABLE and ENABLE_FITZ_LAYERS),
            "vector_count": fitz_vectors,
            "font_count": fitz_fonts,
        },
        "docling_document": doc_dict,
        **extras,
    }



PER_PAGE_DOCLING_ARTIFACT_VERSION = "per-page-docling-v1"


def _prov_page_numbers(node: Any) -> set[int]:
    pages: set[int] = set()
    if not isinstance(node, dict):
        return pages
    prov = node.get("prov")
    if isinstance(prov, list):
        for p in prov:
            if isinstance(p, dict):
                page_no = p.get("page_no")
                try:
                    if page_no is not None:
                        pages.add(int(page_no))
                except Exception:
                    continue
    return pages


def _item_belongs_to_page(item: Any, page_no: int) -> bool:
    if not isinstance(item, dict):
        return False
    pages = _prov_page_numbers(item)
    if pages:
        return page_no in pages
    # Conservative fallback: keep unproven items out of page-local artifacts.
    return False


def _normalize_bbox(item: dict) -> Any:
    for key in ("bbox", "bounds", "bounding_box"):
        value = item.get(key)
        if value is not None:
            return value
    prov = item.get("prov")
    if isinstance(prov, list) and prov:
        first = prov[0]
        if isinstance(first, dict):
            return first.get("bbox") or first.get("bounds") or first.get("bounding_box")
    return None


def _page_blocks_for_docling_page(page_no: int, texts: list[dict], tables: list[dict], pictures: list[dict], vectors: Optional[list[dict]] = None) -> list[dict]:
    blocks: list[dict] = []

    for idx, item in enumerate(texts, start=1):
        blocks.append({
            "id": f"p{page_no:03d}-text-{idx}",
            "type": "text",
            "label": item.get("label") or item.get("type") or "text",
            "text": item.get("text") or item.get("orig") or "",
            "bbox": _normalize_bbox(item),
            "confidence": item.get("confidence"),
            "source": "docling",
            "page_no": page_no,
        })

    for idx, item in enumerate(tables, start=1):
        blocks.append({
            "id": f"p{page_no:03d}-table-{idx}",
            "type": "table",
            "label": item.get("label") or "table",
            "text": item.get("text") or "",
            "bbox": _normalize_bbox(item),
            "confidence": item.get("confidence"),
            "source": "docling",
            "page_no": page_no,
        })

    for idx, item in enumerate(pictures, start=1):
        blocks.append({
            "id": f"p{page_no:03d}-picture-{idx}",
            "type": "picture",
            "label": item.get("label") or "picture",
            "text": item.get("caption") or "",
            "bbox": _normalize_bbox(item),
            "confidence": item.get("confidence"),
            "source": "docling",
            "page_no": page_no,
        })

    for idx, item in enumerate(vectors or [], start=1):
        blocks.append({
            "id": f"p{page_no:03d}-vector-{idx}",
            "type": "vector",
            "label": "vector",
            "text": "",
            "bbox": _normalize_bbox(item),
            "confidence": item.get("confidence"),
            "source": "fitz",
            "page_no": page_no,
        })

    return blocks


def _summarise_page_artifact(page_no: int, texts: list[dict], tables: list[dict], pictures: list[dict], raster_path: Optional[str] = None, vectors: Optional[list[dict]] = None) -> dict:
    text_chars = sum(len(str(t.get("text") or t.get("orig") or "")) for t in texts)
    ocr_chars = 0
    confidence_values: list[float] = []

    for t in texts:
        origin = str(t.get("origin") or t.get("source") or "").lower()
        text_value = str(t.get("text") or t.get("orig") or "")
        if "ocr" in origin:
            ocr_chars += len(text_value)
        conf = t.get("confidence")
        if isinstance(conf, (int, float)) and 0 <= float(conf) <= 1:
            confidence_values.append(float(conf))

    avg_conf = round(sum(confidence_values) / len(confidence_values), 4) if confidence_values else None

    table_cell_count = 0
    for tbl in tables:
        data = tbl.get("data") if isinstance(tbl, dict) else None
        cells = []
        if isinstance(data, dict):
            raw = data.get("table_cells") or data.get("cells") or []
            if isinstance(raw, list):
                cells = raw
        table_cell_count += len(cells)

    return {
        "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
        "page_no": page_no,
        "text_block_count": len(texts),
        "table_count": len(tables),
        "table_cell_count": table_cell_count,
        "picture_count": len(pictures),
        "vector_count": len(vectors or []),
        "text_chars": text_chars,
        "ocr_chars": ocr_chars,
        "avg_text_confidence": avg_conf,
        "has_raster": bool(raster_path),
        "has_tables": len(tables) > 0,
        "has_pictures": len(pictures) > 0,
        "has_vectors": bool(vectors),
    }


def _build_per_page_docling_artifacts(
    docling_doc: dict,
    *,
    job_id: str,
    global_page_offset: int = 0,
    raster_manifest: Optional[dict] = None,
) -> dict:
    """Build per-page Docling artifacts in memory.

    For chunked parsing, `global_page_offset` rebases chunk-local page numbers
    into parent-global page numbers using: global = local + offset.
    """
    if not isinstance(docling_doc, dict):
        return {
            "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
            "page_count": 0,
            "pages": [],
            "artifacts_by_page": {},
            "validation": {"ok": False, "problems": ["docling_doc_not_object"]},
        }

    raw_pages = docling_doc.get("pages") or {}
    texts_all = docling_doc.get("texts") if isinstance(docling_doc.get("texts"), list) else []
    tables_all = docling_doc.get("tables") if isinstance(docling_doc.get("tables"), list) else []
    pictures_all = docling_doc.get("pictures") if isinstance(docling_doc.get("pictures"), list) else []
    vectors_all = docling_doc.get("vectors") if isinstance(docling_doc.get("vectors"), list) else []

    raster_by_global_page: dict[int, str] = {}
    if isinstance(raster_manifest, dict):
        for page in raster_manifest.get("pages") or []:
            if not isinstance(page, dict):
                continue
            try:
                global_no = int(page.get("global_page_no") or page.get("page_no") or 0)
            except Exception:
                continue
            path = page.get("path")
            if global_no > 0 and isinstance(path, str):
                raster_by_global_page[global_no] = path

    manifest_pages: list[dict] = []
    artifacts_by_page: dict[int, dict] = {}
    problems: list[str] = []

    for key, raw_page in sorted((raw_pages or {}).items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 0):
        try:
            local_page_no = int(key)
        except Exception:
            problems.append(f"invalid_page_key:{key}")
            continue

        global_page_no = global_page_offset + local_page_no
        if global_page_no <= 0:
            problems.append(f"invalid_global_page_no:{global_page_no}")
            continue

        page_obj = raw_page if isinstance(raw_page, dict) else {}
        page_copy = dict(page_obj)
        page_copy["page_no"] = global_page_no

        page_texts = [dict(t) for t in texts_all if _item_belongs_to_page(t, local_page_no)]
        page_tables = [dict(t) for t in tables_all if _item_belongs_to_page(t, local_page_no)]
        page_pictures = [dict(pic) for pic in pictures_all if _item_belongs_to_page(pic, local_page_no)]
        page_vectors = [dict(v) for v in vectors_all if _item_belongs_to_page(v, local_page_no)]

        def rebase_item(item: dict) -> dict:
            prov = item.get("prov")
            if isinstance(prov, list):
                for p in prov:
                    if isinstance(p, dict) and p.get("page_no") is not None:
                        try:
                            p["page_no"] = global_page_offset + int(p["page_no"])
                        except Exception:
                            pass
            return item

        page_texts = [rebase_item(t) for t in page_texts]
        page_tables = [rebase_item(t) for t in page_tables]
        page_pictures = [rebase_item(pic) for pic in page_pictures]
        page_vectors = [rebase_item(v) for v in page_vectors]

        raster_path = raster_by_global_page.get(global_page_no)
        summary = _summarise_page_artifact(global_page_no, page_texts, page_tables, page_pictures, raster_path, page_vectors)
        blocks = _page_blocks_for_docling_page(global_page_no, page_texts, page_tables, page_pictures, page_vectors)

        page_docling = {
            "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
            "job_id": job_id,
            "page_no": global_page_no,
            "schema_name": "DoclingDocumentPage",
            "pages": {
                str(global_page_no): page_copy,
            },
            "texts": page_texts,
            "tables": page_tables,
            "pictures": page_pictures,
            "vectors": page_vectors,
            "summary": summary,
        }

        artifacts = {
            "docling": page_docling,
            "blocks": {
                "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
                "page_no": global_page_no,
                "blocks": blocks,
            },
            "tables": {
                "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
                "page_no": global_page_no,
                "tables": page_tables,
            },
            "pictures": {
                "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
                "page_no": global_page_no,
                "pictures": page_pictures,
            },
            "vectors": {
                "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
                "page_no": global_page_no,
                "vectors": page_vectors,
            },
            "summary": summary,
        }

        artifacts_by_page[global_page_no] = artifacts
        manifest_pages.append({
            "page_no": global_page_no,
            "width": page_copy.get("width") or page_copy.get("size", {}).get("width") if isinstance(page_copy.get("size"), dict) else page_copy.get("width"),
            "height": page_copy.get("height") or page_copy.get("size", {}).get("height") if isinstance(page_copy.get("size"), dict) else page_copy.get("height"),
            "raster_path": raster_path,
            "source_chunk_page_no": local_page_no,
        })

    manifest_pages.sort(key=lambda page: page["page_no"])
    page_numbers = [int(page["page_no"]) for page in manifest_pages]
    expected = list(range(min(page_numbers), max(page_numbers) + 1)) if page_numbers else []
    if page_numbers and page_numbers != expected:
        problems.append("page_numbers_not_continuous")
    if len(set(page_numbers)) != len(page_numbers):
        problems.append("duplicate_page_numbers")

    return {
        "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
        "job_id": job_id,
        "page_count": len(manifest_pages),
        "pages": manifest_pages,
        "artifacts_by_page": artifacts_by_page,
        "validation": {
            "ok": len(problems) == 0,
            "problems": problems,
        },
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


LANE_ENFORCEMENT_VERSION = "extractor-lane-policy-v1"

LANE_PROFILES: dict[str, dict[str, Any]] = {
    "unplanned": {
        "force_mode": None,
        "force_raster": False,
        "raster_dpi": None,
        "use_picture_description": ENABLE_PICTURE_DESCRIPTION_DEFAULT,
        "include_doctags": True,
        "include_markdown": True,
        "force_full_page_ocr": FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK,
        "table_mode": TABLE_MODE,
    },
    "fast_native": {
        "force_mode": None,
        "force_raster": False,
        "raster_dpi": None,
        "use_picture_description": False,
        "include_doctags": False,
        "include_markdown": False,
        "force_full_page_ocr": False,
        "table_mode": "FAST",
    },
    "accurate_table": {
        "force_mode": None,
        "force_raster": True,
        "raster_dpi": 144,
        "use_picture_description": False,
        "include_doctags": True,
        "include_markdown": True,
        "force_full_page_ocr": False,
        "table_mode": "ACCURATE",
    },
    "ocr_scanned": {
        "force_mode": None,
        "force_raster": True,
        "raster_dpi": 144,
        "use_picture_description": False,
        "include_doctags": True,
        "include_markdown": True,
        "force_full_page_ocr": True,
        "table_mode": "ACCURATE",
    },
    "design_heavy": {
        "force_mode": None,
        "force_raster": True,
        "raster_dpi": 200,
        "use_picture_description": True,
        "include_doctags": True,
        "include_markdown": True,
        "force_full_page_ocr": FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK,
        "table_mode": "ACCURATE",
    },
    "pixel_raster_only": {
        "force_mode": "pixel_perfect",
        "force_raster": True,
        "raster_dpi": 200,
        "use_picture_description": False,
        "include_doctags": False,
        "include_markdown": False,
        "force_full_page_ocr": False,
        "table_mode": "FAST",
    },
}


def _normalize_extractor_lane(lane: Optional[str]) -> str:
    normalized = (lane or "unplanned").strip().lower().replace("-", "_")
    return normalized if normalized in LANE_PROFILES else "unplanned"


def _lane_policy(lane: Optional[str], requested_mode: Optional[str] = None) -> dict[str, Any]:
    normalized = _normalize_extractor_lane(lane)
    base = dict(LANE_PROFILES["unplanned"])
    base.update(LANE_PROFILES.get(normalized, {}))
    base["lane"] = normalized
    base["requested_mode"] = (requested_mode or "semantic").lower().replace("-", "_")
    base["version"] = LANE_ENFORCEMENT_VERSION
    return base


def _resolve_picture_description(explicit: Optional[bool], policy: dict[str, Any]) -> bool:
    if explicit is not None:
        return bool(explicit)
    return bool(policy.get("use_picture_description", ENABLE_PICTURE_DESCRIPTION_DEFAULT))


def _resolve_effective_mode(requested_mode: Optional[str], policy: dict[str, Any]) -> str:
    requested = (requested_mode or "semantic").lower().replace("-", "_")
    forced = policy.get("force_mode")
    if forced:
        return str(forced).lower().replace("-", "_")
    if policy.get("force_raster") and requested == "semantic":
        return "hybrid"
    return requested


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


async def _upload_per_page_docling_artifacts(
    client: httpx.AsyncClient,
    prefix: str,
    per_page_payload: dict,
    *,
    source: str = "cloud-run-sidecar",
) -> dict:
    """Upload per-page Docling artifacts and a pages-manifest.json file."""
    manifest_pages: list[dict] = []
    bytes_out = 0

    artifacts_by_page = per_page_payload.get("artifacts_by_page") or {}
    pages = per_page_payload.get("pages") or []
    validation = per_page_payload.get("validation") or {"ok": False, "problems": ["missing_validation"]}

    for page in pages:
        try:
            page_no = int(page.get("page_no") or 0)
            if page_no <= 0:
                continue

            page_key = page_no
            artifacts = artifacts_by_page.get(page_key) or artifacts_by_page.get(str(page_key)) or {}
            if not artifacts:
                LOG.error("Missing per-page artifacts for page=%s prefix=%s", page_no, prefix)
                continue

            page_prefix = f"{prefix}/pages/page-{page_no:03d}"

            docling_body = json.dumps(artifacts.get("docling") or {}).encode("utf-8")
            blocks_body = json.dumps(artifacts.get("blocks") or {}).encode("utf-8")
            tables_body = json.dumps(artifacts.get("tables") or {}).encode("utf-8")
            pictures_body = json.dumps(artifacts.get("pictures") or {}).encode("utf-8")
            vectors_body = json.dumps(artifacts.get("vectors") or {}).encode("utf-8")
            summary_body = json.dumps(artifacts.get("summary") or {}).encode("utf-8")

            docling_path = await _storage_upload(client, f"{page_prefix}/docling.json", docling_body, "application/json")
            blocks_path = await _storage_upload(client, f"{page_prefix}/blocks.json", blocks_body, "application/json")
            tables_path = await _storage_upload(client, f"{page_prefix}/tables.json", tables_body, "application/json")
            pictures_path = await _storage_upload(client, f"{page_prefix}/pictures.json", pictures_body, "application/json")
            vectors_path = await _storage_upload(client, f"{page_prefix}/vectors.json", vectors_body, "application/json")
            summary_path = await _storage_upload(client, f"{page_prefix}/summary.json", summary_body, "application/json")

            bytes_out += (
                len(docling_body)
                + len(blocks_body)
                + len(tables_body)
                + len(pictures_body)
                + len(vectors_body)
                + len(summary_body)
            )

            manifest_pages.append({
                "page_no": page_no,
                "width": page.get("width"),
                "height": page.get("height"),
                "docling_path": docling_path,
                "blocks_path": blocks_path,
                "tables_path": tables_path,
                "pictures_path": pictures_path,
                "vectors_path": vectors_path,
                "summary_path": summary_path,
                "raster_path": page.get("raster_path"),
                "source_chunk_index": page.get("source_chunk_index"),
                "source_chunk_page_no": page.get("source_chunk_page_no"),
            })
        except Exception as exc:
            LOG.error("Failed to upload per-page Docling artifacts prefix=%s page=%s error=%s", prefix, page, exc)

    manifest_pages.sort(key=lambda page: int(page.get("page_no") or 0))

    manifest = {
        "version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
        "job_id": per_page_payload.get("job_id"),
        "source": source,
        "page_count": len(manifest_pages),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pages": manifest_pages,
        "validation": validation,
    }

    manifest_body = json.dumps(manifest).encode("utf-8")
    manifest_path = await _storage_upload(
        client,
        f"{prefix}/pages-manifest.json",
        manifest_body,
        "application/json",
    )
    bytes_out += len(manifest_body)

    required_missing = []
    for page in manifest_pages:
        page_no = page.get("page_no")
        for key in ("docling_path", "blocks_path", "summary_path"):
            if not page.get(key):
                required_missing.append(f"page_{page_no}_{key}")

    validation_out = {
        "version": "per-page-docling-validation-v1",
        "ok": bool(validation.get("ok")) and not required_missing and len(manifest_pages) == int(per_page_payload.get("page_count") or len(manifest_pages)),
        "problems": list(validation.get("problems") or []) + required_missing,
    }

    LOG.info(
        "Uploaded per-page Docling artifacts prefix=%s manifest=%s pages=%s ok=%s",
        prefix,
        manifest_path,
        len(manifest_pages),
        validation_out["ok"],
    )

    return {
        "per_page_docling_artifact_version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
        "per_page_docling_manifest_path": manifest_path,
        "per_page_docling_page_count": len(manifest_pages),
        "per_page_docling_validation": validation_out,
        "per_page_docling_manifest": manifest,
        "bytes_out": bytes_out,
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

        lane_policy = _lane_policy(req.extractor_lane, req.mode)
        use_description = _resolve_picture_description(req.enable_picture_description, lane_policy)
        include_doctags = bool(lane_policy.get("include_doctags", True) and req.include_doctags)
        include_markdown = bool(lane_policy.get("include_markdown", True) and req.include_markdown)

        parse_result = _do_parse(
            pdf_bytes,
            use_description=use_description,
            force_full_page_ocr=bool(lane_policy.get("force_full_page_ocr", FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK)),
            table_mode=str(lane_policy.get("table_mode") or TABLE_MODE),
            include_doctags=include_doctags,
            include_markdown=include_markdown,
            redact_pii=req.redact_pii,
        )
        cloud_run_ms += int(parse_result.get("parsed_ms") or 0)

        page_count = int(parse_result.get("page_count") or 0)
        summary = parse_result.get("summary") or {}
        requested_mode = (req.mode or "semantic").lower().replace("-", "_")
        effective_mode = _resolve_effective_mode(req.mode, lane_policy)
        # Auto-promote hybrid → pixel_perfect when OCR ratio > 0.3.
        if (
            effective_mode == "hybrid"
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
            raster_manifest_payload = None
            per_page_docling_manifest_path = None
            per_page_docling_page_count = 0
            per_page_docling_validation = {"ok": False, "problems": ["not_generated"]}
            if effective_mode in {"hybrid", "pixel_perfect", "pixel-perfect"} and page_count > 0:
                dpi = req.raster_dpi or int(lane_policy.get("raster_dpi") or RASTER_DPI or (200 if "pixel" in effective_mode else 144))
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
                    raster_manifest_payload = raster_artifacts.get("manifest")
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

            per_page_payload = _build_per_page_docling_artifacts(
                doclingDoc,
                job_id=job_id,
                global_page_offset=0,
                raster_manifest=raster_manifest_payload,
            )
            per_page_artifacts = await _upload_per_page_docling_artifacts(
                client,
                job_id,
                per_page_payload,
                source="monolithic-parse",
            )
            per_page_docling_manifest_path = per_page_artifacts.get("per_page_docling_manifest_path")
            per_page_docling_page_count = int(per_page_artifacts.get("per_page_docling_page_count") or 0)
            per_page_docling_validation = per_page_artifacts.get("per_page_docling_validation") or {"ok": False, "problems": ["missing_validation"]}
            bytes_out += int(per_page_artifacts.get("bytes_out") or 0)

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
                "extractor_lane": lane_policy["lane"],
                "lane_enforcement_version": LANE_ENFORCEMENT_VERSION,
                "lane_policy": lane_policy,
                "result_payload": {
                    "docling_path": docling_path,
                    "rasters_path": rasters_path,
                    "rasters_manifest_path": rasters_manifest_path,
                    "page_raster_paths": page_raster_paths,
                    "legacy_rasters_path": legacy_rasters_path,
                    "per_page_docling_artifact_version": PER_PAGE_DOCLING_ARTIFACT_VERSION,
                    "per_page_docling_manifest_path": per_page_docling_manifest_path,
                    "per_page_docling_page_count": per_page_docling_page_count,
                    "per_page_docling_validation": per_page_docling_validation,
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
                    "extractor_lane": lane_policy["lane"],
                    "lane_enforcement_version": LANE_ENFORCEMENT_VERSION,
                    "lane_policy": lane_policy,
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


def _pkg_version(name: str) -> Optional[str]:
    try:
        return importlib_metadata.version(name)
    except Exception:
        return None


def _docling_capabilities() -> dict[str, Any]:
    converter_keys = [
        {
            "picture_description": key[0],
            "force_full_page_ocr": key[1],
            "table_mode": key[2],
        }
        for key in _CONVERTER_VARIANTS.keys()
    ]
    return {
        "version": DOCLING_CAPABILITY_ACTIVATION_VERSION,
        "engine_version": ENGINE_VERSION,
        "packages": {
            "docling": _pkg_version("docling"),
            "docling_core": _pkg_version("docling-core") or _pkg_version("docling_core"),
            "docling_ibm_models": _pkg_version("docling-ibm-models") or _pkg_version("docling_ibm_models"),
            "docling_parse": _pkg_version("docling-parse") or _pkg_version("docling_parse"),
            "pypdfium2": _pkg_version("pypdfium2"),
            "easyocr": _pkg_version("easyocr"),
            "torch": _pkg_version("torch"),
        },
        "runtime": {
            "accelerator_device": ACCEL_DEVICE,
            "accelerator_threads": ACCEL_THREADS,
            "prewarm_on_startup": PREWARM_ON_STARTUP,
        },
        "ocr": {
            "do_ocr": True,
            "global_force_full_page_ocr": FORCE_FULL_PAGE_OCR,
            "global_ocr_fallback": ENABLE_OCR_FALLBACK,
            "lane_aware_ocr": True,
            "ocr_langs": OCR_LANGS,
            "bitmap_area_threshold": BITMAP_AREA_THRESHOLD,
        },
        "tables": {
            "do_table_structure": True,
            "default_table_mode": TABLE_MODE,
            "cell_matching": True,
            "lane_aware_table_mode": True,
        },
        "pictures": {
            "picture_classification_enabled": ENABLE_PICTURE_CLASSIFICATION,
            "picture_description_default": ENABLE_PICTURE_DESCRIPTION_DEFAULT,
            "images_scale": IMAGES_SCALE,
        },
        "enrichment": {
            "formula_configured": ENABLE_FORMULA_ENRICHMENT,
            "code_configured": ENABLE_CODE_ENRICHMENT,
            "support_is_best_effort": True,
        },
        "converter_variants": converter_keys,
        "lanes": LANE_PROFILES,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": True,
        "engine_version": ENGINE_VERSION,
        "lane_enforcement_version": LANE_ENFORCEMENT_VERSION,
        "docling_capability_activation_version": DOCLING_CAPABILITY_ACTIVATION_VERSION,
        "callback_upload_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
    }


@app.get("/")
def root() -> dict:
    return {
        "service": "pdf-parse-service",
        "engine_version": ENGINE_VERSION,
        "lane_enforcement_version": LANE_ENFORCEMENT_VERSION,
        "docling_capability_activation_version": DOCLING_CAPABILITY_ACTIVATION_VERSION,
    }


@app.get("/capabilities")
def capabilities() -> dict:
    return _docling_capabilities()


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
            {"accepted": True, "job_id": req.job_id, "engine_version": ENGINE_VERSION, "mode": "callback", "extractor_lane": _normalize_extractor_lane(req.extractor_lane), "lane_enforcement_version": LANE_ENFORCEMENT_VERSION},
            status_code=202,
        )

    # Legacy synchronous mode (backwards compatible).
    pdf_bytes = await _resolve_pdf_bytes(req.url, req.pdf_base64)
    lane_policy = _lane_policy(req.extractor_lane, req.mode)
    use_description = _resolve_picture_description(req.enable_picture_description, lane_policy)
    include_doctags = bool(lane_policy.get("include_doctags", True) and req.include_doctags)
    include_markdown = bool(lane_policy.get("include_markdown", True) and req.include_markdown)

    result = _do_parse(
        pdf_bytes,
        use_description=use_description,
        include_doctags=include_doctags,
        include_markdown=include_markdown,
        redact_pii=req.redact_pii,
    )
    result["extractor_lane"] = lane_policy["lane"]
    result["lane_enforcement_version"] = LANE_ENFORCEMENT_VERSION
    result["lane_policy"] = lane_policy
    return result


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
    extractor_lane: Optional[str] = None
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

        lane_policy = _lane_policy(req.extractor_lane, req.mode)
        use_description = _resolve_picture_description(req.enable_picture_description, lane_policy)
        include_doctags = bool(lane_policy.get("include_doctags", True) and req.include_doctags)
        include_markdown = bool(lane_policy.get("include_markdown", True) and req.include_markdown)

        parse_result = _do_parse(
            chunk_pdf,
            use_description=use_description,
            force_full_page_ocr=bool(lane_policy.get("force_full_page_ocr", FORCE_FULL_PAGE_OCR or ENABLE_OCR_FALLBACK)),
            table_mode=str(lane_policy.get("table_mode") or TABLE_MODE),
            include_doctags=include_doctags,
            include_markdown=include_markdown,
            redact_pii=req.redact_pii,
        )

        prefix = f"{req.job_id}/chunks/{req.chunk_index:04d}"
        async with httpx.AsyncClient(timeout=120) as client:
            doclingDoc = parse_result.get("docling_document") or {}
            raster_manifest_payload = None
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

            # Raster the chunk when the mode or lane policy demands page images.
            mode = _resolve_effective_mode(req.mode, lane_policy)
            if mode in {"hybrid", "pixel_perfect", "pixel-perfect"}:
                dpi = req.raster_dpi or int(lane_policy.get("raster_dpi") or (200 if "pixel" in mode else 144))
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
                        raster_manifest_payload = raster_artifacts.get("manifest")
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

            per_page_payload = _build_per_page_docling_artifacts(
                doclingDoc,
                job_id=req.job_id,
                global_page_offset=req.page_start - 1,
                raster_manifest=raster_manifest_payload,
            )
            per_page_artifacts = await _upload_per_page_docling_artifacts(
                client,
                prefix,
                per_page_payload,
                source="chunk-parse",
            )
            artifacts["per_page_docling_artifact_version"] = per_page_artifacts.get("per_page_docling_artifact_version")
            artifacts["per_page_docling_manifest_path"] = per_page_artifacts.get("per_page_docling_manifest_path")
            artifacts["per_page_docling_page_count"] = per_page_artifacts.get("per_page_docling_page_count")
            artifacts["per_page_docling_validation"] = per_page_artifacts.get("per_page_docling_validation")
            bytes_out += int(per_page_artifacts.get("bytes_out") or 0)

        duration_ms = int((time.monotonic() - started) * 1000)
        await _post_chunk_callback(req.callback_url, req.callback_token, req.job_id, {
            "job_id": req.job_id,
            "chunk_id": req.chunk_id,
            "chunk_index": req.chunk_index,
            "status": "succeeded",
            "engine_version": ENGINE_VERSION,
            "extractor_lane": lane_policy["lane"],
            "lane_enforcement_version": LANE_ENFORCEMENT_VERSION,
            "effective_mode": mode,
            "lane_policy": lane_policy,
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
            "extractor_lane": req.extractor_lane,
        },
        status_code=202,
    )
