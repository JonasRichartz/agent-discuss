# Contributing to Agent Discuss

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker and Docker Compose

## Local Development Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Frontend

```bash
cd frontend
npm install
```

### Full Setup (via Make)

```bash
make setup
```

## Running Services

### All services via Docker

```bash
docker compose up --build
# or in detached mode
make up
```

### Individual services for development

Backend:
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm run dev
```

## Code Style

### Python (backend)

We use [Ruff](https://docs.astral.sh/ruff/) for linting and formatting. Configuration lives in `backend/pyproject.toml`.

```bash
make lint    # check for lint errors
make format  # auto-format code
```

Pre-commit hooks are configured to run Ruff automatically on staged files. Install them with:

```bash
pip install pre-commit
pre-commit install
```

### Frontend

TypeScript strict mode is enforced. Run type checking with:

```bash
make typecheck
```

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes, ensuring `make lint` and `make typecheck` pass.
3. Write or update tests as needed.
4. Open a PR against `main` with a clear description of the changes.
5. CI must pass before merging.
