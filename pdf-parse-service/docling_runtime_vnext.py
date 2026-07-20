"""docling vNext runtime (E2). Implements DoclingRuntime for Docling 2.113+.

Import-safe: docling is imported LAZILY inside methods, so this module (and the
capability/profile logic) imports in CI without torch/docling. A vNext response
always discloses that the vNext runtime executed; a failed vNext initialisation
RAISES — it never silently runs legacy while reporting vNext.
"""

from __future__ import annotations

from typing import Any, Optional

from docling_runtime_protocol import (
    DOCLING_VNEXT_ADAPTER_VERSION,
    RuntimeCapabilityReport,
    RuntimeConversionResult,
)
from docling_vnext_profiles import VNextBuildOptions, VNextConverterProfile, converter_key
from docling_capabilities import build_capability_report, introspect_installed
from docling_vnext_adapter import (
    DOCLING_VNEXT_ADAPTER_VERSION as ADAPTER_VERSION,
    normalize_conversion_status,
    normalize_document,
)


class DoclingVNextRuntime:
    profile_version = DOCLING_VNEXT_ADAPTER_VERSION

    def __init__(self, options: Optional[VNextBuildOptions] = None, *, docling_version: Optional[str] = None):
        self.options = options or VNextBuildOptions()
        self._docling_version = docling_version
        self._converters: dict[str, Any] = {}
        self._probe = introspect_installed()

    def profile_name(self) -> str:
        return "vnext"

    def package_versions(self) -> dict[str, str]:
        return dict(self._probe.get("package_versions", {}))

    def capabilities(self) -> RuntimeCapabilityReport:
        return build_capability_report("vnext", self.options, probe=self._probe)

    def require_docling(self) -> None:
        """Fail loudly if docling is not importable — never fall back to legacy."""
        if not self._probe.get("docling_importable"):
            raise RuntimeError(
                "vnext runtime selected but docling pipeline options are not importable; "
                "refusing to fall back to legacy (would misreport the engine that ran)."
            )

    def build_converter(self, profile: VNextConverterProfile) -> Any:
        """Construct (and cache) a DocumentConverter for this profile. Caching is
        keyed by `converter_key(profile)` so any converter-affecting field change
        yields a distinct converter."""
        self.require_docling()
        key = converter_key(profile)
        if key in self._converters:
            return self._converters[key]
        converter = self._construct_converter(profile)
        self._converters[key] = converter
        return converter

    def _construct_converter(self, profile: VNextConverterProfile) -> Any:  # pragma: no cover - needs docling
        # Real construction runs only inside the vnext image. Kept in one place so
        # no version conditionals leak into app_vnext.py. Uses PUBLIC APIs only.
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions

        opts = PdfPipelineOptions()
        _safe_public_set(opts, "do_ocr", profile.do_ocr)
        _safe_public_set(opts, "force_full_page_ocr", profile.force_full_page_ocr)
        _safe_public_set(opts, "do_table_structure", profile.do_table_structure)
        _safe_public_set(opts, "do_picture_classification", profile.do_picture_classification)
        _safe_public_set(opts, "do_picture_description", profile.do_picture_description)
        _safe_public_set(opts, "do_formula_enrichment", profile.do_formula_enrichment)
        _safe_public_set(opts, "do_code_enrichment", profile.do_code_enrichment)
        _safe_public_set(opts, "generate_page_images", profile.generate_page_images)
        _safe_public_set(opts, "generate_picture_images", profile.generate_picture_images)
        _safe_public_set(opts, "generate_table_images", profile.generate_table_images)
        _safe_public_set(opts, "images_scale", profile.images_scale)
        _safe_public_set(opts, "force_backend_text", profile.force_backend_text)
        _safe_public_set(opts, "enable_remote_services", False)  # security invariant
        _safe_public_set(opts, "allow_external_plugins", False)  # security invariant
        if profile.document_timeout:
            _safe_public_set(opts, "document_timeout", profile.document_timeout)
        # Accurate table mode + cell matching via the public table options object.
        table_opts = getattr(opts, "table_structure_options", None)
        if table_opts is not None:
            from docling.datamodel.pipeline_options import TableFormerMode
            mode = TableFormerMode.ACCURATE if profile.table_mode == "accurate" else TableFormerMode.FAST
            _safe_public_set(table_opts, "mode", mode)
            _safe_public_set(table_opts, "do_cell_matching", profile.table_cell_matching)
        return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})

    def convert(self, source: Any, profile: VNextConverterProfile,
                page_range: Optional[tuple[int, int]] = None) -> RuntimeConversionResult:  # pragma: no cover - needs docling
        self.require_docling()
        converter = self.build_converter(profile)
        try:
            kwargs: dict[str, Any] = {}
            if page_range:
                kwargs["page_range"] = page_range
            result = converter.convert(source, **kwargs)
        except Exception as exc:
            return RuntimeConversionResult(
                status="failure", document=None, pages_processed=0, pages_failed=0,
                errors=(f"{type(exc).__name__}: {str(exc)[:200]}",),
                engine_identity=self.engine_identity(profile),
            )
        doc = self.export_document(result)
        pages_total = len(doc.get("pages") or {})
        errors = [str(e)[:200] for e in (getattr(result, "errors", None) or [])]
        status = normalize_conversion_status(getattr(result, "status", None),
                                             pages_total=pages_total, pages_failed=len(errors))
        return RuntimeConversionResult(
            status=status, document=doc, pages_processed=pages_total, pages_failed=len(errors),
            errors=tuple(errors), engine_identity=self.engine_identity(profile),
        )

    def export_document(self, result: Any) -> dict:  # pragma: no cover - needs docling
        doc = getattr(result, "document", result)
        raw = doc.model_dump(mode="json") if hasattr(doc, "model_dump") else dict(doc)
        return normalize_document(raw)

    def engine_identity(self, profile: VNextConverterProfile) -> dict:
        versions = self.package_versions()
        return {
            "runtime_profile": "vnext",
            "adapter_version": ADAPTER_VERSION,
            "docling_version": versions.get("docling") or self._docling_version,
            "pipeline_family": profile.pipeline_family,
            "ocr_engine": profile.ocr_engine if profile.do_ocr else None,
            "table_mode": profile.table_mode,
            "table_cell_matching": profile.table_cell_matching,
            "chart_extraction": profile.do_chart_extraction,
            "device": profile.device,
            "converter_key": converter_key(profile),
            "build_profile": self.options.build_profile,
        }


def _safe_public_set(obj: Any, attr: str, value: Any) -> bool:
    """Set an attribute only when the PUBLIC field exists (Pydantic model_fields /
    attribute). Never touches private/underscore internals."""
    try:
        fields = getattr(type(obj), "model_fields", None)
        if fields is not None and attr not in fields and not hasattr(obj, attr):
            return False
        if fields is None and not hasattr(obj, attr):
            return False
        setattr(obj, attr, value)
        return True
    except Exception:
        return False
