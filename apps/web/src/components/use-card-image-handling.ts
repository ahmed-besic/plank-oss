import { useEffect   } from 'react'
import type {ChangeEvent, MutableRefObject} from 'react';
import { toast } from 'sonner'

type BlockNoteDoc = Array<Record<string, unknown>>

export function useCardImageHandling({
  blockNoteEditor,
  dirtyRef,
  fileInputRef,
  onRequestCardUploadUrl,
  onResolveCardFileUrl,
  pendingDraft,
}: {
  blockNoteEditor: any
  dirtyRef: MutableRefObject<boolean>
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onRequestCardUploadUrl: () => Promise<string>
  onResolveCardFileUrl: (storageId: string) => Promise<string | null>
  pendingDraft: unknown
}) {
  const uploadImageFile = async (file: File) => {
    try {
      const uploadUrl = await onRequestCardUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })
      if (!response.ok) {
        throw new Error('Upload failed')
      }
      const uploadResult = (await response.json()) as
        | { storageId?: string }
        | string
      const storageId =
        typeof uploadResult === 'string'
          ? uploadResult
          : uploadResult.storageId
      if (!storageId) {
        throw new Error('Upload response missing storageId')
      }
      const signedUrl = await onResolveCardFileUrl(storageId)
      return {
        storageId,
        signedUrl: signedUrl ?? '',
        fileName: file.name,
      }
    } catch {
      toast.error('Could not upload image')
      return null
    }
  }

  const insertUploadedImage = (payload: {
    storageId: string
    signedUrl: string
    fileName: string
  }) => {
    try {
      const cursorBlock = blockNoteEditor.getTextCursorPosition().block
      blockNoteEditor.insertBlocks(
        [
          {
            type: 'image',
            props: {
              storageId: payload.storageId,
              url: payload.signedUrl,
              caption: payload.fileName,
            },
          },
        ],
        cursorBlock,
        'after',
      )
    } catch {
      blockNoteEditor.replaceBlocks(blockNoteEditor.document, [
        ...(blockNoteEditor.document as BlockNoteDoc),
        {
          id: crypto.randomUUID(),
          type: 'image',
          props: {
            storageId: payload.storageId,
            url: payload.signedUrl,
            caption: payload.fileName,
          },
        },
      ])
    }
    dirtyRef.current = true
  }

  const insertRemoteImage = (url: string) => {
    try {
      const cursorBlock = blockNoteEditor.getTextCursorPosition().block
      blockNoteEditor.insertBlocks(
        [
          {
            type: 'image',
            props: {
              url,
              caption: 'Pasted image',
            },
          },
        ],
        cursorBlock,
        'after',
      )
    } catch {
      blockNoteEditor.replaceBlocks(blockNoteEditor.document, [
        ...(blockNoteEditor.document as BlockNoteDoc),
        {
          id: crypto.randomUUID(),
          type: 'image',
          props: {
            url,
            caption: 'Pasted image',
          },
        },
      ])
    }
    dirtyRef.current = true
  }

  const uploadAndInsertImage = async (file: File) => {
    try {
      const uploaded = await uploadImageFile(file)
      if (uploaded) {
        insertUploadedImage(uploaded)
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (pendingDraft) {
        return
      }
      const clipboardData = event.clipboardData
      if (!clipboardData) {
        return
      }

      const imageFiles = Array.from(clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))

      if (imageFiles.length > 0) {
        event.preventDefault()
        void (async () => {
          for (const file of imageFiles) {
            await uploadAndInsertImage(file)
          }
        })()
        return
      }

      const pastedText = clipboardData.getData('text/plain').trim()
      const markdownImageMatch = pastedText.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i)
      const pastedImageUrl = markdownImageMatch?.[1] ?? pastedText
      const isRemoteImageUrl = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(
        pastedImageUrl,
      )

      if (isRemoteImageUrl) {
        event.preventDefault()
        insertRemoteImage(pastedImageUrl)
        return
      }

      if (
        /^\/Users\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(pastedText) ||
        /^file:\/\//i.test(pastedText)
      ) {
        toast.message(
          'That looks like a local file path. Copy the image itself (not the path) and paste again.',
        )
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pendingDraft])

  const onImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void uploadAndInsertImage(file)
    }
  }

  return {
    onImageInputChange,
  }
}
