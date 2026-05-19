/* @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCardDraft } from './use-card-draft'

describe('useCardDraft', () => {
  it('does not replace editor content if async hydration finishes after typing starts', async () => {
    let resolveHydration:
      | ((value: Array<Record<string, unknown>>) => void)
      | null = null
    const replaceBlocks = vi.fn()
    const dirtyRef = { current: false }
    const skipNextDraftWriteRef = { current: false }
    const suppressEditorChangeRef = { current: false }

    renderHook(() =>
      useCardDraft({
        baseUpdatedAt: 1,
        blockNoteEditor: {
          document: [],
          replaceBlocks,
        },
        card: {
          id: 'card_1',
          body: {
            type: 'blocknote',
            content: [{ id: 'server-block', type: 'paragraph' }],
          },
          meta: { title: 'Server title' },
          statusKey: 'backlog',
          tagIds: [],
          updatedAt: 1,
        },
        dehydrateContent: (content) => content,
        dirtyRef,
        mergedFieldValues: {},
        onResolveCardFileUrl: async () => null,
        propertyValues: {},
        setBaseUpdatedAt: vi.fn(),
        setEditingSelectOptionsKey: vi.fn(),
        setExpandedPluginSlotId: vi.fn(),
        setIsAddingProperty: vi.fn(),
        setNewPropertyName: vi.fn(),
        setNewPropertyType: vi.fn(),
        setNewSelectOptions: vi.fn(),
        setPropertyValues: vi.fn(),
        setSelectedTagIds: vi.fn(),
        setStatusKey: vi.fn(),
        setTitle: vi.fn(),
        statusKey: 'backlog',
        skipNextDraftWriteRef,
        suppressEditorChangeRef,
        title: 'Draft title',
        toBlockNoteContent: (body) =>
          (body as { content: Array<Record<string, unknown>> }).content,
        hydrateContentWithSignedUrls: async (content) =>
          await new Promise<Array<Record<string, unknown>>>((resolve) => {
            resolveHydration = resolve
          }).then(() => content),
        selectedTagIds: [],
      }),
    )

    dirtyRef.current = true

    await act(async () => {
      resolveHydration?.([{ id: 'server-block', type: 'paragraph' }])
      await Promise.resolve()
    })

    expect(replaceBlocks).not.toHaveBeenCalled()
  })
})
