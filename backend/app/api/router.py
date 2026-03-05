from fastapi import APIRouter

from app.api.routes import auth, profile, llm_providers, agents, templates, discussions, participants, documents, websocket

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(llm_providers.router, prefix="/llm-providers", tags=["llm-providers"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(discussions.router, prefix="/discussions", tags=["discussions"])
api_router.include_router(participants.router, prefix="/discussions", tags=["participants"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
