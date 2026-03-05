.PHONY: dev up down logs backend-logs frontend-logs db-logs redis-logs celery-logs \
       install-frontend install-backend lint format typecheck \
       test test-backend test-frontend setup clean \
       db-shell redis-cli backend-shell

# ── Development ──────────────────────────────────────────────

# Start all services (attached)
dev:
	docker compose up --build

# Start in detached mode
up:
	docker compose up -d --build

# Stop all services
down:
	docker compose down

# Clean up volumes
clean:
	docker compose down -v

# ── Logs ─────────────────────────────────────────────────────

logs:
	docker compose logs -f

backend-logs:
	docker compose logs -f backend

frontend-logs:
	docker compose logs -f frontend

db-logs:
	docker compose logs -f db

redis-logs:
	docker compose logs -f redis

celery-logs:
	docker compose logs -f celery-worker

# ── Shells ───────────────────────────────────────────────────

db-shell:
	docker compose exec db psql -U postgres -d agentdiscuss

redis-cli:
	docker compose exec redis redis-cli

backend-shell:
	docker compose exec backend bash

# ── Setup ────────────────────────────────────────────────────

# Full local setup (uses uv for Python, npm for frontend)
setup:
	cd backend && uv venv .venv && uv pip install -r requirements.txt -r requirements-dev.txt
	cd frontend && npm install

install-backend:
	cd backend && uv pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

# ── Testing ──────────────────────────────────────────────────

# Run all tests (backend + frontend)
test: test-backend test-frontend

# Run backend tests with pytest
test-backend:
	cd backend && SUPABASE_URL=https://test.supabase.co SUPABASE_KEY=test SUPABASE_JWT_SECRET=test venv/bin/python -m pytest

# Run frontend tests with vitest
test-frontend:
	cd frontend && npx vitest run

# ── Linting & Formatting ────────────────────────────────────

# Lint backend (ruff) + frontend (tsc type check)
lint:
	cd backend && venv/bin/python -m ruff check .
	cd frontend && npx tsc --noEmit

# Format backend code with ruff
format:
	cd backend && venv/bin/python -m ruff format .

# Type check frontend only
typecheck:
	cd frontend && npx tsc --noEmit
