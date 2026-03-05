import { useState, useCallback } from 'react'
import { useDocuments, useLinkDocument, useUploadDocument, useDiscussionDocuments } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  File,
  FileText,
  Upload,
  Check,
  Loader2,
  AlertCircle,
  HardDrive,
  Layers,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive'; label: string }> = {
  processing: { variant: 'warning', label: 'Processing' },
  ready: { variant: 'success', label: 'Ready' },
  failed: { variant: 'destructive', label: 'Failed' },
}

const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024

interface AddDocumentDialogProps {
  discussionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddDocumentDialog({ discussionId, open, onOpenChange }: AddDocumentDialogProps) {
  const { toast } = useToast()
  const { data: documents, isLoading } = useDocuments()
  const { data: linkedDocuments } = useDiscussionDocuments(discussionId)
  const linkDocument = useLinkDocument()
  const uploadDocument = useUploadDocument()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const linkedIds = new Set(linkedDocuments?.map((d) => d.id) || [])
  const unlinkedDocuments = documents?.filter((d) => !linkedIds.has(d.id)) || []

  const handleLink = async (doc: Document) => {
    try {
      await linkDocument.mutateAsync({ discussionId, documentId: doc.id })
      toast({ title: `"${doc.original_filename}" added` })
    } catch (error) {
      toast({
        title: 'Failed to add document',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  // Upload handlers
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not supported. Please upload PDF, TXT, MD, DOC, or DOCX files.'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File is too large. Maximum size is 10MB.'
    }
    return null
  }

  const handleFileSelect = (file: File) => {
    const error = validateFile(file)
    if (error) {
      toast({ title: 'Invalid file', description: error, variant: 'destructive' })
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      const doc = await uploadDocument.mutateAsync(selectedFile)
      toast({ title: 'Document uploaded', description: 'Processing will begin shortly.' })

      // Auto-link to this discussion
      try {
        await linkDocument.mutateAsync({ discussionId, documentId: doc.id })
      } catch {
        // Link may fail if processing, that's ok
      }

      setSelectedFile(null)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) setSelectedFile(null)
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="existing">Library</TabsTrigger>
          </TabsList>

          {/* Upload tab */}
          <TabsContent value="upload" className="mt-0">
            <div className="flex flex-col gap-4 h-[360px] pt-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center transition-colors flex-1 flex flex-col items-center justify-center',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                  selectedFile && 'border-green-500/50 bg-green-500/5'
                )}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <File className="h-8 w-8 text-muted-foreground" />
                    <div className="text-left">
                      <p className="font-medium truncate max-w-[300px]">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Drag and drop a file here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground/70 mb-4">
                      PDF, TXT, MD, DOC, DOCX up to 10MB
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.doc,.docx"
                      onChange={handleInputChange}
                      className="hidden"
                      id="add-doc-file-upload"
                    />
                    <Button variant="outline" asChild>
                      <label htmlFor="add-doc-file-upload" className="cursor-pointer">
                        Browse Files
                      </label>
                    </Button>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadDocument.isPending}
                >
                  {uploadDocument.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload & Add
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Select from existing tab */}
          <TabsContent value="existing" className="mt-0 pt-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : unlinkedDocuments.length > 0 ? (
                <ScrollArea className="h-[360px]">
                  <div className="space-y-2">
                    {unlinkedDocuments.map((doc) => (
                      <SelectableDocumentRow
                        key={doc.id}
                        document={doc}
                        onSelect={() => handleLink(doc)}
                        isLinking={linkDocument.isPending}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : documents && documents.length > 0 ? (
                <div className="flex flex-col items-center justify-center h-[360px] text-muted-foreground">
                  <Check className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">All documents are already added to this discussion.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[360px] text-muted-foreground">
                  <FileText className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No documents in your library yet.</p>
                  <p className="text-xs mt-1">Upload a document using the "Upload" tab.</p>
                </div>
              )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SelectableDocumentRow({
  document,
  onSelect,
  isLinking,
}: {
  document: Document
  onSelect: () => void
  isLinking: boolean
}) {
  const status = STATUS_BADGES[document.status] || STATUS_BADGES.processing
  const isPdf = document.mime_type === 'application/pdf'
  const FileIcon = isPdf ? FileText : File
  const iconColor = isPdf ? 'text-red-500' : 'text-blue-500'
  const iconBg = isPdf ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'

  return (
    <div
      className="group flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 hover:shadow-sm cursor-pointer transition-all"
      onClick={onSelect}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border', iconBg)}>
        <FileIcon className={cn('h-4 w-4', iconColor)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{document.original_filename}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-[11px] text-foreground/80">
            <HardDrive className="h-3 w-3 text-muted-foreground" />
            {formatFileSize(document.file_size)}
          </span>
          {document.chunk_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/80 border border-border/50 text-[11px] text-foreground/80">
              <Layers className="h-3 w-3 text-muted-foreground" />
              {document.chunk_count} chunks
            </span>
          )}
          <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 h-4">
            {document.status === 'processing' && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
            {document.status === 'failed' && <AlertCircle className="h-2.5 w-2.5 mr-0.5" />}
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="flex-shrink-0">
        {isLinking ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Check className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
