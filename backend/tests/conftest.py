"""
Shared pytest fixtures for the backend test suite.

Provides:
- Mock authenticated user
- Mock Supabase client
- HTTPX AsyncClient wired to the FastAPI app with auth dependency overridden
"""

import pytest
from unittest.mock import MagicMock
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.api.deps import get_current_user


# ---------------------------------------------------------------------------
# Mock user
# ---------------------------------------------------------------------------

MOCK_USER = {
    "id": "test-user-id-0000",
    "email": "test@example.com",
    "role": "authenticated",
    "access_token": "mock-access-token",
}


@pytest.fixture()
def mock_user() -> dict:
    """Return a mock authenticated user dict matching the shape from deps.py."""
    return MOCK_USER.copy()


# ---------------------------------------------------------------------------
# Override FastAPI auth dependency
# ---------------------------------------------------------------------------

async def _override_get_current_user() -> dict:
    return MOCK_USER.copy()


app.dependency_overrides[get_current_user] = _override_get_current_user


# ---------------------------------------------------------------------------
# Mock Supabase client
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_supabase():
    """
    Return a MagicMock that mimics the Supabase client.

    Usage example in tests:
        mock_supabase.table("discussions").select(...).eq(...).execute.return_value = ...
    """
    client = MagicMock()
    return client


# ---------------------------------------------------------------------------
# HTTPX AsyncClient
# ---------------------------------------------------------------------------

@pytest.fixture()
async def client():
    """
    Async HTTPX client targeting the FastAPI app.

    The auth dependency is already overridden at module level, so every
    request is treated as authenticated.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
