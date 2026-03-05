.PHONY: dev up down logs backend-logs frontend-logs db-logs redis-logs install-frontend install-backend lint format typecheck test setup

# Start all services
dev:
	docker-compose up --build

# Start in detached mode
up:
	docker-compose up -d --build

# Stop all services
down:
	docker-compose down

# View all logs
logs:
	docker-compose logs -f

# View specific service logs
backend-logs:
	docker-compose logs -f backend

frontend-logs:
	docker-compose logs -f frontend

db-logs:
	docker-compose logs -f db

redis-logs:
	docker-compose logs -f redis

celery-logs:
	docker-compose logs -f celery-worker

# Install dependencies locally (for IDE support)
install-frontend:
	cd frontend && npm install

install-backend:
	cd backend && pip install -r requirements.txt

# Database shell
db-shell:
	docker-compose exec db psql -U postgres -d agentdiscuss

# Redis CLI
redis-cli:
	docker-compose exec redis redis-cli

# Backend shell
backend-shell:
	docker-compose exec backend bash

# Run backend tests
test-backend:
	docker-compose exec backend pytest

# Lint backend with ruff
lint:
	cd backend && ruff check .

# Format backend with ruff
format:
	cd backend && ruff format .

# Type check frontend
typecheck:
	cd frontend && npx tsc --noEmit

# Run backend tests
test:
	cd backend && pytest

# Full local setup
setup:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && pip install -r requirements-dev.txt
	cd frontend && npm install

# Clean up volumes
clean:
	docker-compose down -v
