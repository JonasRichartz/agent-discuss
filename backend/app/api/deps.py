from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import get_settings
from app.services.supabase import get_supabase_client

settings = get_settings()
security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict:
    """
    Validate JWT token and return current user.
    """
    token = credentials.credentials

    try:
        # Use Supabase client to verify the token (handles both HS256 and ES256)
        supabase = get_supabase_client()

        # Get user from Supabase using the token
        user_response = supabase.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: user not found",
            )

        user = user_response.user
        return {
            "id": user.id,
            "email": user.email,
            "role": user.role if hasattr(user, 'role') else "authenticated",
            "access_token": token,  # Include token for RLS
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
