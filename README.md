# CFDMT Web

Corrupted File Detection and Management Tool Web is a Docker-ready website for uploading files, scanning them for basic integrity problems, repairing supported corruption cases, and reviewing scan/repair history.

## Quick Start

Use Docker from the project root, the same folder that contains `docker-compose.yml`:

```bash
docker compose down -v --remove-orphans
docker compose up --build --force-recreate
```

Open the website at http://localhost:8080.

## Stack

- React + Vite frontend
- PHP API
- MySQL database
- FastAPI bridge for scan/repair calls
- Public Python scan/repair engine
- Docker Compose for the full local stack

## Project Structure

```text
api/                  PHP API endpoints, authentication, policies, and database access
backend/              FastAPI bridge used by the PHP API for scan and repair actions
cfdmt_tool/           Public Python scan/repair engine for PNG, JPG, PDF, ZIP, RAR, and 7Z
database/             MySQL schema and sanitized demo data
docker/               Dockerfiles and nginx configuration
docs/                 Supporting design and implementation notes
public/               Static frontend assets
src/                  React frontend source code
START_HERE.md         Main setup instructions for running the website
README.DOCKER.md      Short Docker-only quick start
```

Runtime folders such as uploads, repaired files, repair backups, caches, `node_modules/`, and `dist/` are intentionally excluded from the project package.

## Supported File Types

The website supports these file types for upload and scan/repair behavior:

```text
PNG, JPG/JPEG, PDF, ZIP, RAR, 7Z
```

## Local Development Without Docker

Install frontend dependencies:

```bash
npm install
```

Install Python bridge dependencies:

```powershell
py -3.10 -m pip install -r backend/requirements.txt
```

Start the services from the project root:

```powershell
npm run python-api
npm run api
npm run dev
```

The normal request flow is:

```text
React frontend -> PHP API -> FastAPI bridge -> Python scan/repair engine -> MySQL
```

## Database

Docker imports the database automatically using:

- `database/schema.sql`
- `database/full_data.sql`

The demo data is sanitized and uses decoy accounts only.
