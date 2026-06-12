"""
pdf-parse-service — Docling sidecar for the template PDF import pipeline.

Endpoints
---------
GET  /healthz                      — liveness/readiness probe.
POST /parse   { url | pdf_base64 } — returns Docling DoclingDocument JSON + per-page metadata.
POST /raster  { url | pdf_base64, dpi, pages? } — rasterises pages to base64 PNG/JPEG for Hybrid/Pixel-Perfect modes.

Auth
----
Every request must carry `Authorization: Bearer $PDF_PARSE_SERVICE_TOKEN`. The
matching value is configured as a Supabase edge function secret so only our
edge function can call this service.

Design notes
------------
* The Docling pipeline is constructed once at startup; pages and rasters are
  produced per request. A single Cloud Run instance handles `concurrency=2`
  (set in the Cloud Run service config) — scale horizontally, never vertically,
  because Docling models are RAM-heavy.
* Rasters are returned as base64. The orchestrator (edge function) uploads them
  to the `pdf-import-diagnostics` Storage bucket and stores only URLs in
  `report_templates.schema` to keep DB payloads small.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
from typing import Optional

import httpx
import pypdfium2 as pdfium
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

LOG = logging.getLogger("pdf-parse-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

SERVICE_TOKEN = os.environ.get("PDF_PARSE_SERVICE_TOKEN", "").strip()
ENGINE_VERSION = "docling-2.14.0"
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB — matches the diagnostics bucket cap.

app = FastAPI(title="pdf-parse-service", version=ENGINE_VERSION)


# ---------------------------------------------------------------------------
# Pipeline singleton — built once at module import time so the first /parse
# request doesn't pay the model-load cost.
# ---------------------------------------------------------------------------
def _build_converter() -> DocumentConverter:
    pipeline = PdfPipelineOptions()
    pipeline.do_ocr = True                       # handle scanned pages too
    pipeline.do_table_structure = True           # TableFormer — the reason we picked Docling
    pipeline.table_structure_options.do_cell_matching = True
    pipeline.generate_page_images = False        # we rasterise on demand via /raster
    pipeline.generate_picture_images = True      # so we can extract embedded images
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)}
    )


CONVERTER = _build_converter()
LOG.info("Docling converter ready (version=%s)", ENGINE_VERSION)


# ---------------------------------------------------------------------------
# Auth middleware — refuse anything without the shared bearer.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def require_bearer(request: Request, call_next):
    if request.url.path in {"/healthz", "/"}:
        return await call_next(request)
    if not SERVICE_TOKEN:
        # Misconfiguration safety net — never serve traffic without a token in prod.
        return JSONResponse({"error": "service_token_not_configured"}, status_code=503)
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer ") or auth.split(" ", 1)[1].strip() != SERVICE_TOKEN:
        return JSONResponse({"error": "unauthorised"}, status_code=401)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ParseRequest(BaseModel):
    url: Optional[str] = Field(default=None, description="Signed Supabase Storage URL of the source PDF.")
    pdf_base64: Optional[str] = Field(default=None, description="Inline base64 PDF (no data: prefix).")


class RasterRequest(BaseModel):
    url: Optional[str] = None
    pdf_base64: Optional[str] = None
    dpi: int = Field(default=144, ge=72, le=300)
    pages: Optional[list[int]] = Field(default=None, description="1-indexed page numbers. Defaults to all.")
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

    # Docling accepts a path or a stream-like; the simplest reliable path is via BytesIO.
    from docling.datamodel.base_models import DocumentStream

    stream = DocumentStream(name="source.pdf", stream=io.BytesIO(pdf_bytes))
    result = CONVERTER.convert(stream)
    doc = result.document

    # Page geometry — used downstream to map bboxes to template overlay coords.
    pages_meta: list[dict] = []
    for page_no, page in (doc.pages or {}).items():
        size = page.size
        pages_meta.append({
            "page_no": page_no,
            "width": size.width,
            "height": size.height,
        })
    pages_meta.sort(key=lambda p: p["page_no"])

    parsed_ms = int((time.monotonic() - t0) * 1000)
    LOG.info("Parsed %d-page PDF (%d bytes) in %d ms", len(pages_meta), len(pdf_bytes), parsed_ms)

    return {
        "engine_version": ENGINE_VERSION,
        "parsed_ms": parsed_ms,
        "page_count": len(pages_meta),
        "pages": pages_meta,
        # `export_to_dict` is the stable JSON serialisation of DoclingDocument.
        "docling_document": doc.export_to_dict(),
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
