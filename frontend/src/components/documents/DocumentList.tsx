import { useState } from 'react'
import { useDocuments, useDeleteDocument, useUnlinkDocument, useDiscussionDocuments } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { DocumentUploadDialog } from './DocumentUploadDialog'
import { AddDocumentDialog } from './AddDocumentDialog'
import {
  File,
  FileText,
  Trash2,
  Upload,
  Plus,
  Loader2,
  AlertCircle,
  HardDrive,
  Layers,
  Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; label: string }> = {
  processing: { variant: 'warning', label: 'Processing' },
  ready: { variant: 'success', label: 'Ready' },
  failed: { variant: 'destructive', label: 'Failed' },
}

interface DocumentListProps {
  mode?: 'manage' | 'link'
  discussionId?: string
}

export function DocumentList({ mode = 'manage', discussionId }: DocumentListProps) {
  const { toast } = useToast()
  const { data: documents, isLoading } = useDocuments()
  const { data: linkedDocuments, isLoading: isLoadingLinked } = useDiscussionDocuments(mode === 'link' ? discussionId : undefined)
  const deleteDocument = useDeleteDocument()
  const unlinkDocument = useUnlinkDocument()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [addDocOpen, setAddDocOpen] = useState(false)

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Delete "${doc.original_filename}"?`)) return

    try {
      await deleteDocument.mutateAsync(doc.id)
      toast({ title: 'Document deleted' })
    } catch (error) {
      toast({
        title: 'Failed to delete',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleUnlink = async (doc: Document) => {
    if (!discussionId) return

    try {
      await unlinkDocument.mutateAsync({ discussionId, documentId: doc.id })
      toast({ title: 'Document removed' })
    } catch (error) {
      toast({
        title: 'Failed to remove document',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  // Link mode: show only linked documents + "Add Document" button
  if (mode === 'link') {
    if (isLoadingLinked) {
      return (
        <div className="flex flex-wrap gap-4">
          <Skeleton className="w-[280px] h-[120px] rounded-xl" />
          <Skeleton className="w-[280px] h-[120px] rounded-xl" />
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => setAddDocOpen(true)}
            className="w-[280px] border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-all"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">Add Document</span>
          </button>
          {linkedDocuments?.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              action="unlink"
              onAction={() => handleUnlink(doc)}
            />
          ))}
        </div>

        {discussionId && (
          <AddDocumentDialog
            discussionId={discussionId}
            open={addDocOpen}
            onOpenChange={setAddDocOpen}
          />
        )}
      </div>
    )
  }

  // Manage mode: show all documents + upload button (settings page)
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {documents?.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No documents yet.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setUploadOpen(true)}
            className="border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-all"
          >
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">Upload Document</span>
          </button>
          {documents?.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              action="delete"
              onAction={() => handleDelete(doc)}
            />
          ))}
        </div>
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </div>
  )
}

interface DocumentCardProps {
  document: Document
  action: 'delete' | 'unlink'
  onAction: () => void
}

function DocumentCard({ document, action, onAction }: DocumentCardProps) {
  const status = STATUS_BADGES[document.status] || STATUS_BADGES.processing
  const isPdf = document.mime_type === 'application/pdf'
  const FileIcon = isPdf ? FileText : File
  const iconColor = isPdf ? 'text-red-500' : 'text-blue-500'
  const iconBg = isPdf ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'

  return (
    <div className="group relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all">
      {/* Header: icon + filename */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border', iconBg)}>
          <FileIcon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <p className="text-sm font-semibold text-foreground truncate">{document.original_filename}</p>
          <Badge variant={status.variant} className="mt-1 text-[10px] px-1.5 py-0 h-4">
            {document.status === 'processing' && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
            {document.status === 'failed' && <AlertCircle className="h-2.5 w-2.5 mr-0.5" />}
            {status.label}
          </Badge>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
          <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground/90">{formatFileSize(document.file_size)}</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
          <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-foreground/80">{document.chunk_count > 0 ? `${document.chunk_count} chunks` : 'No chunks'}</span>
        </div>
      </div>

      {/* Error message */}
      {document.status === 'failed' && document.error_message && (
        <div className="px-4 pb-3">
          <p className="text-xs text-destructive truncate">{document.error_message}</p>
        </div>
      )}

      {/* Action button */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          title={action === 'delete' ? 'Delete document' : 'Remove from discussion'}
        >
          {action === 'delete' ? (
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Unlink className="h-3.5 w-3.5 text-destructive" />
          )}
        </Button>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
