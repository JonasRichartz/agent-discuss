from fastapi import APIRouter, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from uuid import UUID, uuid4

from app.api.deps import CurrentUser
from app.services.supabase import get_supabase_client_with_auth, get_supabase_service_client

router = APIRouter()


class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    mime_type: str
    file_size: int
    status: str
    chunk_count: int
    error_message: str | None = None
    created_at: str


@router.get("", response_model=list[DocumentResponse])
async def list_documents(current_user: CurrentUser):
    """List user's documents."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("documents").select("id, filename, original_filename, mime_type, file_size, status, chunk_count, error_message, created_at").eq("user_id", current_user["id"]).order(
        "created_at", desc=True
    ).execute()
    return response.data


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(current_user: CurrentUser, file: UploadFile = File(...)):
    """Upload a document."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Validate file type
    allowed_types = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file.content_type} not allowed",
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Generate unique filename
    file_id = str(uuid4())
    ext = file.filename.split(".")[-1] if "." in file.filename else ""
    storage_filename = f"{file_id}.{ext}" if ext else file_id
    storage_path = f"{current_user['id']}/{storage_filename}"

    # Upload to Supabase Storage (service client bypasses storage RLS;
    # document ownership is enforced via the documents table RLS)
    try:
        service_client = get_supabase_service_client()
        service_client.storage.from_("documents").upload(storage_path, content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {str(e)}",
        )

    # Create database record
    data = {
        "user_id": current_user["id"],
        "filename": storage_filename,
        "original_filename": file.filename,
        "mime_type": file.content_type,
        "file_size": file_size,
        "storage_path": storage_path,
        "status": "processing",
    }

    response = supabase.table("documents").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create document record")
    document = response.data[0]

    # Trigger background task to process document (chunking, embedding)
    from app.tasks.document import process_document
    process_document.delay(document["id"], current_user["id"])

    return document


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(current_user: CurrentUser, document_id: UUID):
    """Get a specific document."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])
    response = supabase.table("documents").select("id, filename, original_filename, mime_type, file_size, status, chunk_count, error_message, created_at").eq("id", str(document_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not response or not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return response.data


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(current_user: CurrentUser, document_id: UUID):
    """Delete a document."""
    from app.tasks.document import delete_document_task

    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Get document info
    doc = supabase.table("documents").select("storage_path").eq("id", str(document_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not doc or not doc.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete from storage (service client for storage operations)
    try:
        service_client = get_supabase_service_client()
        service_client.storage.from_("documents").remove([doc.data["storage_path"]])
    except Exception:
        pass  # Ignore storage errors

    # Delete from ChromaDB (background task)
    delete_document_task.delay(current_user["id"], str(document_id))

    # Delete database record
    supabase.table("documents").delete().eq("id", str(document_id)).execute()


@router.get("/{document_id}/download")
async def download_document(current_user: CurrentUser, document_id: UUID):
    """Get download URL for a document."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    doc = supabase.table("documents").select("storage_path, original_filename").eq("id", str(document_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not doc or not doc.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Get signed URL (valid for 1 hour; service client for storage operations)
    service_client = get_supabase_service_client()
    url = service_client.storage.from_("documents").create_signed_url(doc.data["storage_path"], 3600)

    return {"url": url["signedURL"], "filename": doc.data["original_filename"]}


# Link documents to discussions

class LinkDocumentRequest(BaseModel):
    document_id: str


@router.post("/discussions/{discussion_id}/documents")
async def link_document_to_discussion(
    current_user: CurrentUser,
    discussion_id: UUID,
    request: LinkDocumentRequest,
):
    """Attach a document to a discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership
    discussion = supabase.table("discussions").select("id").eq("id", str(discussion_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found")

    # Verify document ownership
    document = supabase.table("documents").select("id").eq("id", request.document_id).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not document or not document.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Create link
    data = {
        "discussion_id": str(discussion_id),
        "document_id": request.document_id,
    }

    try:
        supabase.table("discussion_documents").insert(data).execute()
    except Exception:
        # Already linked
        return {"status": "already_linked"}

    # Copy document chunks to discussion collection (background task)
    from app.tasks.document import link_document_to_discussion_task
    link_document_to_discussion_task.delay(
        current_user["id"],
        str(discussion_id),
        request.document_id,
    )

    return {"status": "linked"}


@router.delete("/discussions/{discussion_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_document_from_discussion(
    current_user: CurrentUser,
    discussion_id: UUID,
    document_id: UUID,
):
    """Remove a document from a discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership
    discussion = supabase.table("discussions").select("id").eq("id", str(discussion_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found")

    supabase.table("discussion_documents").delete().eq("discussion_id", str(discussion_id)).eq(
        "document_id", str(document_id)
    ).execute()

    # Remove document chunks from discussion collection (background task)
    from app.tasks.document import unlink_document_from_discussion_task
    unlink_document_from_discussion_task.delay(str(discussion_id), str(document_id))


@router.get("/discussions/{discussion_id}/documents", response_model=list[DocumentResponse])
async def list_discussion_documents(
    current_user: CurrentUser,
    discussion_id: UUID,
):
    """List documents linked to a discussion."""
    supabase = get_supabase_client_with_auth(current_user["access_token"])

    # Verify discussion ownership
    discussion = supabase.table("discussions").select("id").eq("id", str(discussion_id)).eq(
        "user_id", current_user["id"]
    ).maybe_single().execute()

    if not discussion or not discussion.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discussion not found")

    # Get linked documents
    response = supabase.table("discussion_documents").select(
        "documents(*)"
    ).eq("discussion_id", str(discussion_id)).execute()

    documents = [item["documents"] for item in response.data if item.get("documents")]
    return documents
