# CFDMT Public Web Engine

This folder contains the simplified Python engine used by the website submission.

It provides:

- SHA-256 calculation through `app/core/integrity.py`
- Basic integrity checks for PNG, JPG/JPEG, PDF, ZIP, RAR, and 7Z files
- Clean, suspicious, and corrupted scan results
- Simple marker-based repair attempts for PNG, JPG/JPEG, and PDF files

The website writes scan and repair records to MySQL through the PHP API. This engine only performs the scan/repair work and returns structured results to the FastAPI bridge.
