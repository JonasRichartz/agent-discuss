"""
Vector store service using ChromaDB for document embeddings.

Provides storage and retrieval of document chunks for RAG
(Retrieval-Augmented Generation) in agent discussions.
"""

import logging
from pathlib import Path
from typing import List, Optional
import chromadb
from chromadb.config import Settings

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global ChromaDB client instance
_client: Optional[chromadb.PersistentClient] = None


def get_chroma_client() -> chromadb.PersistentClient:
    """
    Get or create the ChromaDB client.

    Uses persistent storage in the data directory.
    """
    global _client

    if _client is None:
        # Create data directory if it doesn't exist
        persist_dir = Path(settings.chroma_persist_dir)
        persist_dir.mkdir(parents=True, exist_ok=True)

        _client = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True,
            ),
        )
        logger.info(f"ChromaDB initialized at {persist_dir}")

    return _client


def get_discussion_collection(discussion_id: str) -> chromadb.Collection:
    """
    Get or create a collection for a specific discussion.

    Each discussion has its own collection to isolate document contexts.
    """
    client = get_chroma_client()
    collection_name = f"discussion_{discussion_id.replace('-', '_')}"

    return client.get_or_create_collection(
        name=collection_name,
        metadata={"discussion_id": discussion_id},
    )


def get_user_collection(user_id: str) -> chromadb.Collection:
    """
    Get or create a collection for a user's documents.

    User collections store documents that can be linked to multiple discussions.
    """
    client = get_chroma_client()
    collection_name = f"user_{user_id.replace('-', '_')}"

    return client.get_or_create_collection(
        name=collection_name,
        metadata={"user_id": user_id},
    )


def add_document_chunks(
    collection: chromadb.Collection,
    document_id: str,
    chunks: List[str],
    embeddings: Optional[List[List[float]]] = None,
    metadatas: Optional[List[dict]] = None,
) -> None:
    """
    Add document chunks to a collection.

    When embeddings are provided, they are stored directly.
    When embeddings are None, ChromaDB generates them using its default model.

    Args:
        collection: ChromaDB collection
        document_id: ID of the source document
        chunks: List of text chunks
        embeddings: Optional list of embedding vectors
        metadatas: Optional metadata for each chunk
    """
    if not chunks:
        return

    # Generate IDs for each chunk
    ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]

    # Prepare metadata
    if metadatas is None:
        metadatas = [{"document_id": document_id, "chunk_index": i} for i in range(len(chunks))]
    else:
        # Ensure document_id is in all metadata
        for i, meta in enumerate(metadatas):
            meta["document_id"] = document_id
            meta["chunk_index"] = i

    # Add to collection — with or without pre-computed embeddings
    add_kwargs = {
        "ids": ids,
        "documents": chunks,
        "metadatas": metadatas,
    }
    if embeddings is not None:
        add_kwargs["embeddings"] = embeddings

    collection.add(**add_kwargs)

    logger.info(f"Added {len(chunks)} chunks from document {document_id}")


def query_similar_chunks(
    collection: chromadb.Collection,
    query_embedding: List[float],
    n_results: int = 5,
    where: Optional[dict] = None,
) -> dict:
    """
    Query for similar document chunks.

    Args:
        collection: ChromaDB collection
        query_embedding: Embedding vector for the query
        n_results: Number of results to return
        where: Optional filter conditions

    Returns:
        Dictionary with 'documents', 'metadatas', 'distances'
    """
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    return {
        "documents": results["documents"][0] if results["documents"] else [],
        "metadatas": results["metadatas"][0] if results["metadatas"] else [],
        "distances": results["distances"][0] if results["distances"] else [],
    }


def query_by_text(
    collection: chromadb.Collection,
    query_text: str,
    n_results: int = 5,
    where: Optional[dict] = None,
) -> dict:
    """
    Query for similar chunks using text (uses ChromaDB's default embedding).

    Note: This uses ChromaDB's default embedding function. For consistency
    with your LLM provider's embeddings, use query_similar_chunks instead.
    """
    results = collection.query(
        query_texts=[query_text],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    return {
        "documents": results["documents"][0] if results["documents"] else [],
        "metadatas": results["metadatas"][0] if results["metadatas"] else [],
        "distances": results["distances"][0] if results["distances"] else [],
    }


def delete_document_chunks(
    collection: chromadb.Collection,
    document_id: str,
) -> None:
    """
    Delete all chunks for a specific document.
    """
    # Get all chunk IDs for this document
    results = collection.get(
        where={"document_id": document_id},
        include=[],
    )

    if results["ids"]:
        collection.delete(ids=results["ids"])
        logger.info(f"Deleted {len(results['ids'])} chunks for document {document_id}")


def delete_collection(collection_name: str) -> None:
    """
    Delete an entire collection.
    """
    client = get_chroma_client()
    try:
        client.delete_collection(collection_name)
        logger.info(f"Deleted collection {collection_name}")
    except ValueError:
        # Collection doesn't exist
        pass


def get_collection_stats(collection: chromadb.Collection) -> dict:
    """
    Get statistics about a collection.
    """
    count = collection.count()
    return {
        "name": collection.name,
        "count": count,
        "metadata": collection.metadata,
    }


def copy_chunks_to_discussion(
    user_id: str,
    discussion_id: str,
    document_ids: List[str],
) -> int:
    """
    Copy document chunks from user collection to a discussion collection.

    This allows linking user documents to specific discussions.

    Returns:
        Number of chunks copied
    """
    user_collection = get_user_collection(user_id)
    discussion_collection = get_discussion_collection(discussion_id)

    total_copied = 0

    for doc_id in document_ids:
        # Get chunks from user collection
        results = user_collection.get(
            where={"document_id": doc_id},
            include=["documents", "embeddings", "metadatas"],
        )

        if not results["ids"]:
            continue

        # Generate new IDs for discussion collection
        new_ids = [f"{discussion_id}_{id}" for id in results["ids"]]

        # Add to discussion collection
        discussion_collection.add(
            ids=new_ids,
            documents=results["documents"],
            embeddings=results["embeddings"],
            metadatas=results["metadatas"],
        )

        total_copied += len(results["ids"])

    logger.info(f"Copied {total_copied} chunks to discussion {discussion_id}")
    return total_copied


def remove_document_from_discussion(
    discussion_id: str,
    document_id: str,
) -> None:
    """
    Remove a document's chunks from a discussion collection.
    """
    collection = get_discussion_collection(discussion_id)

    # Find and delete chunks for this document
    results = collection.get(
        where={"document_id": document_id},
        include=[],
    )

    if results["ids"]:
        collection.delete(ids=results["ids"])
        logger.info(f"Removed document {document_id} from discussion {discussion_id}")
