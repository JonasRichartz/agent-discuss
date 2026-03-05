from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict
from uuid import UUID

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth

router = APIRouter()


class AgentCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str
    description: str | None = None
    system_prompt: str
    llm_provider_id: str | None = None
    model_name: str | None = None
    temperature: float = 0.7
    max_tokens: int = 1024
    avatar_color: str = "#6366f1"
    avatar_emoji: str = "🤖"


class AgentUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    llm_provider_id: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    avatar_color: str | None = None
    avatar_emoji: str | None = None


class AgentResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    name: str
    description: str | None
    system_prompt: str
    llm_provider_id: str | None
    model_name: str | None
    temperature: float
    max_tokens: int
    avatar_color: str
    avatar_emoji: str


@router.get("", response_model=list[AgentResponse])
async def list_agents(current_user: CurrentUser):
    """List user's agents."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("agents").select("id, name, description, system_prompt, llm_provider_id, model_name, temperature, max_tokens, avatar_color, avatar_emoji").eq("user_id", current_user["id"]).execute()
    return response.data


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(current_user: CurrentUser, request: AgentCreate):
    """Create a new agent."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    data = {
        "user_id": current_user["id"],
        **request.model_dump(),
    }

    response = supabase.table("agents").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create agent")
    return response.data[0]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(current_user: CurrentUser, agent_id: UUID):
    """Get a specific agent."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("agents").select("id, name, description, system_prompt, llm_provider_id, model_name, temperature, max_tokens, avatar_color, avatar_emoji").eq("id", str(agent_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return response.data


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(current_user: CurrentUser, agent_id: UUID, request: AgentUpdate):
    """Update an agent."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    response = supabase.table("agents").update(update_data).eq("id", str(agent_id)).eq(
        "user_id", current_user["id"]
    ).execute()

    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return response.data[0]


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(current_user: CurrentUser, agent_id: UUID):
    """Delete an agent."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    supabase.table("agents").delete().eq("id", str(agent_id)).eq("user_id", current_user["id"]).execute()


@router.post("/{agent_id}/test")
async def test_agent(current_user: CurrentUser, agent_id: UUID, prompt: str = "Hello, introduce yourself."):
    """Test an agent with a sample prompt."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Get agent with provider info
    agent_response = supabase.table("agents").select("*, llm_providers(*)").eq("id", str(agent_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not agent_response or not agent_response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent = agent_response.data
    provider = agent.get("llm_providers")

    if not provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent has no LLM provider configured")

    if not provider.get("api_key"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LLM provider is missing an API key. Add one in Settings → LLM Providers.",
        )

    if not agent.get("model_name"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent has no model selected. Edit the agent and choose a model.",
        )

    try:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            base_url=provider["base_url"],
            api_key=provider["api_key"],
            model=agent["model_name"],
            temperature=agent["temperature"],
            max_tokens=agent["max_tokens"],
        )

        messages = [
            {"role": "system", "content": agent["system_prompt"]},
            {"role": "user", "content": prompt},
        ]

        result = llm.invoke(messages)
        return {"status": "success", "response": result.content}
    except Exception as e:
        return {"status": "error", "message": str(e)}
