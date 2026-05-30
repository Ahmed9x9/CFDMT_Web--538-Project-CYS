from __future__ import annotations

import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

HOST = os.environ.get("CFDMT_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("CFDMT_API_PORT", "8000"))
SERVER_DIR = Path(__file__).resolve().parent
REPAIR_BACKUP_DIR = SERVER_DIR / "repair_backups"
REPO_ROOT = SERVER_DIR.parent
ENGINE_SECRET = os.environ.get("CFDMT_ENGINE_SECRET", "cfdmt-web-dev-engine-secret-change-in-production")
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CFDMT_ENGINE_CORS_ORIGINS", "").split(",") if origin.strip()]
def _managed_file_roots() -> tuple[Path, ...]:
    roots = [REPO_ROOT / "api" / "uploads", REPO_ROOT / "api" / "repaired"]
    configured = os.environ.get("CFDMT_MANAGED_FILE_ROOTS", "")
    for raw_root in configured.split(","):
        raw_root = raw_root.strip()
        if raw_root:
            roots.append(Path(raw_root).expanduser())
    return tuple(root.resolve() for root in roots)


ALLOWED_FILE_ROOTS = _managed_file_roots()
VALID_PROFILES = {"quick", "full", "custom"}


def _looks_like_tool_root(path: Path) -> bool:
    return (
        (path / "app" / "services" / "scan_service.py").is_file()
        and (path / "app" / "services" / "repair_service.py").is_file()
        and (path / "app" / "core" / "integrity.py").is_file()
    )


def _candidate_roots() -> list[Path]:
    candidates: list[Path] = []
    configured = os.environ.get("CFDMT_TOOL_ROOT", "").strip()
    if configured:
        candidates.append(Path(configured).expanduser())

    relative_candidates = [Path("cfdmt_tool")]
    for ancestor in (SERVER_DIR, *SERVER_DIR.parents):
        for relative in relative_candidates:
            candidates.append(ancestor / relative)

    return candidates


def _discover_tool_root() -> Path:
    for candidate in _candidate_roots():
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if _looks_like_tool_root(resolved):
            return resolved
    raise RuntimeError("Could not find the CFDMT Python tool. Set CFDMT_TOOL_ROOT to the tool folder.")


TOOL_ROOT = _discover_tool_root()
TOOL_SITE_PACKAGES = TOOL_ROOT / ".venv" / "Lib" / "site-packages"
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))
if TOOL_SITE_PACKAGES.exists() and str(TOOL_SITE_PACKAGES) not in sys.path:
    sys.path.insert(1, str(TOOL_SITE_PACKAGES))

from app.core.integrity import compute_sha256  # noqa: E402
from app.services.repair_service import repair_single_file  # noqa: E402
from app.services.scan_service import scan_path  # noqa: E402


class EngineScanRequest(BaseModel):
    path: str
    profile: str = "full"


class EngineRepairRequest(BaseModel):
    path: str


app = FastAPI(
    title="CFDMT Web Engine API",
    version="1.0.0",
    description="FastAPI bridge between CFDMT Web and the Python scan/repair engine.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def _file_type(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    return suffix.upper() if suffix else "UNKNOWN"


def _matching_scan_record(scan_payload: dict[str, Any], path: Path) -> dict[str, Any] | None:
    target = str(path.resolve()).casefold()
    for record in scan_payload.get("results", []) or []:
        if not isinstance(record, dict):
            continue
        record_path = str(record.get("path", ""))
        try:
            if str(Path(record_path).resolve()).casefold() == target:
                return record
        except Exception:
            if record_path.casefold() == str(path).casefold():
                return record
    results = scan_payload.get("results", []) or []
    first = results[0] if results else None
    return first if isinstance(first, dict) else None


def _evidence_text(record: dict[str, Any] | None) -> str:
    if not record:
        return "No corruption evidence found."
    for key in ("evidence_text", "summary", "latest_evidence"):
        value = str(record.get(key) or "").strip()
        if value:
            return value
    explanations = record.get("explanations")
    if isinstance(explanations, list) and explanations:
        first = explanations[0]
        if isinstance(first, dict):
            title = str(first.get("title") or "").strip()
            description = str(first.get("description") or "").strip()
            if title and description:
                return f"{title}: {description}"
            if title:
                return title
    evidence = record.get("evidence")
    if isinstance(evidence, list) and evidence:
        first = evidence[0]
        if isinstance(first, dict):
            check = str(first.get("check") or "Integrity issue").replace("_", " ")
            detail = str(first.get("detail") or "").strip()
            return f"{check}: {detail}" if detail else check
    return "The scanner flagged this file for review."


def _status_slug_from_scan_record(record: dict[str, Any] | None) -> str:
    if not record:
        return "clean"
    explicit = str(record.get("status") or record.get("result_status") or "").lower()
    if explicit in {"clean", "suspicious", "corrupted"}:
        return explicit
    evidence = record.get("evidence") if isinstance(record, dict) else None
    severities: list[str] = []
    if isinstance(evidence, list):
        severities = [
            str(item.get("severity", "")).lower()
            for item in evidence
            if isinstance(item, dict)
        ]
    if any(level in {"high", "critical"} for level in severities):
        return "corrupted"
    return "suspicious"


def _severity_from_scan_record(record: dict[str, Any] | None) -> str:
    if not record:
        return "info"
    summary = record.get("summary_evidence")
    if isinstance(summary, dict):
        severity = str(summary.get("severity") or "").lower()
        if severity in {"info", "low", "medium", "high", "critical"}:
            return severity
    evidence = record.get("evidence") if isinstance(record, dict) else None
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict):
                severity = str(item.get("severity") or "").lower()
                if severity in {"info", "low", "medium", "high", "critical"}:
                    return severity
    confidence = str(record.get("confidence") or "").lower()
    if confidence in {"low", "medium", "high"}:
        return confidence
    return "medium"


def _check_code_from_scan_record(record: dict[str, Any] | None) -> str:
    if not record:
        return "NO_CORRUPTION_FOUND"
    summary = record.get("summary_evidence")
    if isinstance(summary, dict) and summary.get("code"):
        return str(summary["code"])
    evidence = record.get("evidence")
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict) and item.get("check"):
                return str(item["check"])
    return "GENERIC_CORRUPTION"


def _recommendation_from_scan_record(record: dict[str, Any] | None) -> str:
    if not record:
        return "No action is required."
    for key in ("evidence_hint", "recommendation"):
        value = str(record.get(key) or "").strip()
        if value:
            return value
    summary = record.get("summary_evidence")
    if isinstance(summary, dict):
        for key in ("suggested_action", "hint"):
            value = str(summary.get(key) or "").strip()
            if value:
                return value
    return "Review the evidence and restore a known-good copy if needed."


def _require_engine_token(token: str | None) -> None:
    if not token or not secrets.compare_digest(token, ENGINE_SECRET):
        raise HTTPException(status_code=403, detail="Engine token is invalid.")


def _validate_file_path(raw_path: str) -> Path:
    try:
        path = Path(raw_path).expanduser().resolve(strict=True)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="File does not exist.") from exc

    if not path.is_file():
        raise HTTPException(status_code=404, detail="File does not exist.")
    if not any(path.is_relative_to(root) for root in ALLOWED_FILE_ROOTS):
        raise HTTPException(status_code=403, detail="File path is outside managed upload storage.")
    return path


def _engine_scan_result(path: Path, profile: str) -> dict[str, Any]:
    scan_payload = scan_path(str(path), {}, profile_override=profile, source="web")
    scan_payload = _jsonable(scan_payload)
    record = _matching_scan_record(scan_payload, path)
    status = _status_slug_from_scan_record(record)
    return {
        "ok": True,
        "engine": "fastapi-python",
        "status": status,
        "check_code": _check_code_from_scan_record(record),
        "severity": _severity_from_scan_record(record),
        "evidence": _evidence_text(record),
        "recommendation": _recommendation_from_scan_record(record),
        "raw_details": scan_payload,
        "scanned_count": int(scan_payload.get("scanned_count", 1) or 1),
        "flagged_count": int(scan_payload.get("flagged_count", 0) or 0),
        "scan_profile": str(scan_payload.get("scan_profile") or profile),
        "validation_mode": str(scan_payload.get("validation_mode") or ""),
        "file_type": str((record or {}).get("type") or _file_type(path)),
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "engine": "fastapi", "toolRoot": str(TOOL_ROOT)}


@app.get("/api/v1/health")
def v1_health() -> dict[str, Any]:
    return health()


@app.post("/api/engine/scan")
def engine_scan(request: EngineScanRequest, x_cfdmt_engine_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_engine_token(x_cfdmt_engine_token)
    profile = request.profile if request.profile in VALID_PROFILES else "full"
    return _engine_scan_result(_validate_file_path(request.path), profile)


@app.post("/api/v1/scan")
def v1_scan(request: EngineScanRequest, x_cfdmt_engine_token: str | None = Header(default=None)) -> dict[str, Any]:
    return engine_scan(request, x_cfdmt_engine_token)


@app.post("/api/engine/repair")
def engine_repair(request: EngineRepairRequest, x_cfdmt_engine_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_engine_token(x_cfdmt_engine_token)
    path = _validate_file_path(request.path)
    REPAIR_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    result = repair_single_file(str(path), backup_dir=str(REPAIR_BACKUP_DIR))
    details = _jsonable(getattr(result, "details", {}) or {})
    success = bool(getattr(result, "success", False))
    message = str(getattr(result, "message", "Repair completed." if success else "Repair failed."))
    repaired_path = Path(str(getattr(result, "repaired_path", str(path))))

    integrity: dict[str, Any] = {}
    if repaired_path.is_file():
        integrity = _jsonable(compute_sha256(repaired_path))

    return {
        "ok": True,
        "engine": "fastapi-python",
        "success": success,
        "message": message,
        "repaired_path": str(repaired_path),
        "backup_path": getattr(result, "backup_path", None),
        "validation_passed": bool(details.get("validation_passed", success)) if isinstance(details, dict) else success,
        "details": details,
        "sha256": str(integrity.get("sha256", "")),
        "size_bytes": int(integrity.get("size", 0) or 0),
        "file_type": _file_type(repaired_path),
        "stored_name": repaired_path.name,
    }


@app.post("/api/v1/repair")
def v1_repair(request: EngineRepairRequest, x_cfdmt_engine_token: str | None = Header(default=None)) -> dict[str, Any]:
    return engine_repair(request, x_cfdmt_engine_token)
