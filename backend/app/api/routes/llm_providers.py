from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from uuid import UUID

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth

router = APIRouter()


class LLMProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str | None = None
    available_models: list[str] = []
    is_default: bool = False
    embedding_model: str | None = None


class LLMProviderUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    available_models: list[str] | None = None
    is_default: bool | None = None
    embedding_model: str | None = None


class LLMProviderResponse(BaseModel):
    id: str
    name: str
    base_url: str
    available_models: list[str]
    is_default: bool
    embedding_model: str | None = None


@router.get("", response_model=list[LLMProviderResponse])
async def list_providers(current_user: CurrentUser):
    """List user's LLM providers."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("llm_providers").select("id, name, base_url, available_models, is_default, embedding_model").eq(
        "user_id", current_user["id"]
    ).execute()
    return response.data


@router.post("", response_model=LLMProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(current_user: CurrentUser, request: LLMProviderCreate):
    """Create a new LLM provider configuration."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # If this is set as default, unset other defaults
    if request.is_default:
        supabase.table("llm_providers").update({"is_default": False}).eq("user_id", current_user["id"]).execute()

    data = {
        "user_id": current_user["id"],
        **request.model_dump(),
    }

    response = supabase.table("llm_providers").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create provider")
    return response.data[0]


@router.get("/{provider_id}", response_model=LLMProviderResponse)
async def get_provider(current_user: CurrentUser, provider_id: UUID):
    """Get a specific LLM provider."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("llm_providers").select("id, name, base_url, available_models, is_default, embedding_model").eq(
        "id", str(provider_id)
    ).eq("user_id", current_user["id"]).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return response.data


@router.patch("/{provider_id}", response_model=LLMProviderResponse)
async def update_provider(current_user: CurrentUser, provider_id: UUID, request: LLMProviderUpdate):
    """Update an LLM provider."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # If setting as default, unset others
    if update_data.get("is_default"):
        supabase.table("llm_providers").update({"is_default": False}).eq("user_id", current_user["id"]).execute()

    response = supabase.table("llm_providers").update(update_data).eq("id", str(provider_id)).eq(
        "user_id", current_user["id"]
    ).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return response.data[0]


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(current_user: CurrentUser, provider_id: UUID):
    """Delete an LLM provider."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    try:
        supabase.table("llm_providers").delete().eq("id", str(provider_id)).eq("user_id", current_user["id"]).execute()
    except Exception as e:
        error_msg = str(e)
        if "violates foreign key constraint" in error_msg or "23503" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete this provider — it is still referenced by discussion participants. "
                       "Delete those discussions first, or change their participants to use a different provider.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete provider: {error_msg}",
        )


@router.post("/{provider_id}/test")
async def test_provider(current_user: CurrentUser, provider_id: UUID, model_name: str | None = None):
    """Test connection to an LLM provider. Optionally specify a model_name, otherwise uses the first available model."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("llm_providers").select("base_url, api_key, available_models").eq("id", str(provider_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    provider = response.data

    if not provider.get("api_key"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LLM provider is missing an API key. Add one in Settings → LLM Providers.",
        )

    test_model = model_name or (provider["available_models"][0] if provider.get("available_models") else None)
    if not test_model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No models configured for this provider. Add at least one model.",
        )

    try:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            base_url=provider["base_url"],
            api_key=provider["api_key"],
            model=test_model,
            max_tokens=10,
        )
        result = llm.invoke("Say hello.")
        return {"status": "success", "message": f"Connection successful (model: {test_model})", "response": result.content[:100]}
    except Exception as e:
        return {"status": "error", "message": str(e)}
