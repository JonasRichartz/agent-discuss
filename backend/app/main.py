from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.router import api_router

settings = get_settings()

app = FastAPI(
    title="Agent Discuss API",
    description="Multi-agent discussion platform API",
    version="0.1.0",
)

# CORS middleware
cors_origins = settings.cors_origins.split(",") if settings.cors_origins else [
    "http://localhost:5173",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
