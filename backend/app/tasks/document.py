"""
Celery tasks for document processing.

Handles background processing of uploaded documents:
- Text extraction
- Chunking
- Embedding generation
- Vector storage
"""

import asyncio
import logging

from app.tasks.celery import celery_app
from app.services.supabase import get_supabase_service_client
from app.services.document_processor import process_document_task
from app.services.vectorstore import (
    get_user_collection,
    delete_document_chunks,
    copy_chunks_to_discussion,
    remove_document_from_discussion,
)

logger = logging.getLogger(__name__)


async def _process_document_async(document_id: str, user_id: str) -> dict:
    """
    Async implementation of document processing.
    """
    supabase = get_supabase_service_client()

    # Get document info
    doc_result = supabase.table("documents").select("*").eq("id", document_id).maybe_single().execute()
    if not doc_result or not doc_result.data:
        return {"status": "error", "message": "Document not found"}

    document = doc_result.data

    # Get user's LLM provider for embeddings
    provider_fields = "base_url, api_key, embedding_model"
    llm_provider = None
    try:
        provider_result = (
            supabase.table("llm_providers")
            .select(provider_fields)
            .eq("user_id", user_id)
            .eq("is_default", True)
            .limit(1)
            .execute()
        )
        if provider_result and provider_result.data:
            llm_provider = provider_result.data[0]
    except Exception:
        pass  # No default provider, try fallback below

    if not llm_provider:
        # No default set — try any provider
        fallback_result = (
            supabase.table("llm_providers")
            .select(provider_fields)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        llm_provider = fallback_result.data[0] if fallback_result.data else None

    if not llm_provider:
        # No provider at all — use ChromaDB default embedder
        logger.info(f"No LLM provider found for user {user_id}, using ChromaDB default embedder")
        llm_provider = {"base_url": "", "api_key": "", "embedding_model": None}

    # Download file from Supabase Storage
    try:
        storage_path = document["storage_path"]
        file_data = supabase.storage.from_("documents").download(storage_path)
    except Exception as e:
        logger.error(f"Failed to download document: {e}")
        supabase.table("documents").update({
            "status": "failed",
            "error_message": f"Failed to download file: {str(e)}",
        }).eq("id", document_id).execute()
        return {"status": "error", "message": str(e)}

    # Process document
    try:
        result = await process_document_task(
            user_id=user_id,
            document_id=document_id,
            file_content=file_data,
            filename=document["original_filename"],
            content_type=document["mime_type"],
            llm_base_url=llm_provider["base_url"],
            llm_api_key=llm_provider["api_key"],
            embedding_model=llm_provider.get("embedding_model"),
        )

        # Update document status
        if result["status"] == "success":
            supabase.table("documents").update({
                "status": "ready",
                "chunk_count": result["chunks"],
            }).eq("id", document_id).execute()
        else:
            supabase.table("documents").update({
                "status": "failed",
                "error_message": result.get("message", "Unknown error"),
            }).eq("id", document_id).execute()

        return result

    except Exception as e:
        logger.exception(f"Error processing document {document_id}")
        supabase.table("documents").update({
            "status": "failed",
            "error_message": str(e),
        }).eq("id", document_id).execute()
        return {"status": "error", "message": str(e)}


@celery_app.task(bind=True)
def process_document(self, document_id: str, user_id: str):
    """
    Process an uploaded document:
    1. Extract text
    2. Chunk into smaller pieces
    3. Generate embeddings
    4. Store in vector database
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                _process_document_async(document_id, user_id)
            )
            return result
        finally:
            loop.close()

    except Exception as e:
        logger.exception(f"Failed to process document {document_id}")
        raise


@celery_app.task
def link_document_to_discussion_task(user_id: str, discussion_id: str, document_id: str):
    """
    Copy document chunks to a discussion's collection in ChromaDB.
    """
    try:
        count = copy_chunks_to_discussion(user_id, discussion_id, [document_id])
        return {"status": "success", "chunks_copied": count}
    except Exception as e:
        logger.exception(f"Failed to link document {document_id} to discussion {discussion_id}")
        return {"status": "error", "message": str(e)}


@celery_app.task
def unlink_document_from_discussion_task(discussion_id: str, document_id: str):
    """
    Remove document chunks from a discussion's collection in ChromaDB.
    """
    try:
        remove_document_from_discussion(discussion_id, document_id)
        return {"status": "success"}
    except Exception as e:
        logger.exception(f"Failed to unlink document {document_id} from discussion {discussion_id}")
        return {"status": "error", "message": str(e)}


@celery_app.task
def delete_document_task(user_id: str, document_id: str):
    """
    Delete document chunks from ChromaDB when a document is deleted.
    """
    try:
        collection = get_user_collection(user_id)
        delete_document_chunks(collection, document_id)
        return {"status": "success"}
    except Exception as e:
        logger.exception(f"Failed to delete document chunks for {document_id}")
        return {"status": "error", "message": str(e)}
