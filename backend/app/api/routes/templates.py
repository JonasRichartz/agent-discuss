from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from uuid import UUID

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth

router = APIRouter()


class GraphDefinition(BaseModel):
    nodes: list[dict]
    edges: list[dict]


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    graph_definition: GraphDefinition


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    graph_definition: GraphDefinition | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    graph_definition: dict
    is_system: bool


@router.get("", response_model=list[TemplateResponse])
async def list_templates(current_user: CurrentUser):
    """List user's templates and system templates."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Get user templates and system templates
    response = supabase.table("graph_templates").select("id, name, description, graph_definition, is_system, user_id").or_(
        f"user_id.eq.{current_user['id']},is_system.eq.true"
    ).execute()

    return response.data


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(current_user: CurrentUser, request: TemplateCreate):
    """Create a new graph template."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    data = {
        "user_id": current_user["id"],
        "name": request.name,
        "description": request.description,
        "graph_definition": request.graph_definition.model_dump(),
        "is_system": False,
    }

    response = supabase.table("graph_templates").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create template")
    return response.data[0]


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(current_user: CurrentUser, template_id: UUID):
    """Get a specific template."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("graph_templates").select("id, name, description, graph_definition, is_system, user_id").eq("id", str(template_id)).or_(
        f"user_id.eq.{current_user['id']},is_system.eq.true"
    ).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return response.data


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(current_user: CurrentUser, template_id: UUID, request: TemplateUpdate):
    """Update a template (only user-owned templates)."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description
    if request.graph_definition is not None:
        update_data["graph_definition"] = request.graph_definition.model_dump()

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    # Only update user-owned templates
    response = supabase.table("graph_templates").update(update_data).eq("id", str(template_id)).eq(
        "user_id", current_user["id"]
    ).eq("is_system", False).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found or not editable")
    return response.data[0]


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(current_user: CurrentUser, template_id: UUID):
    """Delete a template (only user-owned templates)."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    supabase.table("graph_templates").delete().eq("id", str(template_id)).eq("user_id", current_user["id"]).eq(
        "is_system", False
    ).execute()


@router.post("/{template_id}/duplicate", response_model=TemplateResponse)
async def duplicate_template(current_user: CurrentUser, template_id: UUID):
    """Duplicate a template."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Get original template
    original = supabase.table("graph_templates").select("name, description, graph_definition").eq("id", str(template_id)).or_(
        f"user_id.eq.{current_user['id']},is_system.eq.true"
    ).maybe_single().execute()

    if not original or not original.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Create duplicate
    data = {
        "user_id": current_user["id"],
        "name": f"{original.data['name']} (Copy)",
        "description": original.data["description"],
        "graph_definition": original.data["graph_definition"],
        "is_system": False,
    }

    response = supabase.table("graph_templates").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to duplicate template")
    return response.data[0]
