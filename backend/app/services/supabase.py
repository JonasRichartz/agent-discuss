from functools import lru_cache
from supabase import create_client, Client

from app.config import get_settings


@lru_cache
def get_supabase_client() -> Client:
    """Get Supabase client singleton with anon key."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


def get_supabase_client_with_auth(access_token: str) -> Client:
    """Get Supabase client with user's access token for RLS."""
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_key)
    # Set the user's token for RLS
    client.postgrest.auth(access_token)
    return client


@lru_cache
def get_supabase_service_client() -> Client:
    """
    Get Supabase client with service role key.

    This client bypasses RLS and should only be used in:
    - Background tasks (Celery)
    - System operations
    - When you manually filter by user_id
    """
    settings = get_settings()
    service_key = settings.supabase_service_key or settings.supabase_key
    return create_client(settings.supabase_url, service_key)
