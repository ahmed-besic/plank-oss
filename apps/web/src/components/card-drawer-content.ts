import { normalizeCardBody } from '@plank/domain'
import type { BlockNoteDoc } from './card-drawer-types'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function toBlockNoteContent(body: unknown): BlockNoteDoc {
  const normalized = normalizeCardBody(body)
  return cloneJson(normalized.content)
}

function walkBlocks(
  blocks: BlockNoteDoc,
  visitor: (block: Record<string, unknown>) => void,
) {
  for (const block of blocks) {
    visitor(block)
    const children = Array.isArray(block.children)
      ? (block.children as BlockNoteDoc)
      : []
    if (children.length > 0) {
      walkBlocks(children, visitor)
    }
  }
}

function collectStorageIds(content: BlockNoteDoc): string[] {
  const ids: string[] = []
  walkBlocks(content, (block) => {
    if (block.type !== 'image') {
      return
    }
    const props =
      block.props && typeof block.props === 'object'
        ? (block.props as Record<string, unknown>)
        : undefined
    if (!props) {
      return
    }
    if (typeof props.storageId === 'string' && props.storageId.length > 0) {
      ids.push(props.storageId)
    }
  })
  return [...new Set(ids)]
}

export async function hydrateContentWithSignedUrls(
  content: BlockNoteDoc,
  resolveUrl: (storageId: string) => Promise<string | null>,
) {
  const hydrated = cloneJson(content)
  const storageIds = collectStorageIds(hydrated)
  if (storageIds.length === 0) {
    return hydrated
  }

  const resolved = new Map<string, string>()
  await Promise.all(
    storageIds.map(async (storageId) => {
      const url = await resolveUrl(storageId)
      if (typeof url === 'string' && url.length > 0) {
        resolved.set(storageId, url)
      }
    }),
  )

  walkBlocks(hydrated, (block) => {
    if (block.type !== 'image') {
      return
    }
    const props =
      block.props && typeof block.props === 'object'
        ? (block.props as Record<string, unknown>)
        : {}
    if (typeof props.storageId !== 'string') {
      return
    }
    const url = resolved.get(props.storageId)
    if (!url) {
      return
    }
    block.props = {
      ...props,
      url,
    }
  })

  return hydrated
}

export function dehydrateContent(content: BlockNoteDoc): BlockNoteDoc {
  const dehydrated = cloneJson(content)
  walkBlocks(dehydrated, (block) => {
    if (block.type !== 'image') {
      return
    }
    const props =
      block.props && typeof block.props === 'object'
        ? (block.props as Record<string, unknown>)
        : {}
    if (typeof props.storageId !== 'string' || !('url' in props)) {
      return
    }
    const { url: _ignoreUrl, ...rest } = props
    block.props = rest
  })
  return dehydrated
}

export function isPersistedCardId(cardId: string): boolean {
  return !cardId.startsWith('optimistic:')
}
