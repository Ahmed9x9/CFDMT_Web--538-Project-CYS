from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import shutil
import sys
import traceback
import uuid
import warnings
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


warnings.filterwarnings("ignore", category=DeprecationWarning)
import cgi

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("CFDMT_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("CFDMT_API_PORT", "8000"))
SERVER_DIR = Path(__file__).resolve().parent
STATE_FILE = SERVER_DIR / "cfdmt_state.json"
UPLOAD_DIR = SERVER_DIR / "uploads"
REPAIR_BACKUP_DIR = SERVER_DIR / "repair_backups"
DEBUG_LOG = SERVER_DIR / "api_debug.log"


def _debug(message: str) -> None:
    try:
        with DEBUG_LOG.open("a", encoding="utf-8") as handle:
            handle.write(f"{_now()} {message}\n")
    except Exception:
        pass


def _discover_tool_root() -> Path:
    configured = os.environ.get("CFDMT_TOOL_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()

    for ancestor in (SERVER_DIR, *SERVER_DIR.parents):
        candidate = ancestor / "cfdmt_tool"
        if (candidate / "app" / "services" / "scan_service.py").exists():
            return candidate.resolve()

    raise RuntimeError(
        "Could not find the CFDMT Python tool. Set CFDMT_TOOL_ROOT to the tool folder."
    )


TOOL_ROOT = _discover_tool_root()
TOOL_SITE_PACKAGES = TOOL_ROOT / ".venv" / "Lib" / "site-packages"
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))
if TOOL_SITE_PACKAGES.exists() and str(TOOL_SITE_PACKAGES) not in sys.path:
    sys.path.insert(1, str(TOOL_SITE_PACKAGES))

from app.core.integrity import compute_sha256  # noqa: E402
from app.services.repair_service import repair_single_file  # noqa: E402
from app.services.scan_service import scan_path  # noqa: E402


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _date_label(value: str | None = None) -> str:
    raw = value or _now()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return raw[:10]


def _safe_name(name: str) -> str:
    cleaned = Path(name or "uploaded-file").name.strip() or "uploaded-file"
    cleaned = "".join(ch if ch not in '<>:"/\\|?*' else "_" for ch in cleaned)
    return cleaned[:180]


def _file_type(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    return suffix.upper() if suffix else "UNKNOWN"


def _format_size(size_bytes: int) -> str:
    units = ("B", "KB", "MB", "GB")
    value = float(max(size_bytes, 0))
    unit = units[0]
    for unit in units:
        if value < 1024 or unit == units[-1]:
            break
        value /= 1024
    if unit == "B":
        return f"{int(value)} B"
    return f"{value:.1f} {unit}"


def _short_hash(full_hash: str) -> str:
    return f"{full_hash[:12]}..." if full_hash else ""


def _evidence_text(record: dict | None) -> str:
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


def _status_from_scan_record(record: dict | None) -> str:
    if not record:
        return "Clean"
    explicit = str(record.get("status") or record.get("result_status") or "").lower()
    if explicit == "clean":
        return "Clean"
    if explicit == "suspicious":
        return "Suspicious"
    if explicit == "corrupted":
        return "Corrupted"
    evidence = record.get("evidence") if isinstance(record, dict) else None
    severities = []
    if isinstance(evidence, list):
        severities = [
            str(item.get("severity", "")).lower()
            for item in evidence
            if isinstance(item, dict)
        ]
    if any(level in {"high", "critical"} for level in severities):
        return "Corrupted"
    return "Suspicious"


def _status_slug_from_scan_record(record: dict | None) -> str:
    return _status_from_scan_record(record).lower()


def _severity_from_scan_record(record: dict | None) -> str:
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


def _check_code_from_scan_record(record: dict | None) -> str:
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


def _recommendation_from_scan_record(record: dict | None) -> str:
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


def _engine_scan_result(path: Path, *, profile: str = "full") -> dict:
    payload = scan_path(str(path), {}, profile_override=profile, source="web")
    record = _matching_scan_record(payload, path)
    status = _status_slug_from_scan_record(record)
    return {
        "ok": True,
        "engine": "python",
        "status": status,
        "check_code": _check_code_from_scan_record(record),
        "severity": _severity_from_scan_record(record),
        "evidence": _evidence_text(record),
        "recommendation": _recommendation_from_scan_record(record),
        "raw_details": payload,
        "scanned_count": int(payload.get("scanned_count", 1) or 1),
        "flagged_count": int(payload.get("flagged_count", 0) or 0),
        "scan_profile": str(payload.get("scan_profile") or profile),
        "validation_mode": str(payload.get("validation_mode") or ""),
        "file_type": str((record or {}).get("type") or _file_type(path)),
    }


def _load_state() -> dict:
    if not STATE_FILE.exists():
        return {
            "files": [],
            "actions": [],
            "currentUser": {
                "id": "local-admin",
                "name": "Demo Admin",
                "email": "decoy.admin@cfdmt.test",
                "role": "admin",
                "joined": "2026-01-12",
            },
        }
    with STATE_FILE.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    state.setdefault("files", [])
    state.setdefault("actions", [])
    state.setdefault(
        "currentUser",
        {
            "id": "local-admin",
            "name": "Demo Admin",
            "email": "decoy.admin@cfdmt.test",
            "role": "admin",
            "joined": "2026-01-12",
        },
    )
    return state


def _save_state(state: dict) -> None:
    SERVER_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2, ensure_ascii=False)
    tmp.replace(STATE_FILE)


def _metrics(state: dict) -> dict:
    files = state.get("files", [])
    actions = state.get("actions", [])
    repaired = [item for item in files if item.get("status") == "Repaired"]
    repair_queue = [
        item
        for item in files
        if item.get("status") in {"Corrupted", "Suspicious"}
    ]
    return {
        "totalUploaded": len(files),
        "totalScans": len([item for item in actions if item.get("action") == "Scan"]),
        "corrupted": len([item for item in files if item.get("status") == "Corrupted"]),
        "repaired": len(repaired),
        "failedRepair": len(
            [
                item
                for item in actions
                if item.get("action") == "Repair" and str(item.get("notes", "")).lower().startswith("failed")
            ]
        ),
        "needsRepair": len(repair_queue),
        "recentActions": len(actions),
        "totalUsers": 1,
    }


def _state_response() -> dict:
    state = _load_state()
    state["metrics"] = _metrics(state)
    return state


def _append_action(state: dict, *, file_name: str, action: str, notes: str = "") -> None:
    state.setdefault("actions", []).insert(
        0,
        {
            "id": uuid.uuid4().hex,
            "date": _date_label(),
            "file": file_name,
            "action": action,
            "user": state.get("currentUser", {}).get("name", "Demo Admin"),
            "notes": notes,
        },
    )


def _find_file(state: dict, file_id: str) -> dict:
    for item in state.get("files", []):
        if item.get("id") == file_id:
            return item
    raise FileNotFoundError("File not found.")


def _file_record_from_path(path: Path, *, status: str = "Pending", evidence: str = "Uploaded and waiting for scan.") -> dict:
    integrity = compute_sha256(path)
    return {
        "id": uuid.uuid4().hex,
        "name": path.name,
        "type": _file_type(path),
        "size": _format_size(int(integrity.get("size", path.stat().st_size))),
        "hash": _short_hash(str(integrity.get("sha256", ""))),
        "fullHash": str(integrity.get("sha256", "")),
        "status": status,
        "evidence": evidence,
        "date": _date_label(),
        "user": "Demo Admin",
        "path": str(path),
    }


def _matching_scan_record(scan_payload: dict, path: Path) -> dict | None:
    target = str(path.resolve()).casefold()
    for record in scan_payload.get("results", []) or []:
        record_path = str(record.get("path", ""))
        try:
            if str(Path(record_path).resolve()).casefold() == target:
                return record
        except Exception:
            if record_path.casefold() == str(path).casefold():
                return record
    results = scan_payload.get("results", []) or []
    return results[0] if results else None


def _scan_file(path: Path, *, profile: str = "quick") -> tuple[str, str, dict]:
    payload = scan_path(str(path), {}, profile_override=profile, source="web")
    record = _matching_scan_record(payload, path)
    return _status_from_scan_record(record), _evidence_text(record), payload


def _upsert_file(state: dict, record: dict) -> dict:
    files = state.setdefault("files", [])
    existing = next((item for item in files if item.get("path") == record.get("path")), None)
    if existing:
        existing.update(record)
        return existing
    files.insert(0, record)
    return record


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "CFDMTApi/1.0"

    def handle_one_request(self) -> None:
        try:
            super().handle_one_request()
        except Exception:
            _debug(traceback.format_exc())
            raise

    def log_message(self, format: str, *args) -> None:
        _debug(format % args)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/health":
                self._json({"ok": True, "toolRoot": str(TOOL_ROOT)})
                return
            if parsed.path == "/api/state":
                self._json(_state_response())
                return
            if parsed.path.startswith("/api/files/") and parsed.path.endswith("/download"):
                file_id = parsed.path.split("/")[3]
                self._download(file_id)
                return
            self._json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._error(exc)

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/upload":
                query = parse_qs(parsed.query)
                scan = str(query.get("scan", ["false"])[0]).lower() == "true"
                self._handle_upload(scan=scan)
                return
            if parsed.path == "/api/engine/scan":
                self._handle_engine_scan()
                return
            if parsed.path == "/api/engine/repair":
                self._handle_engine_repair()
                return
            if parsed.path == "/api/scan":
                self._handle_scan()
                return
            if parsed.path == "/api/repair":
                self._handle_repair()
                return
            self._json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._error(exc)

    def _json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8") or "{}")

    def _error(self, exc: Exception) -> None:
        _debug(traceback.format_exc())
        traceback.print_exc()
        status = HTTPStatus.NOT_FOUND if isinstance(exc, FileNotFoundError) else HTTPStatus.INTERNAL_SERVER_ERROR
        self._json({"error": str(exc) or exc.__class__.__name__}, status)

    def _handle_upload(self, *, scan: bool) -> None:
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            },
        )
        upload = form["file"] if "file" in form else None
        if upload is None or not getattr(upload, "filename", ""):
            self._json({"error": "No file was uploaded."}, HTTPStatus.BAD_REQUEST)
            return

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        target = UPLOAD_DIR / f"{uuid.uuid4().hex}_{_safe_name(upload.filename)}"
        with target.open("wb") as handle:
            shutil.copyfileobj(upload.file, handle)

        status = "Pending"
        evidence = "Uploaded and waiting for scan."
        scan_payload = None
        if scan:
            status, evidence, scan_payload = _scan_file(target)

        state = _load_state()
        record = _file_record_from_path(target, status=status, evidence=evidence)
        record["name"] = _safe_name(upload.filename)
        record["scanPayload"] = scan_payload
        record = _upsert_file(state, record)
        _append_action(state, file_name=record["name"], action="Upload", notes="Uploaded through the web UI.")
        if scan:
            _append_action(state, file_name=record["name"], action="Scan", notes=f"Result: {status}.")
        _save_state(state)
        self._json({"file": record, "state": _state_response()})

    def _handle_scan(self) -> None:
        request = self._read_json()
        profile = str(request.get("profile") or "quick")
        state = _load_state()

        if request.get("fileId"):
            record = _find_file(state, str(request["fileId"]))
            path = Path(str(record.get("path", "")))
        else:
            path = Path(str(request.get("path", ""))).expanduser()
            if not path.exists():
                raise FileNotFoundError(f"Path does not exist: {path}")
            record = _file_record_from_path(path)
            record = _upsert_file(state, record)

        if not path.exists():
            raise FileNotFoundError(f"File does not exist: {path}")

        status, evidence, scan_payload = _scan_file(path, profile=profile)
        record.update(_file_record_from_path(path, status=status, evidence=evidence))
        record["scanPayload"] = scan_payload
        _append_action(state, file_name=record["name"], action="Scan", notes=f"Result: {status}.")
        _save_state(state)
        self._json({"file": record, "state": _state_response()})

    def _handle_repair(self) -> None:
        request = self._read_json()
        state = _load_state()
        record = _find_file(state, str(request.get("fileId", "")))
        path = Path(str(record.get("path", "")))
        if not path.exists():
            raise FileNotFoundError(f"File does not exist: {path}")

        REPAIR_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        result = repair_single_file(str(path), backup_dir=str(REPAIR_BACKUP_DIR))
        details = getattr(result, "details", {}) or {}
        success = bool(getattr(result, "success", False))
        message = str(getattr(result, "message", "Repair completed." if success else "Repair failed."))
        integrity = compute_sha256(path)
        record.update(
            {
                "status": "Repaired" if success else record.get("status", "Corrupted"),
                "evidence": message,
                "hash": _short_hash(str(integrity.get("sha256", ""))),
                "fullHash": str(integrity.get("sha256", "")),
                "size": _format_size(int(integrity.get("size", path.stat().st_size))),
                "date": _date_label(),
                "repairDetails": details,
            }
        )
        _append_action(
            state,
            file_name=record["name"],
            action="Repair",
            notes=message if success else f"Failed: {message}",
        )
        _save_state(state)
        self._json({"file": record, "repair": {"success": success, "message": message, "details": details}, "state": _state_response()})

    def _handle_engine_scan(self) -> None:
        request = self._read_json()
        path = Path(str(request.get("path", ""))).expanduser()
        profile = str(request.get("profile") or "full")
        if profile not in {"quick", "full", "custom"}:
            profile = "full"
        if not path.is_file():
            raise FileNotFoundError(f"File does not exist: {path}")
        self._json(_engine_scan_result(path, profile=profile))

    def _handle_engine_repair(self) -> None:
        request = self._read_json()
        path = Path(str(request.get("path", ""))).expanduser()
        if not path.is_file():
            raise FileNotFoundError(f"File does not exist: {path}")

        REPAIR_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        result = repair_single_file(str(path), backup_dir=str(REPAIR_BACKUP_DIR))
        details = dict(getattr(result, "details", {}) or {})
        success = bool(getattr(result, "success", False))
        message = str(getattr(result, "message", "Repair completed." if success else "Repair failed."))
        repaired_path = Path(str(getattr(result, "repaired_path", str(path))))

        integrity = {}
        if repaired_path.is_file():
            integrity = compute_sha256(repaired_path)

        self._json(
            {
                "ok": True,
                "engine": "python",
                "success": success,
                "message": message,
                "repaired_path": str(repaired_path),
                "backup_path": getattr(result, "backup_path", None),
                "validation_passed": bool(details.get("validation_passed", success)),
                "details": details,
                "sha256": str(integrity.get("sha256", "")),
                "size_bytes": int(integrity.get("size", 0) or 0),
                "file_type": _file_type(repaired_path),
                "stored_name": repaired_path.name,
            }
        )

    def _download(self, file_id: str) -> None:
        state = _load_state()
        record = _find_file(state, file_id)
        path = Path(str(record.get("path", "")))
        if not path.exists():
            raise FileNotFoundError(f"File does not exist: {path}")
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        digest = hashlib.sha256(data).hexdigest()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("ETag", digest)
        self.send_header("Content-Disposition", f'attachment; filename="{record.get("name", path.name)}"')
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    REPAIR_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    print(f"CFDMT API bridge running at http://{HOST}:{PORT}")
    print(f"Using CFDMT tool root: {TOOL_ROOT}")
    server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping CFDMT API bridge.")


if __name__ == "__main__":
    main()
