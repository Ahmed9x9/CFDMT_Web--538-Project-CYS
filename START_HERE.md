# CFDMT Web - Quick Start

## Recommended: Docker

1. Install Docker Desktop.
2. Extract this folder.
3. Open PowerShell in this folder, the same folder that contains `docker-compose.yml`.
4. Run:

```powershell
docker compose down -v --remove-orphans
docker compose up --build --force-recreate
```

5. Open the website:

- Frontend: http://localhost:8080
- PHP API: http://localhost:8001
- Python engine health check: http://localhost:8000/api/health

## Included Accounts

- Admin: `decoy.admin@cfdmt.test` / `password`
- Demo users: `nora.decoy@cfdmt.test`, `omar.decoy@cfdmt.test`, `sara.decoy@cfdmt.test`, `khalid.decoy@cfdmt.test` / `password`


You can also register a fresh account from the website.

## What Is Included

- React frontend in `src/`
- PHP API in `api/`
- FastAPI bridge in `backend/`
- MySQL schema in `database/schema.sql`
- Sanitized demo database import in `database/full_data.sql`
- Simple public Python scan/repair engine in `cfdmt_tool/`

The sanitized demo database includes decoy file records for dashboard, scan result, repair, and history views. Physical uploaded files are runtime data and are intentionally excluded from GitHub, so use a fresh upload when testing download, scan, or repair actions.

The included engine is the submission-safe version. It calculates SHA-256 hashes, checks basic PNG, JPG, PDF, ZIP, RAR, and 7Z integrity, returns clean/suspicious/corrupted results, and supports simple repair attempts for files with missing PNG, JPG, or PDF end markers.

## Database Reset

Docker keeps the MySQL volume between runs. Use `down -v` when you want Docker to recreate the MySQL database and reload `database/schema.sql` plus `database/full_data.sql`:

```powershell
docker compose down -v --remove-orphans
docker compose up --build --force-recreate
```
