import datetime
import hashlib
import pathlib


def _utc_timestamp() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def compute_sha256(path: str | pathlib.Path, *, chunk_size: int = 1024 * 1024) -> dict:
    file_path = pathlib.Path(path)
    digest = hashlib.sha256()
    size = 0

    with open(file_path, "rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
            size += len(chunk)

    return {
        "sha256": digest.hexdigest(),
        "size": size,
        "computed_at": _utc_timestamp(),
    }


def compute_sha256_bytes(payload: bytes) -> dict:
    return {
        "sha256": hashlib.sha256(payload).hexdigest(),
        "size": len(payload),
        "computed_at": _utc_timestamp(),
    }


def compare_hashes(expected: str | None, actual: str | None) -> bool:
    expected_text = str(expected or "").strip().lower()
    actual_text = str(actual or "").strip().lower()
    return bool(expected_text and actual_text and expected_text == actual_text)
