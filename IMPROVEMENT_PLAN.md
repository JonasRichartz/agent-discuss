# Agent Discuss - Comprehensive Improvement Plan

> Generated from multi-model analysis (Claude Opus, Gemini Pro, Claude Sonnet, DeepSeek R1) + codebase exploration.
> GitHub Issues: https://github.com/JonasRichartz/agent-discuss/issues

## Architecture Diagrams

- **Current Architecture**: `current-architecture.png`
- **Improvement Roadmap**: `improvement-plan-overview.png`

---

## Phase 1: Architecture Modernization (HIGH PRIORITY)

### 1.1 Migrate to Official LangGraph Checkpointer
**Current**: Custom `PostgresCheckpointer` in `backend/app/agents/checkpointer.py` storing in `discussions.execution_state`
**Target**: Official `AsyncPostgresSaver` from `langgraph-checkpoint-postgres`

**Why**: The official package provides automatic schema migrations, version compatibility with LangGraph updates, and community security patches. The custom implementation duplicates maintained functionality.

**Hybrid approach** (recommended by DeepSeek R1): Create an adapter layer that wraps the official package while storing in your existing `execution_state` column. This preserves your data model while gaining maintenance benefits.

**Files to modify**:
- `backend/app/agents/checkpointer.py` - Replace with adapter
- `backend/app/agents/graph.py` - Compile with official checkpointer
- `backend/app/tasks/discussion.py` - Use `thread_id` config pattern
- `backend/requirements.txt` - Add `langgraph-checkpoint-postgres`

### 1.2 Refactor State Management
**Current**: `DiscussionState` in `state.py` is a basic TypedDict
**Target**: Properly annotated TypedDict with reducers

```python
from typing import TypedDict, Annotated
import operator

class DiscussionState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]  # Append behavior
    discussion_summary: str
    next_speaker: str
    participant_llm_configs: dict[str, dict]
```

### 1.3 Node Resilience
- Add `RetryPolicy(max_attempts=3)` to LLM-calling nodes (generate, evaluate)
- Add circuit breaker pattern in `context.py` for LLM provider failures
- Prevent one slow provider from blocking all discussions (bulkhead pattern)

### 1.4 Streaming with astream_events
**Current**: WebSocket sends complete messages after generation
**Target**: Token-level streaming via `astream_events`

This is the single highest-impact UX improvement. Instead of waiting for a full response, users see tokens appear in real-time per agent.

**Backend** (`routes/websocket.py`):
```python
async for event in graph.astream_events(input, config, version="v2"):
    await websocket.send_json({
        "event": event["event"],  # on_chat_model_stream, on_chain_start, etc.
        "name": event["name"],
        "data": event["data"]
    })
```

### 1.5 Critical Bug: Checkpoint Corruption
**Risk**: Concurrent writes to `discussions.execution_state` (identified by DeepSeek R1)
**Fix**: Add row-level locking with `SELECT FOR UPDATE` in checkpointer

---

## Phase 2: Frontend Completion (HIGH PRIORITY)

### 2.1 Participant Management (P1 - Critical)
Complete the participant UI that's currently API-only:
- `ParticipantManager.tsx` - List/add/remove participants
- `ParticipantDialog.tsx` - Create/edit participant form
- React hooks: `useDiscussionParticipants()`, `useCreateParticipant()`, etc.
- Add `DiscussionParticipant` TypeScript interface

### 2.2 State Management Refactoring
**Anti-pattern identified** (Claude Sonnet): `graphStore` likely stores server state that belongs in TanStack Query.

**Rule of thumb**:
- **Zustand**: UI-only state (selected nodes, sidebar open, theme)
- **TanStack Query**: Server state (graph data, participants, messages)

```typescript
// graphStore should only have:
interface GraphStore {
  selectedNodes: string[];
  selectedEdges: string[];
  viewportState: Viewport;
  // NOT: nodes, edges (those are server state)
}
```

### 2.3 Feature-Based Architecture
**Current**: Component-type based (`components/discussions/`, `components/auth/`)
**Target**: Feature-based modules

```
src/features/
  discussions/
    components/
    hooks/
    types/
    api/
  graph-editor/
    components/
    hooks/
    utils/
  participants/
    components/
    hooks/
```

### 2.4 Graph Editor Improvements
- Add `<MiniMap>` with node-type coloring
- Add `<Controls>` overlay
- Implement edge validation system (prevent invalid connections)
- Custom `ConnectionLine` component
- Keyboard shortcuts (Ctrl+A select all, Delete)

### 2.5 Real-Time Streaming UX
- Per-agent typing indicators ("Agent X is thinking...")
- Token-by-token message rendering with cursor animation
- Agent status bar showing all participant states
- Message queuing with visual progress

### 2.6 TypeScript Hardening
- Enable strict mode in `tsconfig.json`
- Add branded types for IDs (`DiscussionId`, `AgentId`, `MessageId`)
- Discriminated unions for node types
- Runtime validation with Zod for API responses

---

## Phase 3: Testing Infrastructure (HIGH PRIORITY)

### 3.1 Backend Unit Tests (P1)
**Target files**: `tests/unit/test_graph_nodes.py`
- Mock LLM clients with `unittest.mock.patch`
- Test each node function: generate, evaluate, decide, summarize
- Test state transitions and graph flow
- Test `verify_discussion_ownership()` helper

### 3.2 API Integration Tests (P2)
**Target files**: `tests/integration/test_discussion_api.py`
- Use `httpx.AsyncClient` with FastAPI TestClient
- Test auth middleware (valid/expired/missing JWT)
- Test participant CRUD with ownership validation
- Mock Celery dispatch to verify arguments

### 3.3 Frontend Tests (P2-P3)
- `vitest` + `@testing-library/react` for component tests
- MSW (Mock Service Worker) for API mocking
- Test forms, graph editor, settings pages

### 3.4 E2E Tests (P3)
- Playwright for critical user journeys
- Login -> Create discussion -> Add participants -> Start -> See messages

---

## Phase 4: Performance & Scalability (MEDIUM PRIORITY)

### 4.1 WebSocket Scaling (Critical for multi-instance)
**Current risk**: `websocket_manager.py` uses in-memory connection tracking - breaks across instances.

**Solution**: Redis PubSub for cross-instance broadcasting:
```python
class WebSocketManager:
    async def broadcast(self, discussion_id, message):
        await redis.publish(f"discussion:{discussion_id}", message)
```

### 4.2 Database Connection Pooling
- Use PGBouncer (Supabase offers this) or asyncpg pool
- Critical for preventing connection exhaustion under load

### 4.3 Caching Strategy
- Redis cache for agent/template configs (rarely change)
- Cache LLM provider settings with TTL invalidation
- Cache-aside pattern for discussion metadata

### 4.4 Celery Improvements
- Add Flower monitoring service to docker-compose
- Priority queues: discussion execution vs document processing
- **Critical**: Use PostgreSQL (not Redis) as result backend to prevent task loss on broker restart
- Task result TTL cleanup

---

## Phase 5: Security Hardening (HIGH PRIORITY)

### 5.1 Authentication Audit
- Verify `get_current_user` dependency on ALL endpoints
- Verify Supabase RLS policies cover ALL tables
- Ensure ownership checks in all CRUD operations

### 5.2 Input Validation
- Validate all path/query parameters with Pydantic
- Sanitize system prompts against injection
- **Validate LLM outputs** before processing (Pydantic model validation)
- Add input length limits

### 5.3 Rate Limiting
- `slowapi` on expensive endpoints (POST /discussions: 5/min, start: 2/min)
- Per-user limits based on JWT claims

### 5.4 Infrastructure Security
- CORS configuration review
- Security headers (HSTS, X-Content-Type-Options)
- Docker: non-root user, read-only filesystem
- No secrets in git history

---

## Phase 6: Developer Experience (MEDIUM PRIORITY)

### 6.1 Pre-commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks: [ruff, ruff-format]
  - repo: https://github.com/pre-commit/mirrors-mypy
    hooks: [mypy --strict]
  - repo: https://github.com/prettier/prettier
    hooks: [prettier]
```

### 6.2 GitHub Actions CI/CD
- Python: ruff lint + mypy type check + pytest
- Frontend: build verification + vitest
- Docker build test
- Run on push and PR

### 6.3 Documentation Cleanup
- Consolidate 6 root-level markdown files into organized docs
- Complete `.env.example` with all variables
- Create `CONTRIBUTING.md`

---

## Phase 7: Differentiating Features (FUTURE)

### 7.1 Human-in-the-Loop (Highest Value)
- `workflow.interrupt_before("evaluate_step")` in LangGraph
- Frontend: Show state + input for user feedback
- `graph.update_state()` to inject human messages
- Resume execution after human input

### 7.2 Token & Cost Tracking
- `token_usage` table in Supabase
- `AsyncCallbackHandler` capturing `on_llm_end` token counts
- Per-discussion, per-agent, per-turn tracking
- Frontend cost dashboard

### 7.3 Discussion Export
- Markdown export with agent metadata
- PDF export with formatting

### 7.4 Dynamic Tool Use
- LangGraph `ToolNode` for agent tool calling
- Web search, code execution sandbox
- Custom tool definitions per agent

---

## Execution Priority Matrix

| Phase | Priority | Effort | Dependencies | Impact |
|-------|----------|--------|--------------|--------|
| 1. Architecture | HIGH | Large | None | Foundation for everything |
| 2. Frontend | HIGH | Large | Partially blocked by Phase 1 streaming | User-facing completeness |
| 3. Testing | HIGH | Large | None (can start immediately) | Quality assurance |
| 5. Security | HIGH | Medium | None | Risk mitigation |
| 4. Performance | MEDIUM | Medium | Phase 1 streaming | Scale readiness |
| 6. DX | MEDIUM | Medium | None | Development velocity |
| 7. Features | LOW | X-Large | Phases 1-2 | Market differentiation |

### Recommended Execution Order
1. **Start immediately in parallel**: Phase 3 (Testing) + Phase 5 (Security) + Phase 6 (DX)
2. **Next**: Phase 1 (Architecture) - unlocks streaming and advanced features
3. **Then**: Phase 2 (Frontend) - complete the user experience
4. **Then**: Phase 4 (Performance) - prepare for production
5. **Finally**: Phase 7 (Features) - differentiate

---

## Critical Bugs to Fix First

1. **Checkpoint corruption risk** - No row-level locking on concurrent writes
2. **WebSocket single-instance limitation** - In-memory connection tracking
3. **Celery task loss on Redis restart** - No persistent result backend
4. **LLM provider cascade failure** - One slow provider blocks others
5. **Vector store drift** - Document updates not reflected in active discussions
