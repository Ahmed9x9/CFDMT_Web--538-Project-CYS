from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.scan_service import JPEG_END, PNG_IEND_CHUNK, scan_file


@dataclass
class RepairResult:
    success: bool
    message: str
    repaired_path: str
    backup_path: str | None
    details: dict[str, Any]


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def _safe_name(path: Path) -> str:
    return "".join(ch if ch not in '<>:"/\\|?*' else "_" for ch in path.name)


def _backup_file(path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"{_timestamp()}_{_safe_name(path)}.bak"
    shutil.copy2(path, backup_path)
    return backup_path


def _repaired_dir_for(path: Path) -> Path:
    if path.parent.name == "uploads":
        return path.parent.parent / "repaired"
    return path.parent / "repaired"


def _write_repaired_copy(path: Path, payload: bytes) -> Path:
    repaired_dir = _repaired_dir_for(path)
    repaired_dir.mkdir(parents=True, exist_ok=True)
    repaired_path = repaired_dir / f"repaired_{_timestamp()}_{_safe_name(path)}"
    repaired_path.write_bytes(payload)
    return repaired_path


def _try_basic_repair(path: Path, check_code: str) -> tuple[bool, str, Path]:
    payload = path.read_bytes()
    extension = path.suffix.lower().lstrip(".")

    if extension == "png" and check_code == "PNG_IEND_MISSING":
        return True, "PNG repair added a missing IEND end marker.", _write_repaired_copy(path, payload + PNG_IEND_CHUNK)

    if extension in {"jpg", "jpeg"} and check_code == "JPEG_EOI_MISSING":
        return True, "JPEG repair added a missing end-of-image marker.", _write_repaired_copy(path, payload.rstrip() + JPEG_END)

    if extension == "pdf" and check_code == "PDF_EOF_MISSING":
        return True, "PDF repair added a missing EOF marker.", _write_repaired_copy(path, payload.rstrip() + b"\n%%EOF\n")

    return False, "This public demo engine could not safely repair the detected issue.", path


def repair_single_file(file_path, *, backup_dir, cancel_event=None) -> RepairResult:
    path = Path(file_path).expanduser().resolve()
    backup_root = Path(backup_dir).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"File does not exist: {path}")

    before = scan_file(path, "full")
    check_code = str(before.get("check_code") or "")

    if before.get("status") == "clean":
        return RepairResult(
            success=False,
            message="No repair was needed because the file passed the basic integrity checks.",
            repaired_path=str(path),
            backup_path=None,
            details={
                "repair_type": "none",
                "before": before,
                "validation_passed": True,
            },
        )

    if cancel_event is not None and cancel_event.is_set():
        return RepairResult(
            success=False,
            message="Repair was cancelled.",
            repaired_path=str(path),
            backup_path=None,
            details={
                "repair_type": "cancelled",
                "before": before,
                "validation_passed": False,
            },
        )

    backup_path = _backup_file(path, backup_root)
    repaired, message, repaired_path = _try_basic_repair(path, check_code)
    after = scan_file(repaired_path, "full") if repaired_path.is_file() else before
    validation_passed = after.get("status") == "clean"
    success = repaired and validation_passed

    if not success and repaired:
        message = "A repaired copy was created, but validation did not pass."

    return RepairResult(
        success=success,
        message=message,
        repaired_path=str(repaired_path if success else path),
        backup_path=str(backup_path),
        details={
            "repair_type": "basic-marker-repair" if repaired else "not_repairable",
            "before": before,
            "after": after,
            "validation_passed": validation_passed,
        },
    )
