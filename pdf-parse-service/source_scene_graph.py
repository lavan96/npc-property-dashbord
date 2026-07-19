"""source-scene-graph-v2 — PDF Extraction V3 · Package E1 (pure, deterministic).

Builds ONE immutable, provider-neutral source representation of a PDF page: the
Source Scene Graph V2. It answers, deterministically, what source regions exist
on a page, where they are (top-left PDF points), whether each critical visual
region has a durable source crop, and what text / numeric / punctuation / table
/ chart evidence each region carries — independent of the candidate template,
CDIR reconstruction, the visual-quality score, and short-lived signed URLs.

DESIGN CONTRACT
- Pure + deterministic. Importing this module MUST NOT initialise Docling models
  or open any network / filesystem resource. Pillow is imported lazily and only
  inside the foreground helper, so the contract types + ID + normalisation are
  usable in CI without native image libraries.
- Source truth only. Nothing here reads the candidate template or a page-output
  decision. E0 may later *consume* this evidence to protect output.
- Region identities are deterministic and chunk-independent (see `region_id`):
  the same source page produces the same parent-global region IDs whether it was
  parsed monolithically or as a chunk-local page later rebased.
- No signed URLs, secrets, or raw source text ever leave through logs or through
  the persisted scene graph. `problems` carry codes/counts/bounded messages only.

The sidecar (`app.py`) renders region crops and uploads artifacts; this module
performs assembly, canonicalisation and validation. Crop *bytes* are supplied to
`build_foreground_summary`; crop *paths/hashes* are attached via `attach_crop`.
"""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Any, Optional

# ── Contract versions ───────────────────────────────────────────────────────

SOURCE_SCENE_GRAPH_VERSION = "source-scene-graph-v2"
SOURCE_REGION_VERSION = "source-region-v2"
PAGE_ARTIFACT_CONTRACT_VERSION = "pdf-page-artifact-contract-v3"
SOURCE_TABLE_TOPOLOGY_VERSION = "source-table-topology-v2"
SOURCE_CHART_METADATA_VERSION = "source-chart-metadata-v2"
SOURCE_FOREGROUND_SUMMARY_VERSION = "source-foreground-summary-v1"
PROVIDER_REGION_EVIDENCE_VERSION = "provider-region-evidence-v1"

# Region types requiring a durable source crop for a *complete* critical region.
CROP_REQUIRED_TYPES = frozenset({"table", "chart", "picture", "logo", "vector-cluster"})

REGION_TYPE_ABBREV = {
    "text": "text",
    "table": "tabl",
    "chart": "chrt",
    "picture": "pict",
    "logo": "logo",
    "vector-cluster": "vect",
    "background": "bkgd",
    "unknown-visual": "unkv",
}

# ── Bounded-size limits (Phase 18) ──────────────────────────────────────────

MAX_REGIONS_PER_PAGE = 400
MAX_SPANS_PER_PAGE = 6000
MAX_CROPS_PER_PAGE = 160
MAX_TILE_GRID = 16  # tileRows/tileCols upper bound
MAX_DENSE_VECTOR_REGIONS = 24

# Conservative dense-vector-cluster threshold (mirrors E0).
DENSE_VECTOR_MIN_PATHS = 14

# Deterministic crop padding, in PDF points.
CROP_PADDING_PT = 2.0

# ── Chart lexicon (mirrors E0 STRONG_CHART_TERMS; conservative) ─────────────

STRONG_CHART_TERMS = (
    "chart", "graph", "plot", "price history", "growth", "vacancy history",
    "vacancy rate", "projection", "projections", "scenario", "scenarios",
    "comparable sales", "yield comparison", "cagr", "timeline", "trend",
    "forecast", "rental yield", "capital growth", "median price",
)
CHART_CLASS_RE = re.compile(r"chart|graph|plot|bar|line|pie|scatter|histogram|diagram", re.I)
LOGO_CLASS_RE = re.compile(r"logo|brand|icon", re.I)
NUMERIC_LABEL_RE = re.compile(r"[$£€]|\d[\d,]*\.?\d*\s*%|\b\d{4}\b|\d[\d,]{2,}")


# ── Deterministic hashing (FNV-1a 32-bit) ───────────────────────────────────
# A tiny, language-portable hash so Python (producer) and TypeScript (consumer)
# derive byte-identical region IDs from the same canonical key. This is an
# identity hash, NOT a content-integrity hash — crop bytes use SHA-256 (in app).

_FNV_OFFSET = 0x811C9DC5
_FNV_PRIME = 0x01000193
_UINT32 = 0xFFFFFFFF


def fnv1a32(text: str) -> str:
    """8-char lowercase hex FNV-1a over the UTF-8 bytes of `text`."""
    h = _FNV_OFFSET
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * _FNV_PRIME) & _UINT32
    return f"{h:08x}"


def _round2(value: Any) -> Optional[float]:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    # Round-half-to-even is fine; the value only feeds a stable string key.
    return round(f, 2)


def _fmt2(value: float) -> str:
    """Canonical fixed-2 decimal string; avoids '-0.00' and float repr drift."""
    v = round(value + 0.0, 2)
    if v == 0:
        v = 0.0
    return f"{v:.2f}"


# ── Coordinate normalisation (Phase 4) ──────────────────────────────────────


def normalize_bbox(
    raw: Any,
    page_width: float,
    page_height: float,
) -> tuple[Optional[dict], list[str]]:
    """Normalise a Docling/PyMuPDF bbox to a top-left, y-down, PDF-point rect.

    Accepts a Docling dict ``{l,t,r,b,coord_origin}`` or a 4-tuple ``[l,t,r,b]``
    (assumed TOPLEFT). Returns ``({x,y,width,height}, problems)``. The rect is
    clamped to the page; an out-of-page overshoot is reported as a problem but
    the clamped rect is still returned. A fully off-page or degenerate rect
    returns ``(None, problems)``.
    """
    problems: list[str] = []
    l = t = r = b = None
    origin = "TOPLEFT"
    if isinstance(raw, dict):
        l, t, r, b = raw.get("l"), raw.get("t"), raw.get("r"), raw.get("b")
        origin = str(raw.get("coord_origin") or "TOPLEFT").upper()
    elif isinstance(raw, (list, tuple)) and len(raw) >= 4:
        l, t, r, b = raw[0], raw[1], raw[2], raw[3]
    else:
        return None, ["bbox_missing"]

    try:
        l, t, r, b = float(l), float(t), float(r), float(b)
    except (TypeError, ValueError):
        return None, ["bbox_non_numeric"]

    if not all(math.isfinite(v) for v in (l, t, r, b)):
        return None, ["bbox_non_finite"]

    if origin == "BOTTOMLEFT" and page_height:
        y0, y1 = page_height - max(t, b), page_height - min(t, b)
    else:
        y0, y1 = min(t, b), max(t, b)
    x0, x1 = min(l, r), max(l, r)

    # Off-page detection before clamping.
    pw = float(page_width) if page_width and math.isfinite(page_width) else None
    ph = float(page_height) if page_height and math.isfinite(page_height) else None
    if pw is not None and ph is not None:
        if x1 <= 0 or y1 <= 0 or x0 >= pw or y0 >= ph:
            return None, ["bbox_off_page"]
        overshoot = x0 < -0.5 or y0 < -0.5 or x1 > pw + 0.5 or y1 > ph + 0.5
        x0 = min(max(x0, 0.0), pw)
        x1 = min(max(x1, 0.0), pw)
        y0 = min(max(y0, 0.0), ph)
        y1 = min(max(y1, 0.0), ph)
        if overshoot:
            problems.append("bbox_exceeds_page_clamped")

    width = x1 - x0
    height = y1 - y0
    if width <= 0 or height <= 0:
        return None, problems + ["bbox_zero_area"]

    return (
        {
            "x": _round2(x0),
            "y": _round2(y0),
            "width": _round2(width),
            "height": _round2(height),
        },
        problems,
    )


def _canonical_bbox_key(bbox: dict) -> str:
    return "|".join(
        _fmt2(float(bbox.get(k) or 0.0)) for k in ("x", "y", "width", "height")
    )


# ── Deterministic region / span identities (Phase 3) ────────────────────────


def region_id(global_page: int, region_type: str, bbox: dict, ordinal: int) -> str:
    """Deterministic, chunk-independent region ID.

    Format: ``src-p{page:04d}-{abbrev}-{ordinal:04d}-{hash8}``.

    The canonical key hashes the *parent-global* page number, region type,
    normalised bbox (rounded to 0.01 pt) and the deterministic per-(page,type)
    ordinal — never a Docling ``self_ref`` (document-position-dependent, so it
    would differ between a monolithic parse and a chunk), never a timestamp,
    signed URL, upload order or random value. Identical extraction inputs on the
    same source page therefore always yield the same ID.
    """
    abbrev = REGION_TYPE_ABBREV.get(region_type, "unkv")
    key = "|".join(
        [str(int(global_page)), region_type, _canonical_bbox_key(bbox), str(int(ordinal))]
    )
    return f"src-p{int(global_page):04d}-{abbrev}-{int(ordinal):04d}-{fnv1a32(key)}"


def span_id(global_page: int, bbox: dict, ordinal: int, font: str, size: float) -> str:
    key = "|".join(
        [str(int(global_page)), _canonical_bbox_key(bbox), str(int(ordinal)), font or "", _fmt2(size or 0.0)]
    )
    return f"src-p{int(global_page):04d}-span-{int(ordinal):04d}-{fnv1a32(key)}"


def _canonical_sort_key(region_type: str, bbox: dict) -> tuple:
    """Deterministic sort: y, x, height, width, region type."""
    return (
        float(bbox.get("y") or 0.0),
        float(bbox.get("x") or 0.0),
        float(bbox.get("height") or 0.0),
        float(bbox.get("width") or 0.0),
        region_type,
    )


# ── Token evidence (Phase 5) ────────────────────────────────────────────────

_PUNCT_MAP = {
    "–": "en-dash",
    "—": "em-dash",
    "−": "minus",
    "→": "arrow",
    "←": "arrow",
    "↔": "arrow",
    "×": "multiplication",
    "•": "bullet",
    " ": "non-breaking-space",
}
# A plain hyphen-minus is context-dependent; classify as 'hyphen' by default.
_HYPHEN = "-"

_CURRENCY_SYMBOLS = {"$": "USD", "£": "GBP", "€": "EUR", "¥": "JPY", "A$": "AUD"}
_NUMBER_RE = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")
# A numeric range like "$450,000 – $470,000" or "3.5% to 4.0%". A currency symbol
# may sit between the separator and the second number, so allow it optionally.
_RANGE_RE = re.compile(
    r"([-+]?\d[\d,]*(?:\.\d+)?)\s*(?:–|—|to|→)\s*(?:[$£€¥]\s*)?([-+]?\d[\d,]*(?:\.\d+)?)"
)


def normalize_nfc(text: str) -> str:
    """NFC normalisation that PRESERVES punctuation (never lossy)."""
    if not isinstance(text, str):
        return ""
    return unicodedata.normalize("NFC", text)


def extract_punctuation_tokens(text: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for ch in text or "":
        kind = _PUNCT_MAP.get(ch)
        if kind is None and ch == _HYPHEN:
            kind = "hyphen"
        if kind is None:
            continue
        marker = f"{ch}:{kind}"
        if marker in seen:
            continue
        seen.add(marker)
        out.append({"raw": ch, "kind": kind})
    return out


def _classify_number(raw: str, prefix: str, suffix: str) -> dict:
    normalized = raw.replace(",", "")
    token: dict[str, Any] = {"raw": raw, "normalized": normalized, "kind": "unknown"}
    cur = None
    for sym, code in _CURRENCY_SYMBOLS.items():
        if sym in prefix:
            cur = code
            break
    if cur:
        token["kind"] = "currency"
        token["currency"] = cur
    elif "%" in suffix:
        token["kind"] = "percentage"
    elif re.search(r"\b(?:sqm|sq\s?m|m2|ha|km|kg|bed|bath|car)\b", suffix, re.I):
        token["kind"] = "measurement"
        m = re.search(r"[A-Za-z][A-Za-z0-9]*", suffix)
        token["unit"] = m.group(0) if m else None
    elif "." in normalized:
        token["kind"] = "decimal"
    else:
        token["kind"] = "integer"
    return token


def extract_numeric_tokens(text: str) -> list[dict]:
    """Extract source numeric evidence. Records the SOURCE representation only —
    never calculates, interprets or infers a missing value."""
    if not isinstance(text, str) or not text:
        return []
    out: list[dict] = []

    # Ranges first (e.g. "$450,000 – $470,000", "3.5% to 4.0%").
    consumed: list[tuple[int, int]] = []
    for m in _RANGE_RE.finditer(text):
        consumed.append((m.start(), m.end()))
        start_raw, end_raw = m.group(1), m.group(2)
        cur = None
        for sym, code in _CURRENCY_SYMBOLS.items():
            if sym in text[max(0, m.start() - 4): m.end()]:
                cur = code
                break
        out.append({
            "raw": m.group(0).strip(),
            "normalized": None,
            "kind": "range",
            "rangeStart": start_raw.replace(",", ""),
            "rangeEnd": end_raw.replace(",", ""),
            "currency": cur,
            "unit": None,
        })

    # Standalone numbers not already consumed by a range.
    for m in _NUMBER_RE.finditer(text):
        if any(s <= m.start() < e for s, e in consumed):
            continue
        prefix = text[max(0, m.start() - 2): m.start()]
        suffix = text[m.end(): m.end() + 6]
        out.append(_classify_number(m.group(0), prefix, suffix))

    return out


# ── Source spans (Phase 5) ──────────────────────────────────────────────────


def _prov_bbox(item: dict) -> Any:
    prov = item.get("prov")
    if isinstance(prov, list) and prov and isinstance(prov[0], dict):
        return prov[0].get("bbox")
    for key in ("bbox", "bounds", "bounding_box"):
        if item.get(key) is not None:
            return item.get(key)
    return None


def build_source_spans(
    texts: list[dict],
    *,
    global_page: int,
    page_width: float,
    page_height: float,
) -> tuple[list[dict], list[str]]:
    """Immutable, block-level source span evidence from Docling text items.

    The current production engine emits block-level text (paragraphs/headings),
    so a "span" here is one Docling text item with its raw + NFC text, font
    hints, reading order, and tokens. Finer glyph advances arrive in E2/E5 and
    are recorded as null when unavailable — never fabricated.
    """
    problems: list[str] = []
    spans: list[dict] = []
    candidates: list[tuple[dict, dict]] = []  # (item, normalized bbox)
    for item in texts or []:
        bbox, bprob = normalize_bbox(_prov_bbox(item), page_width, page_height)
        if bbox is None:
            continue
        candidates.append((item, bbox))

    candidates.sort(key=lambda pair: _canonical_sort_key("text", pair[1]))
    if len(candidates) > MAX_SPANS_PER_PAGE:
        problems.append("spans_truncated_to_limit")
        candidates = candidates[:MAX_SPANS_PER_PAGE]

    for ordinal, (item, bbox) in enumerate(candidates, start=1):
        raw = str(item.get("text") or item.get("orig") or "")
        font = item.get("font") if isinstance(item.get("font"), dict) else {}
        font_name = str(font.get("family") or font.get("psName") or "")
        size = font.get("size")
        sid = span_id(global_page, bbox, ordinal, font_name, float(size or 0.0))
        had_glyph_placeholder = "�" in raw or "\x00" in raw
        spans.append({
            "id": sid,
            "pageNumber": global_page,
            "bbox": bbox,
            "raw": raw,
            "normalizedNfc": normalize_nfc(raw),
            "hadGlyphPlaceholder": had_glyph_placeholder,
            "font": font_name or None,
            "fontSize": float(size) if isinstance(size, (int, float)) else None,
            "weight": font.get("weight") if isinstance(font.get("weight"), (int, str)) else None,
            "italic": bool(font.get("italic")) if font.get("italic") is not None else None,
            "color": font.get("color") if isinstance(font.get("color"), str) else None,
            "lineHeight": float(font["line_height"]) if isinstance(font.get("line_height"), (int, float)) else None,
            "textAlign": item.get("text_align") if isinstance(item.get("text_align"), str) else None,
            "readingOrder": int(item["reading_order"]) if isinstance(item.get("reading_order"), int) else None,
            "label": item.get("label") if isinstance(item.get("label"), str) else None,
            "provider": "docling",
            "confidence": float(item["confidence"]) if isinstance(item.get("confidence"), (int, float)) else None,
            "numericTokens": extract_numeric_tokens(raw),
            "punctuationTokens": extract_punctuation_tokens(raw),
        })

    return spans, problems


# ── Table topology (Phase 7) ────────────────────────────────────────────────


def build_table_topology(table: dict) -> dict:
    """Preserve source table topology + cell association. Never copies merged-cell
    text into every spanned cell; never merges adjacent tables."""
    data = table.get("data") if isinstance(table.get("data"), dict) else {}
    raw_cells = data.get("table_cells")
    if not isinstance(raw_cells, list):
        grid = data.get("grid")
        raw_cells = [c for row in grid for c in row] if isinstance(grid, list) else []

    num_rows = int(data.get("num_rows") or 0)
    num_cols = int(data.get("num_cols") or 0)
    problems: list[str] = []

    cells: list[dict] = []
    header_rows: set[int] = set()
    header_cols: set[int] = set()
    for idx, c in enumerate(raw_cells):
        if not isinstance(c, dict):
            continue
        row = int(c.get("start_row_offset_idx", c.get("row", 0)) or 0)
        col = int(c.get("start_col_offset_idx", c.get("col", 0)) or 0)
        end_row = int(c.get("end_row_offset_idx", row + 1) or (row + 1))
        end_col = int(c.get("end_col_offset_idx", col + 1) or (col + 1))
        row_span = max(1, int(c.get("row_span") or (end_row - row) or 1))
        col_span = max(1, int(c.get("col_span") or (end_col - col) or 1))
        col_header = bool(c.get("column_header"))
        row_header = bool(c.get("row_header"))
        if col_header:
            header_rows.add(row)
        if row_header:
            header_cols.add(col)
        text = str(c.get("text") or "")
        cells.append({
            "id": f"r{row}c{col}",
            "row": row,
            "col": col,
            "rowSpan": row_span,
            "colSpan": col_span,
            "columnHeader": col_header,
            "rowHeader": row_header,
            "text": text,
            "numericTokens": extract_numeric_tokens(text),
            "bbox": _table_cell_bbox(c),
            "confidence": float(c["confidence"]) if isinstance(c.get("confidence"), (int, float)) else None,
            "providerRefs": ["docling"],
        })

    # Deterministic cell order: row, then column.
    cells.sort(key=lambda cell: (cell["row"], cell["col"]))

    # Span-bounds validation.
    for cell in cells:
        if cell["row"] + cell["rowSpan"] > max(num_rows, cell["row"] + cell["rowSpan"]) and num_rows:
            if cell["row"] + cell["rowSpan"] > num_rows:
                problems.append("cell_row_span_out_of_bounds")
        if num_cols and cell["col"] + cell["colSpan"] > num_cols:
            problems.append("cell_col_span_out_of_bounds")

    if num_rows <= 0 or num_cols <= 0:
        problems.append("table_dimensions_missing")
    if not cells:
        problems.append("table_has_no_cells")

    caption = table.get("caption") if isinstance(table.get("caption"), str) else None
    return {
        "version": SOURCE_TABLE_TOPOLOGY_VERSION,
        "numRows": num_rows,
        "numCols": num_cols,
        "headerRowCount": len(header_rows),
        "headerColumnCount": len(header_cols),
        "cells": cells,
        "caption": caption,
        "sourceProvider": "docling",
        "topologyProblems": sorted(set(problems)),
        "complete": len(problems) == 0,
    }


def _table_cell_bbox(cell: dict) -> Optional[dict]:
    b = cell.get("bbox")
    if isinstance(b, dict) and all(k in b for k in ("l", "t", "r", "b")):
        x = min(float(b["l"]), float(b["r"]))
        y = min(float(b["t"]), float(b["b"]))
        return {
            "x": _round2(x),
            "y": _round2(y),
            "width": _round2(abs(float(b["r"]) - float(b["l"]))),
            "height": _round2(abs(float(b["b"]) - float(b["t"]))),
        }
    return None


# ── Chart / picture classification (Phase 7) ────────────────────────────────


def _has_strong_chart_term(terms: list[str]) -> bool:
    for raw in terms:
        if not isinstance(raw, str):
            continue
        low = raw.lower()
        if any(term in low for term in STRONG_CHART_TERMS):
            return True
    return False


def _picture_class(pic: dict) -> Optional[str]:
    cl = pic.get("classification") if isinstance(pic.get("classification"), dict) else {}
    direct = cl.get("predicted_class")
    if isinstance(direct, str) and direct:
        return direct.lower()
    classes = cl.get("predicted_classes")
    if isinstance(classes, list) and classes:
        best = sorted(
            [c for c in classes if isinstance(c, dict)],
            key=lambda c: float(c.get("confidence") or 0.0),
            reverse=True,
        )
        if best and isinstance(best[0].get("class_name"), str):
            return str(best[0]["class_name"]).lower()
    return None


def _picture_caption_terms(pic: dict) -> list[str]:
    out: list[str] = []
    if isinstance(pic.get("caption"), str) and pic["caption"]:
        out.append(pic["caption"])
    for a in pic.get("annotations") or []:
        if isinstance(a, dict) and isinstance(a.get("text"), str) and a["text"]:
            out.append(a["text"])
    return out


# ── Region assembly (Phase 7) ───────────────────────────────────────────────


def _provider_evidence(provider: str, evidence_type: str, *, provider_ref=None,
                       confidence=None, claims=None, artifact_path=None) -> dict:
    return {
        "version": PROVIDER_REGION_EVIDENCE_VERSION,
        "provider": provider,
        "providerVersion": None,
        "evidenceType": evidence_type,
        "providerRef": provider_ref,
        "confidence": float(confidence) if isinstance(confidence, (int, float)) else None,
        "claims": list(claims or []),
        "artifactPath": artifact_path,
    }


def _empty_crop() -> dict:
    return {
        "path": None, "sha256": None, "mime": None,
        "widthPx": None, "heightPx": None, "sourceDpi": None, "paddingPt": None,
    }


def _base_region(global_page: int, page_id: str, region_type: str, bbox: dict, ordinal: int) -> dict:
    return {
        "version": SOURCE_REGION_VERSION,
        "id": region_id(global_page, region_type, bbox, ordinal),
        "pageId": page_id,
        "pageNumber": global_page,
        "type": region_type,
        "bbox": bbox,
        "polygon": None,
        "readingOrder": None,
        "zOrderHint": None,
        "confidence": None,
        "sourceCrop": _empty_crop(),
        "text": None,
        "table": None,
        "chart": None,
        "visual": None,
        "relationships": {
            "parentRegionId": None,
            "childRegionIds": [],
            "captionRegionIds": [],
            "labelRegionIds": [],
        },
        "providerEvidence": [],
        "problems": [],
        "complete": False,
    }


def build_page_regions(
    *,
    global_page: int,
    page_id: str,
    page_width: float,
    page_height: float,
    texts: list[dict],
    tables: list[dict],
    pictures: list[dict],
    vectors: list[dict],
) -> tuple[list[dict], list[str]]:
    """Assemble all source regions for one page from current provider evidence.

    Regions are canonically sorted and assigned deterministic per-(page,type)
    ordinals so the resulting IDs are chunk-independent. Does NOT merge tables,
    does NOT decide native/raster output, does NOT invent chart/table values.
    """
    page_problems: list[str] = []
    staged: list[tuple[str, dict, dict]] = []  # (type, bbox, payload)

    page_numeric = any(
        isinstance(t.get("text"), str) and NUMERIC_LABEL_RE.search(t["text"])
        for t in texts or []
    )
    title_terms: list[str] = [
        t["text"] for t in texts or []
        if isinstance(t.get("text"), str) and t.get("label") in ("title", "section_header", "caption")
    ]

    # Tables — one region each, never merged.
    for table in tables or []:
        bbox, bprob = normalize_bbox(_prov_bbox(table), page_width, page_height)
        if bbox is None:
            page_problems.extend(f"table_{p}" for p in bprob)
            continue
        topology = build_table_topology(table)
        staged.append(("table", bbox, {
            "table": topology,
            "confidence": table.get("confidence"),
            "caption": topology.get("caption"),
            "bboxProblems": bprob,
            "provider": _provider_evidence(
                "docling", "table", confidence=table.get("confidence"),
                claims=["source_table"] + (["topology_incomplete"] if not topology["complete"] else []),
            ),
        }))

    # Pictures → chart | logo | picture.
    covering_picture_present = False
    for pic in pictures or []:
        bbox, bprob = normalize_bbox(_prov_bbox(pic), page_width, page_height)
        if bbox is None:
            page_problems.extend(f"picture_{p}" for p in bprob)
            continue
        cls = _picture_class(pic)
        caption_terms = _picture_caption_terms(pic)
        chart_like = (cls is not None and CHART_CLASS_RE.search(cls) is not None) or (
            _has_strong_chart_term(caption_terms + title_terms) and page_numeric
        )
        if chart_like:
            region_type = "chart"
        elif cls is not None and LOGO_CLASS_RE.search(cls) is not None:
            region_type = "logo"
        else:
            region_type = "picture"
        covering_picture_present = covering_picture_present or region_type in ("chart", "picture")
        image = pic.get("image") if isinstance(pic.get("image"), dict) else {}
        has_embedded = bool(image.get("uri") or image.get("diagnostics_path"))
        payload: dict[str, Any] = {
            "confidence": pic.get("confidence"),
            "caption": pic.get("caption") if isinstance(pic.get("caption"), str) else None,
            "classification": cls,
            "hasEmbeddedImage": has_embedded,
            "bboxProblems": bprob,
            "provider": _provider_evidence(
                "docling", "classification", confidence=pic.get("confidence"),
                claims=[c for c in [f"class:{cls}" if cls else None,
                                    "chart_like" if chart_like else None,
                                    "embedded_image" if has_embedded else "needs_source_crop"] if c],
            ),
        }
        if region_type == "chart":
            payload["chart"] = _chart_metadata(cls, pic.get("caption"))
        staged.append((region_type, bbox, payload))

    # Dense vector clusters — conservative, bounded, deterministic.
    dense_count = 0
    for vec in vectors or []:
        paths = vec.get("paths")
        path_count = len(paths) if isinstance(paths, list) else 0
        if path_count < DENSE_VECTOR_MIN_PATHS:
            continue
        if covering_picture_present or not page_numeric:
            # A dense vector under a chart/picture crop or without numeric labels
            # is not independently treated as an unverified chart-like region.
            continue
        vbbox = _vector_bbox(vec, page_width, page_height)
        if vbbox is None:
            continue
        dense_count += 1
        if dense_count > MAX_DENSE_VECTOR_REGIONS:
            page_problems.append("dense_vector_regions_truncated")
            break
        staged.append(("vector-cluster", vbbox, {
            "confidence": vec.get("confidence"),
            "provider": _provider_evidence(
                "pymupdf", "vector", confidence=vec.get("confidence"),
                claims=[f"path_count:{path_count}", "numeric_labels_present"],
            ),
        }))

    # Text regions — block-level, referencing span evidence by bbox.
    for text in texts or []:
        if not isinstance(text.get("text"), str) or not text["text"].strip():
            continue
        bbox, bprob = normalize_bbox(_prov_bbox(text), page_width, page_height)
        if bbox is None:
            continue
        raw = text["text"]
        staged.append(("text", bbox, {
            "confidence": text.get("confidence"),
            "readingOrder": text.get("reading_order"),
            "textPayload": {
                "raw": raw,
                "normalizedNfc": normalize_nfc(raw),
                "exactTokens": raw.split(),
                "numericTokens": extract_numeric_tokens(raw),
                "punctuationTokens": extract_punctuation_tokens(raw),
                "spanIds": [],
                "label": text.get("label") if isinstance(text.get("label"), str) else None,
            },
            "provider": _provider_evidence("docling", "text", confidence=text.get("confidence")),
        }))

    # Canonical sort + per-(page,type) ordinal assignment → deterministic IDs.
    staged.sort(key=lambda s: _canonical_sort_key(s[0], s[1]))
    if len(staged) > MAX_REGIONS_PER_PAGE:
        page_problems.append("regions_truncated_to_limit")
        staged = staged[:MAX_REGIONS_PER_PAGE]

    ordinal_by_type: dict[str, int] = {}
    regions: list[dict] = []
    for region_type, bbox, payload in staged:
        ordinal_by_type[region_type] = ordinal_by_type.get(region_type, 0) + 1
        region = _base_region(global_page, page_id, region_type, bbox, ordinal_by_type[region_type])
        region["confidence"] = (
            float(payload["confidence"]) if isinstance(payload.get("confidence"), (int, float)) else None
        )
        if isinstance(payload.get("readingOrder"), int):
            region["readingOrder"] = payload["readingOrder"]
        if payload.get("table") is not None:
            region["table"] = payload["table"]
            if not payload["table"]["complete"]:
                region["problems"].append("table_topology_incomplete")
        if payload.get("chart") is not None:
            region["chart"] = payload["chart"]
        if payload.get("textPayload") is not None:
            region["text"] = payload["textPayload"]
        if payload.get("provider") is not None:
            region["providerEvidence"].append(payload["provider"])
        for bp in payload.get("bboxProblems") or []:
            region["problems"].append(f"bbox_{bp}")
        # A text region with a source crop is optional; every other type needs one.
        region["complete"] = region_type == "text" or region_type == "background"
        regions.append(region)

    return regions, page_problems


def _chart_metadata(cls: Optional[str], caption: Optional[str]) -> dict:
    chart_type = "unknown"
    if isinstance(cls, str):
        for name in ("bar", "line", "area", "pie", "scatter"):
            if name in cls:
                chart_type = name
                break
    return {
        "version": SOURCE_CHART_METADATA_VERSION,
        "chartType": chart_type,
        "caption": caption if isinstance(caption, str) else None,
        "structuredDataPath": None,
        "seriesCount": None,
        "categoryCount": None,
        "axisLabelRegionIds": [],
        "legendRegionIds": [],
        # The current production engine cannot extract series; crop_only is the
        # expected, honest state once a crop is attached.
        "extractionState": "crop_only",
        "problems": [],
    }


def _vector_bbox(vec: dict, page_width: float, page_height: float) -> Optional[dict]:
    b = vec.get("bbox")
    if isinstance(b, dict) and all(k in b for k in ("l", "t", "r", "b")):
        bbox, _ = normalize_bbox(b, page_width, page_height)
        return bbox
    view = vec.get("viewBox")
    if isinstance(view, str):
        parts = view.split()
        if len(parts) == 4:
            try:
                x, y, w, h = (float(p) for p in parts)
                bbox, _ = normalize_bbox([x, y, x + w, y + h], page_width, page_height)
                return bbox
            except ValueError:
                return None
    return None


# ── Crop attachment (Phase 6) ───────────────────────────────────────────────


def attach_crop(region: dict, *, path: Optional[str], sha256: Optional[str], mime: Optional[str],
                width_px: Optional[int], height_px: Optional[int], source_dpi: Optional[int],
                padding_pt: float, foreground: Optional[dict] = None) -> None:
    """Attach durable crop evidence (a private object PATH, never a signed/data URL)
    to a region and update its completeness."""
    if path is not None and not is_safe_artifact_path(path):
        region["problems"].append("crop_path_unsafe")
        region["complete"] = False
        return
    region["sourceCrop"] = {
        "path": path,
        "sha256": sha256,
        "mime": mime,
        "widthPx": int(width_px) if isinstance(width_px, int) else None,
        "heightPx": int(height_px) if isinstance(height_px, int) else None,
        "sourceDpi": int(source_dpi) if isinstance(source_dpi, int) else None,
        "paddingPt": _round2(padding_pt),
    }
    if foreground is not None:
        region["visual"] = {
            "foregroundOccupancy": foreground.get("foregroundRatio"),
            "edgeDensity": foreground.get("edgeDensity"),
            "dominantColors": foreground.get("dominantColors") or [],
        }
        occ = foreground.get("foregroundRatio")
        if region["type"] in ("chart", "picture", "table") and isinstance(occ, (int, float)) and occ < 0.005:
            region["problems"].append("crop_appears_blank")
    if region["type"] in CROP_REQUIRED_TYPES:
        region["complete"] = bool(path) and bool(sha256) and "crop_appears_blank" not in region["problems"] \
            and (region.get("table") is None or region["table"]["complete"])


def is_safe_artifact_path(path: Any) -> bool:
    """Reject traversal, absolute paths and external URLs in durable-path fields."""
    if not isinstance(path, str) or not path:
        return False
    if path.startswith("/") or path.startswith("\\"):
        return False
    if ".." in path.split("/"):
        return False
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", path):
        return False
    if path.startswith("data:"):
        return False
    return True


def crop_bbox_pixels(bbox: dict, page_height: float, dpi: int, padding_pt: float,
                     page_width: float) -> Optional[dict]:
    """Deterministic pixel crop rectangle for a region bbox at `dpi`, with padding
    clamped to the page. Returns pixel {left,top,width,height} (top-left origin)."""
    if not isinstance(bbox, dict):
        return None
    x = float(bbox.get("x") or 0.0)
    y = float(bbox.get("y") or 0.0)
    w = float(bbox.get("width") or 0.0)
    h = float(bbox.get("height") or 0.0)
    if w <= 0 or h <= 0:
        return None  # a zero-area source region is never a valid crop
    x0 = max(0.0, x - padding_pt)
    y0 = max(0.0, y - padding_pt)
    x1 = min(page_width, x + w + padding_pt)
    y1 = min(page_height, y + h + padding_pt)
    if x1 <= x0 or y1 <= y0:
        return None
    scale = dpi / 72.0
    return {
        "left": int(round(x0 * scale)),
        "top": int(round(y0 * scale)),
        "width": max(1, int(round((x1 - x0) * scale))),
        "height": max(1, int(round((y1 - y0) * scale))),
        "paddingPt": padding_pt,
    }


# ── Foreground / occupancy evidence (Phase 8) ───────────────────────────────


def build_foreground_summary(png_bytes: Optional[bytes], *, threshold: int = 245,
                             tile_rows: int = 8, tile_cols: int = 8) -> Optional[dict]:
    """Bounded page/region visual summary from PNG bytes using Pillow (lazy import).

    Returns None when Pillow is unavailable or bytes cannot be decoded — the
    caller records a problem rather than fabricating occupancy. Never returns a
    raw bitmap; only a bounded tile grid, ratio, bounds and edge density."""
    if not png_bytes:
        return None
    try:
        from PIL import Image  # lazy: keeps the module importable without Pillow
        import io as _io
    except Exception:
        return None
    tile_rows = max(1, min(int(tile_rows), MAX_TILE_GRID))
    tile_cols = max(1, min(int(tile_cols), MAX_TILE_GRID))
    try:
        img = Image.open(_io.BytesIO(png_bytes)).convert("L")
    except Exception:
        return None
    w, h = img.size
    if w <= 0 or h <= 0:
        return None
    px = img.load()
    non_white = 0
    min_x, min_y, max_x, max_y = w, h, -1, -1
    tile_counts = [0] * (tile_rows * tile_cols)
    tile_totals = [0] * (tile_rows * tile_cols)
    edge_hits = 0
    edge_samples = 0
    prev_row = None
    for yy in range(h):
        row_vals = []
        for xx in range(w):
            v = px[xx, yy]
            row_vals.append(v)
            ti = min(tile_rows - 1, yy * tile_rows // h)
            tj = min(tile_cols - 1, xx * tile_cols // w)
            tile_totals[ti * tile_cols + tj] += 1
            if v < threshold:
                non_white += 1
                tile_counts[ti * tile_cols + tj] += 1
                if xx < min_x:
                    min_x = xx
                if yy < min_y:
                    min_y = yy
                if xx > max_x:
                    max_x = xx
                if yy > max_y:
                    max_y = yy
            if xx > 0:
                edge_samples += 1
                if abs(v - row_vals[xx - 1]) > 40:
                    edge_hits += 1
        if prev_row is not None:
            for xx in range(w):
                edge_samples += 1
                if abs(row_vals[xx] - prev_row[xx]) > 40:
                    edge_hits += 1
        prev_row = row_vals

    total = float(w * h)
    ratio = round(non_white / total, 5) if total else 0.0
    occupancy = [
        round(tile_counts[i] / tile_totals[i], 4) if tile_totals[i] else 0.0
        for i in range(len(tile_counts))
    ]
    bounds = None
    if max_x >= min_x and max_y >= min_y:
        bounds = {"x": min_x, "y": min_y, "width": max_x - min_x + 1, "height": max_y - min_y + 1}
    edge_density = round(edge_hits / edge_samples, 5) if edge_samples else 0.0
    return {
        "version": SOURCE_FOREGROUND_SUMMARY_VERSION,
        "threshold": threshold,
        "foregroundRatio": ratio,
        "nonWhiteBounds": bounds,
        "tileRows": tile_rows,
        "tileCols": tile_cols,
        "tileOccupancy": occupancy,
        "edgeDensity": edge_density,
    }


# ── Page scene + scene graph assembly (Phase 2) ─────────────────────────────


def assemble_page_scene(
    *,
    global_page: int,
    page_id: str,
    width_pt: float,
    height_pt: float,
    rotation: int,
    regions: list[dict],
    source_raster: Optional[dict],
    foreground: Optional[dict],
    regions_path: str,
    source_spans_path: Optional[str],
    source_chunk: Optional[dict],
    problems: Optional[list[str]] = None,
) -> dict:
    problems = list(problems or [])
    rot = rotation if rotation in (0, 90, 180, 270) else 0
    region_ids = [r["id"] for r in regions]
    if len(set(region_ids)) != len(region_ids):
        problems.append("duplicate_region_ids")
    critical = [r for r in regions if r["type"] in CROP_REQUIRED_TYPES]
    missing_crop = [r["id"] for r in critical if not (r.get("sourceCrop") or {}).get("path")]
    if missing_crop:
        problems.append("critical_regions_missing_crop")
    complete = (
        not problems
        and all(r.get("complete") for r in critical)
        and (source_raster is not None and bool(source_raster.get("path")))
    )
    return {
        "version": SOURCE_SCENE_GRAPH_VERSION,
        "pageId": page_id,
        "pageNumber": global_page,
        "sourceChunk": source_chunk,
        "geometry": {"widthPt": _round2(width_pt), "heightPt": _round2(height_pt), "rotation": rot},
        "sourceRaster": source_raster or {
            "path": None, "sha256": None, "widthPx": None, "heightPx": None, "dpi": None, "mime": None,
        },
        "foreground": foreground,
        "sourceSpansPath": source_spans_path,
        "regionsPath": regions_path,
        "regionCount": len(regions),
        "criticalRegionCount": len(critical),
        "regionIds": region_ids,
        "problems": sorted(set(problems)),
        "complete": complete,
    }


def assemble_scene_graph(
    *,
    source_sha256: Optional[str],
    page_count: int,
    page_scenes: list[dict],
    engine: str,
    engine_version: str,
    lane_policy_version: Optional[str],
    generated_at: str,
) -> dict:
    problems: list[str] = []
    all_region_ids: list[str] = []
    for scene in page_scenes:
        all_region_ids.extend(scene.get("regionIds") or [])
    if len(set(all_region_ids)) != len(all_region_ids):
        problems.append("duplicate_region_ids_across_document")
    page_numbers = sorted(int(s["pageNumber"]) for s in page_scenes)
    if page_numbers:
        expected = list(range(page_numbers[0], page_numbers[0] + len(page_numbers)))
        if page_numbers != expected:
            problems.append("page_numbers_not_continuous")
    if len(set(page_numbers)) != len(page_numbers):
        problems.append("duplicate_page_numbers")
    complete = not problems and all(s.get("complete") for s in page_scenes) and len(page_scenes) == page_count
    return {
        "version": SOURCE_SCENE_GRAPH_VERSION,
        "source": {"sourceSha256": source_sha256, "mime": "application/pdf", "pageCount": int(page_count)},
        "coordinateSpace": {
            "units": "pdf-point", "origin": "top-left", "xIncreases": "right", "yIncreases": "down",
        },
        "extraction": {
            "engine": engine,
            "engineVersion": engine_version,
            "lanePolicyVersion": lane_policy_version,
            "artifactContractVersion": PAGE_ARTIFACT_CONTRACT_VERSION,
            "generatedAt": generated_at,
        },
        "pages": page_scenes,
        "problems": sorted(set(problems)),
        "complete": complete,
    }


# ── Validation (Phase 10) ───────────────────────────────────────────────────


def validate_scene_graph(scene: Any) -> dict:
    """Structured, non-throwing validation. Returns {ok, state, problems}. Never
    coerces an invalid structure into a valid empty scene graph."""
    problems: list[str] = []
    if not isinstance(scene, dict):
        return {"ok": False, "state": "invalid_v2", "problems": ["scene_not_object"]}
    version = scene.get("version")
    if version != SOURCE_SCENE_GRAPH_VERSION:
        return {"ok": False, "state": "unknown_version", "problems": [f"unknown_version:{version}"]}

    pages = scene.get("pages")
    if not isinstance(pages, list):
        return {"ok": False, "state": "invalid_v2", "problems": ["pages_not_list"]}

    seen_region_ids: set[str] = set()
    seen_page_ids: set[str] = set()
    for scene_page in pages:
        problems.extend(_validate_page_scene_inner(scene_page, seen_region_ids, seen_page_ids))

    ok = len(problems) == 0
    return {"ok": ok, "state": "valid_v2" if ok else "invalid_v2", "problems": problems}


def validate_page_scene(scene: Any) -> dict:
    problems = _validate_page_scene_inner(scene, set(), set())
    ok = len(problems) == 0
    return {"ok": ok, "state": "valid_v2" if ok else "invalid_v2", "problems": problems}


def _validate_page_scene_inner(scene: Any, seen_region_ids: set, seen_page_ids: set) -> list[str]:
    problems: list[str] = []
    if not isinstance(scene, dict):
        return ["page_scene_not_object"]
    if scene.get("version") != SOURCE_SCENE_GRAPH_VERSION:
        problems.append("page_scene_bad_version")
    page_id = scene.get("pageId")
    if isinstance(page_id, str):
        if page_id in seen_page_ids:
            problems.append("duplicate_page_id")
        seen_page_ids.add(page_id)
    page_no = scene.get("pageNumber")
    ids = scene.get("regionIds") or []
    for rid in ids:
        if rid in seen_region_ids:
            problems.append(f"duplicate_region_id:{rid}")
        seen_region_ids.add(rid)
    # Inline region validation when present (regions live in a sibling file, so a
    # scene may legitimately carry only regionIds).
    for region in scene.get("regions") or []:
        problems.extend(_validate_region(region, page_no))
    return problems


def _validate_region(region: Any, page_no: Any) -> list[str]:
    problems: list[str] = []
    if not isinstance(region, dict):
        return ["region_not_object"]
    if region.get("version") != SOURCE_REGION_VERSION:
        problems.append("region_bad_version")
    rtype = region.get("type")
    bbox = region.get("bbox")
    if not isinstance(bbox, dict):
        problems.append("region_bbox_missing")
    else:
        for k in ("x", "y", "width", "height"):
            v = bbox.get(k)
            if not isinstance(v, (int, float)) or not math.isfinite(float(v)):
                problems.append(f"region_bbox_{k}_non_finite")
            elif k in ("width", "height") and float(v) <= 0:
                problems.append(f"region_bbox_{k}_non_positive")
            elif k in ("x", "y") and float(v) < 0:
                problems.append(f"region_bbox_{k}_negative")
    if region.get("pageNumber") != page_no and page_no is not None:
        problems.append("region_page_mismatch")
    crop = region.get("sourceCrop") or {}
    path = crop.get("path")
    if path is not None and not is_safe_artifact_path(path):
        problems.append("region_crop_path_unsafe")
    sha = crop.get("sha256")
    if sha is not None and not re.fullmatch(r"[0-9a-f]{64}", str(sha)):
        problems.append("region_crop_sha_invalid")
    if rtype in CROP_REQUIRED_TYPES and not path:
        problems.append("critical_region_missing_crop")
    conf = region.get("confidence")
    if conf is not None and (not isinstance(conf, (int, float)) or not math.isfinite(float(conf))):
        problems.append("region_confidence_non_finite")
    table = region.get("table")
    if isinstance(table, dict):
        problems.extend(_validate_table(table))
    return problems


def _validate_table(table: dict) -> list[str]:
    problems: list[str] = []
    num_rows = table.get("numRows")
    num_cols = table.get("numCols")
    for cell in table.get("cells") or []:
        if not isinstance(cell, dict):
            continue
        row, col = cell.get("row"), cell.get("col")
        rspan, cspan = cell.get("rowSpan", 1), cell.get("colSpan", 1)
        if isinstance(row, int) and isinstance(rspan, int) and isinstance(num_rows, int) and num_rows > 0:
            if row < 0 or row + rspan > num_rows:
                problems.append("table_cell_row_out_of_bounds")
        if isinstance(col, int) and isinstance(cspan, int) and isinstance(num_cols, int) and num_cols > 0:
            if col < 0 or col + cspan > num_cols:
                problems.append("table_cell_col_out_of_bounds")
    return problems
