# Agent Discuss

A multi-agent AI discussion platform where users can set up LLM participants to discuss topics autonomously.

## Features

- Create AI agents with custom system prompts and configurations
- Define conversation flows as graphs with event nodes (generate, evaluate, decide, summarize)
- Watch multiple agents discuss topics in real-time via WebSocket
- Upload documents for context (RAG integration with ChromaDB)
- Dark/light mode support
- Pause/resume discussion controls

## Tech Stack

- **Frontend**: React 19 + Vite + shadcn/ui + Tailwind CSS + React Flow
- **Backend**: FastAPI + LangGraph + Celery
- **Database**: Supabase (PostgreSQL + Auth)
- **Message Queue**: Redis
- **Vector Store**: ChromaDB
- **LLM**: vLLM (self-hosted, OpenAI-compatible)

## Quick Start (Local Development)

### Prerequisites

- Docker and Docker Compose v2+
- A Supabase account and project (free tier works)
- An LLM API endpoint (vLLM, OpenAI, or any OpenAI-compatible API)

### 1. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd agent-discuss

# Copy environment file
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your credentials:

```env
# Get these from Supabase Dashboard > Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Frontend needs these too
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set Up Supabase Database

1. Go to your Supabase project's SQL Editor
2. Copy and run the contents of `backend/scripts/init.sql`
3. This creates all required tables with Row Level Security policies

### 4. Start the Application

```bash
# Start all services with Docker Compose
docker compose up -d

# Watch the logs
docker compose logs -f
```

### 5. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Documentation | http://localhost:8000/docs |
| ChromaDB | http://localhost:8001 |

### 6. Configure an LLM Provider

1. Register/login at http://localhost:5173
2. Go to Settings > LLM Providers
3. Add your LLM connection:
   - **Name**: My vLLM / OpenAI / etc.
   - **Base URL**: Your API endpoint (e.g., `http://host.docker.internal:8080/v1` for local vLLM)
   - **API Key**: Your API key
   - **Model**: Model name to use

## Development Without Docker

### Backend (FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend (React)

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Redis (required for Celery)

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu
```

### Celery Worker

```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

## Project Structure

```
.
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── api/routes/       # REST endpoints
│   │   ├── agents/           # LangGraph orchestration
│   │   │   ├── state.py      # State definitions
│   │   │   ├── graph.py      # Graph builder
│   │   │   ├── nodes.py      # Node implementations
│   │   │   └── context.py    # Context management
│   │   ├── services/         # Business logic
│   │   │   ├── websocket_manager.py
│   │   │   ├── vectorstore.py
│   │   │   └── document_processor.py
│   │   └── tasks/            # Celery tasks
│   └── scripts/              # Database scripts
│
├── frontend/                 # React frontend
│   └── src/
│       ├── components/
│       │   ├── ui/           # shadcn components
│       │   ├── discussions/  # Discussion views
│       │   ├── messages/     # Message display
│       │   ├── graph-editor/ # React Flow editor
│       │   ├── agents/       # Agent management
│       │   └── documents/    # Document uploads
│       ├── hooks/            # React hooks
│       ├── stores/           # Zustand stores
│       └── pages/            # Route pages
│
├── docker-compose.yml        # Docker orchestration
└── .env.example              # Environment template
```

## Conversation Graph Nodes

The application supports these node types in conversation graphs:

| Node Type | Description |
|-----------|-------------|
| **Start** | Entry point of the conversation |
| **Generate** | Agents take turns generating content |
| **Evaluate** | Agents vote/score on criteria |
| **Decision** | Conditional branch based on evaluation |
| **Summary** | Compress context to manage token limits |
| **End** | Final summary and conclusion |

## Troubleshooting

### Connection refused errors

Make sure all services are running:
```bash
docker compose ps
```

### WebSocket not connecting

Check that:
1. Backend is running on port 8000
2. `VITE_WS_URL` is set correctly in `.env`
3. No firewall blocking WebSocket connections

### LLM provider test fails

1. Verify the base URL is accessible from Docker (use `host.docker.internal` for local services)
2. Check API key is correct
3. Ensure model name matches exactly

### Documents not processing

1. Check Celery worker logs: `docker compose logs celery-worker`
2. Verify ChromaDB is running: `docker compose ps chromadb`
3. Check document status in the UI (should show "Processing" then "Ready")

### Reset everything

```bash
# Stop and remove all containers and volumes
docker compose down -v

# Rebuild from scratch
docker compose up -d --build
```

## API Documentation

Interactive API documentation is available at http://localhost:8000/docs when the backend is running.

Key endpoints:
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/agents` - List agents
- `GET /api/v1/discussions` - List discussions
- `POST /api/v1/discussions/{id}/start` - Start a discussion
- `WS /api/v1/ws/discussions/{id}` - WebSocket for real-time updates

## License

MIT
