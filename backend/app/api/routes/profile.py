from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth

router = APIRouter()


class ProfileResponse(BaseModel):
    id: str
    display_name: str | None
    avatar_url: str | None
    preferences: dict


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None


class PreferencesUpdateRequest(BaseModel):
    theme: str | None = None  # "light" or "dark"
    tavily_api_key: str | None = None


@router.get("", response_model=ProfileResponse)
async def get_profile(current_user: CurrentUser):
    """
    Get current user's profile.
    """
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    response = supabase.table("profiles").select("id, display_name, avatar_url, preferences").eq("id", current_user["id"]).maybe_single().execute()

    if not response or not response.data:
        # Create profile if it doesn't exist
        new_profile = {
            "id": current_user["id"],
            "display_name": (current_user.get("email") or "User").split("@")[0],
            "preferences": {"theme": "dark"},
        }
        try:
            supabase.table("profiles").insert(new_profile).execute()
        except Exception:
            # Profile may already exist but RLS blocks SELECT — return defaults
            pass
        return ProfileResponse(**new_profile, avatar_url=None)

    return ProfileResponse(**response.data)


@router.patch("", response_model=ProfileResponse)
async def update_profile(current_user: CurrentUser, request: ProfileUpdateRequest):
    """
    Update current user's profile.
    """
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    response = supabase.table("profiles").update(update_data).eq("id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    return ProfileResponse(**response.data[0])


@router.patch("/preferences", response_model=ProfileResponse)
async def update_preferences(current_user: CurrentUser, request: PreferencesUpdateRequest):
    """
    Update user preferences (theme, etc.).
    """
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Get current preferences
    current = supabase.table("profiles").select("preferences").eq("id", current_user["id"]).maybe_single().execute()

    current_prefs = current.data.get("preferences", {}) if current and current.data else {}

    # Merge new preferences
    new_prefs = {**current_prefs, **request.model_dump(exclude_unset=True)}

    response = supabase.table("profiles").update({"preferences": new_prefs}).eq("id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found. Please reload the page and try again.",
        )

    return ProfileResponse(**response.data[0])
