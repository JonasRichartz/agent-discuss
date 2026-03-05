"""
Document processing pipeline for RAG.

Handles:
- Text extraction from various file formats
- Text chunking with configurable size and overlap
- Embedding generation via LLM provider
- Storage in ChromaDB
"""

import logging
import re
from pathlib import Path
from typing import List, Tuple, Optional
from io import BytesIO

from langchain_openai import OpenAIEmbeddings

from app.services.vectorstore import (
    get_user_collection,
    add_document_chunks,
    delete_document_chunks,
)

logger = logging.getLogger(__name__)

# Chunking configuration
DEFAULT_CHUNK_SIZE = 1000  # characters
DEFAULT_CHUNK_OVERLAP = 200  # characters
MIN_CHUNK_SIZE = DEFAULT_CHUNK_SIZE  # reject documents shorter than one chunk


class DocumentProcessor:
    """
    Processes documents for RAG integration.

    Extracts text, chunks it, generates embeddings, and stores in ChromaDB.
    """

    def __init__(
        self,
        llm_base_url: str,
        llm_api_key: str,
        embedding_model: str | None = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.use_external_embeddings = bool(embedding_model)

        if self.use_external_embeddings:
            self.embeddings = OpenAIEmbeddings(
                base_url=llm_base_url,
                api_key=llm_api_key,
                model=embedding_model,
            )
        else:
            self.embeddings = None

    async def process_document(
        self,
        user_id: str,
        document_id: str,
        file_content: bytes,
        filename: str,
        content_type: str,
    ) -> dict:
        """
        Process a document and store its embeddings.

        Args:
            user_id: Owner's user ID
            document_id: Document ID in database
            file_content: Raw file bytes
            filename: Original filename
            content_type: MIME type

        Returns:
            Dictionary with processing results
        """
        # Extract text based on file type
        text = await self._extract_text(file_content, filename, content_type)

        if not text or len(text.strip()) < MIN_CHUNK_SIZE:
            return {
                "status": "error",
                "message": f"Document text is too short ({len(text.strip()) if text else 0} chars). "
                           f"Minimum is {MIN_CHUNK_SIZE} characters to form at least one chunk.",
                "chunks": 0,
            }

        # Chunk the text
        chunks = self._chunk_text(text)

        if not chunks:
            return {
                "status": "error",
                "message": "Failed to create text chunks",
                "chunks": 0,
            }

        # Generate embeddings (or let ChromaDB use its default)
        embeddings = None
        if self.use_external_embeddings:
            try:
                embeddings = await self._generate_embeddings(chunks)
            except Exception as e:
                logger.error(f"Failed to generate embeddings: {e}")
                return {
                    "status": "error",
                    "message": f"Failed to generate embeddings: {str(e)}",
                    "chunks": 0,
                }
        else:
            logger.info("No embedding model configured — using ChromaDB default embedder")

        # Prepare metadata for each chunk
        metadatas = [
            {
                "document_id": document_id,
                "filename": filename,
                "chunk_index": i,
                "total_chunks": len(chunks),
            }
            for i in range(len(chunks))
        ]

        # Store in ChromaDB
        collection = get_user_collection(user_id)

        # Remove any existing chunks for this document
        delete_document_chunks(collection, document_id)

        # Add new chunks
        add_document_chunks(
            collection=collection,
            document_id=document_id,
            chunks=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        return {
            "status": "success",
            "message": f"Processed {len(chunks)} chunks",
            "chunks": len(chunks),
            "total_characters": len(text),
        }

    async def _extract_text(
        self,
        content: bytes,
        filename: str,
        content_type: str,
    ) -> str:
        """
        Extract text from a document based on its type.
        """
        filename_lower = filename.lower()

        # Plain text files
        if content_type == "text/plain" or filename_lower.endswith(".txt"):
            return content.decode("utf-8", errors="ignore")

        # Markdown files
        if content_type == "text/markdown" or filename_lower.endswith(".md"):
            return content.decode("utf-8", errors="ignore")

        # PDF files
        if content_type == "application/pdf" or filename_lower.endswith(".pdf"):
            return await self._extract_pdf_text(content)

        # Word documents
        if filename_lower.endswith(".docx"):
            return await self._extract_docx_text(content)

        # HTML files
        if content_type == "text/html" or filename_lower.endswith(".html"):
            return self._extract_html_text(content.decode("utf-8", errors="ignore"))

        # Default: try to decode as text
        try:
            return content.decode("utf-8", errors="ignore")
        except Exception as e:
            logger.error(f"Failed to decode file content as text: {e}")
            return ""

    async def _extract_pdf_text(self, content: bytes) -> str:
        """
        Extract text from a PDF file.
        """
        try:
            import pypdf

            reader = pypdf.PdfReader(BytesIO(content))
            text_parts = []

            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)

            return "\n\n".join(text_parts)

        except ImportError:
            logger.warning("pypdf not installed, cannot extract PDF text")
            return ""
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return ""

    async def _extract_docx_text(self, content: bytes) -> str:
        """
        Extract text from a Word document.
        """
        try:
            import docx

            doc = docx.Document(BytesIO(content))
            text_parts = []

            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)

            return "\n\n".join(text_parts)

        except ImportError:
            logger.warning("python-docx not installed, cannot extract DOCX text")
            return ""
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {e}")
            return ""

    def _extract_html_text(self, html: str) -> str:
        """
        Extract text from HTML content.
        """
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            text = soup.get_text()

            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = "\n".join(chunk for chunk in chunks if chunk)

            return text

        except ImportError:
            # Fallback: simple regex-based extraction
            text = re.sub(r"<[^>]+>", " ", html)
            text = re.sub(r"\s+", " ", text)
            return text.strip()

    def _chunk_text(self, text: str) -> List[str]:
        """
        Split text into overlapping chunks.

        Uses a simple character-based chunking with sentence boundary awareness.
        """
        if len(text) <= self.chunk_size:
            return [text.strip()] if text.strip() else []

        chunks = []
        start = 0

        while start < len(text):
            # Calculate end position
            end = start + self.chunk_size

            # If we're not at the end, try to break at a sentence boundary
            if end < len(text):
                # Look for sentence endings within the last 20% of the chunk
                search_start = end - int(self.chunk_size * 0.2)
                search_text = text[search_start:end]

                # Find the last sentence boundary
                for pattern in [". ", ".\n", "! ", "!\n", "? ", "?\n", "\n\n"]:
                    last_idx = search_text.rfind(pattern)
                    if last_idx != -1:
                        end = search_start + last_idx + len(pattern)
                        break

            # Extract chunk
            chunk = text[start:end].strip()

            if chunk:
                chunks.append(chunk)

            # Move start position with overlap
            prev_start = start
            start = end - self.chunk_overlap

            # Ensure we're making progress
            if start <= prev_start:
                start = end

        return chunks

    async def _generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.
        """
        # Use LangChain's embedding client
        embeddings = await self.embeddings.aembed_documents(texts)
        return embeddings


async def process_document_task(
    user_id: str,
    document_id: str,
    file_content: bytes,
    filename: str,
    content_type: str,
    llm_base_url: str,
    llm_api_key: str,
    embedding_model: str | None = None,
) -> dict:
    """
    Process a document (meant to be called from Celery task).

    This is the main entry point for document processing.
    """
    processor = DocumentProcessor(
        llm_base_url=llm_base_url,
        llm_api_key=llm_api_key,
        embedding_model=embedding_model,
    )

    return await processor.process_document(
        user_id=user_id,
        document_id=document_id,
        file_content=file_content,
        filename=filename,
        content_type=content_type,
    )


def simple_chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> List[str]:
    """
    Simple text chunking function for use without the full processor.
    """
    processor = DocumentProcessor.__new__(DocumentProcessor)
    processor.chunk_size = chunk_size
    processor.chunk_overlap = chunk_overlap
    return processor._chunk_text(text)
