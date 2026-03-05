"""
Web search service using Tavily API.

Provides search results formatted for injection into LLM context.
Gracefully returns empty string if Tavily is not configured.
"""

import logging
from app.config import get_settings

logger = logging.getLogger(__name__)


async def tavily_search(query: str, max_results: int = 3, api_key: str | None = None) -> str:
    """
    Search the web using Tavily and return formatted results.

    Uses the provided api_key if given, otherwise falls back to server env var.
    Returns empty string if no key is available.
    """
    settings = get_settings()
    effective_key = api_key or settings.tavily_api_key
    if not effective_key:
        return ""

    try:
        from langchain_community.tools.tavily_search import TavilySearchResults

        tool = TavilySearchResults(
            max_results=max_results,
            tavily_api_key=effective_key,
        )
        results = await tool.ainvoke({"query": query})

        if not results:
            return ""

        formatted = []
        for r in results:
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            content = r.get("content", "")
            formatted.append(f"**{title}**\n{content}\nSource: {url}")

        return "\n\n".join(formatted)

    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        return ""
