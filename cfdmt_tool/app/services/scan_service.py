from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any

from app.core.integrity import compute_sha256

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_IEND_CHUNK = b"\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"
RAR4_SIGNATURE = b"Rar!\x1a\x07\x00"
RAR5_SIGNATURE = b"Rar!\x1a\x07\x01\x00"
SEVEN_Z_SIGNATURE = b"7z\xbc\xaf\x27\x1c"
SUPPORTED_EXTENSIONS = {"png", "jpg", "jpeg", "pdf", "zip", "rar", "7z"}


def _read_prefix(path: Path, size: int = 1024) -> bytes:
    with path.open("rb") as handle:
        return handle.read(size)


def _read_tail(path: Path, size: int = 4096) -> bytes:
    file_size = path.stat().st_size
    with path.open("rb") as handle:
        handle.seek(max(0, file_size - size))
        return handle.read(size)


def _file_type(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    return suffix.upper() if suffix else "UNKNOWN"


def _finding(
    path: Path,
    *,
    status: str,
    check_code: str,
    severity: str,
    evidence: str,
    recommendation: str,
) -> dict[str, Any]:
    integrity = compute_sha256(path)
    return {
        "path": str(path),
        "name": path.name,
        "type": _file_type(path),
        "status": status,
        "result_status": status,
        "sha256": integrity["sha256"],
        "size_bytes": integrity["size"],
        "summary": evidence,
        "evidence_text": evidence,
        "recommendation": recommendation,
        "evidence_hint": recommendation,
        "summary_evidence": {
            "code": check_code,
            "severity": severity,
            "detail": evidence,
            "suggested_action": recommendation,
        },
        "evidence": [
            {
                "check": check_code,
                "severity": severity,
                "detail": evidence,
                "recommendation": recommendation,
            }
        ],
        "explanations": [
            {
                "title": check_code.replace("_", " ").title(),
                "description": evidence,
            }
        ],
    }


def _clean(path: Path, evidence: str = "No corruption evidence found.") -> dict[str, Any]:
    return _finding(
        path,
        status="clean",
        check_code="NO_CORRUPTION_FOUND",
        severity="info",
        evidence=evidence,
        recommendation="No action is required.",
    )


def _scan_png(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 16)
    tail = _read_tail(path)
    if not prefix.startswith(PNG_SIGNATURE):
        return _finding(
            path,
            status="corrupted",
            check_code="PNG_HEADER_BAD",
            severity="high",
            evidence="The PNG signature is missing or damaged.",
            recommendation="Replace the image with a clean copy or upload the original file again.",
        )
    if PNG_IEND_CHUNK not in tail and b"IEND" not in tail:
        return _finding(
            path,
            status="suspicious",
            check_code="PNG_IEND_MISSING",
            severity="medium",
            evidence="The PNG end marker was not found near the end of the file.",
            recommendation="Try the repair action or replace the image with a clean copy.",
        )
    return _clean(path, "PNG signature and end marker were found.")


def _scan_jpeg(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 16)
    tail = _read_tail(path)
    if not prefix.startswith(JPEG_START):
        return _finding(
            path,
            status="corrupted",
            check_code="JPEG_HEADER_BAD",
            severity="high",
            evidence="The JPEG start marker is missing or damaged.",
            recommendation="Replace the image with a clean copy or upload the original file again.",
        )
    if not tail.rstrip().endswith(JPEG_END):
        return _finding(
            path,
            status="suspicious",
            check_code="JPEG_EOI_MISSING",
            severity="medium",
            evidence="The JPEG end marker was not found at the end of the file.",
            recommendation="Try the repair action or replace the image with a clean copy.",
        )
    return _clean(path, "JPEG start and end markers were found.")


def _scan_pdf(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 1024)
    tail = _read_tail(path)
    if b"%PDF-" not in prefix[:32]:
        return _finding(
            path,
            status="corrupted",
            check_code="PDF_HEADER_MISSING",
            severity="high",
            evidence="The PDF header is missing or damaged.",
            recommendation="Replace the PDF with a clean copy or upload the original file again.",
        )
    if b"%%EOF" not in tail:
        return _finding(
            path,
            status="suspicious",
            check_code="PDF_EOF_MISSING",
            severity="medium",
            evidence="The PDF EOF marker was not found near the end of the file.",
            recommendation="Try the repair action or replace the PDF with a clean copy.",
        )
    return _clean(path, "PDF header and EOF marker were found.")


def _scan_zip(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 8)
    if not prefix.startswith(b"PK"):
        return _finding(
            path,
            status="corrupted",
            check_code="ZIP_HEADER_BAD",
            severity="high",
            evidence="The ZIP container signature is missing or damaged.",
            recommendation="Replace the archive with a clean copy or upload the original file again.",
        )
    try:
        with zipfile.ZipFile(path) as archive:
            bad_member = archive.testzip()
    except zipfile.BadZipFile:
        return _finding(
            path,
            status="corrupted",
            check_code="ZIP_OPEN_FAILED",
            severity="high",
            evidence="The ZIP central directory could not be validated.",
            recommendation="Try the repair action or replace the archive with a clean copy.",
        )
    if bad_member:
        return _finding(
            path,
            status="corrupted",
            check_code="ZIP_MEMBER_CRC_FAILED",
            severity="high",
            evidence=f"The ZIP member {bad_member} failed checksum validation.",
            recommendation="Replace the archive with a clean copy.",
        )
    return _clean(path, "ZIP container opened and all member checksums passed.")


def _scan_rar(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 16)
    if not (prefix.startswith(RAR4_SIGNATURE) or prefix.startswith(RAR5_SIGNATURE)):
        return _finding(
            path,
            status="corrupted",
            check_code="RAR_HEADER_BAD",
            severity="high",
            evidence="The RAR archive signature is missing or damaged.",
            recommendation="Replace the archive with a clean copy or upload the original file again.",
        )
    return _clean(path, "RAR archive signature was found.")


def _scan_7z(path: Path) -> dict[str, Any]:
    prefix = _read_prefix(path, 16)
    if not prefix.startswith(SEVEN_Z_SIGNATURE):
        return _finding(
            path,
            status="corrupted",
            check_code="SEVEN_Z_HEADER_BAD",
            severity="high",
            evidence="The 7Z archive signature is missing or damaged.",
            recommendation="Replace the archive with a clean copy or upload the original file again.",
        )
    return _clean(path, "7Z archive signature was found.")


def scan_file(path: str | Path, profile: str = "full") -> dict[str, Any]:
    file_path = Path(path)
    if not file_path.is_file():
        raise FileNotFoundError(f"File does not exist: {file_path}")
    if file_path.stat().st_size == 0:
        return _finding(
            file_path,
            status="corrupted",
            check_code="EMPTY_FILE",
            severity="high",
            evidence="The file is empty.",
            recommendation="Upload a complete copy of the file.",
        )

    extension = file_path.suffix.lower().lstrip(".")
    if extension == "png":
        return _scan_png(file_path)
    if extension in {"jpg", "jpeg"}:
        return _scan_jpeg(file_path)
    if extension == "pdf":
        return _scan_pdf(file_path)
    if extension == "zip":
        return _scan_zip(file_path)
    if extension == "rar":
        return _scan_rar(file_path)
    if extension == "7z":
        return _scan_7z(file_path)

    return _finding(
        file_path,
        status="suspicious",
        check_code="UNSUPPORTED_FILE_TYPE",
        severity="medium",
        evidence="This public engine only supports PNG, JPG, PDF, ZIP, RAR, and 7Z files.",
        recommendation="Upload one of the supported file types.",
    )


def _iter_scan_targets(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    if target.is_dir():
        return [item for item in target.rglob("*") if item.is_file()]
    raise FileNotFoundError(f"Path does not exist: {target}")


def scan_path(
    target_path: str,
    settings: dict | None = None,
    *,
    profile_override: str | None = None,
    source: str = "manual",
    progress_callback=None,
    cancel_event=None,
) -> dict[str, Any]:
    profile = profile_override if profile_override in {"quick", "full", "custom"} else "full"
    target = Path(target_path).expanduser().resolve()
    results: list[dict[str, Any]] = []

    for file_path in _iter_scan_targets(target):
        if cancel_event is not None and cancel_event.is_set():
            break
        result = scan_file(file_path, profile)
        results.append(result)
        if progress_callback:
            progress_callback(result)

    flagged_count = sum(1 for result in results if result.get("status") != "clean")
    return {
        "ok": True,
        "engine": "simple-web-engine",
        "source": source,
        "scan_profile": profile,
        "validation_mode": "basic-public-validators",
        "scanned_count": len(results),
        "flagged_count": flagged_count,
        "results": results,
    }
