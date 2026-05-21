import { useMutation } from '@tanstack/react-query'
import {
  Button,
  Input,
  TAG_COLOR_PALETTE,
  getTagChipStyle,
  getTagDotStyle,
} from '@plank/ui'
import { useState, useEffect, useRef } from 'react'
import { api } from '@convex/_generated/api'
import type { SettingsData } from './-use-settings-data'
import { ChevronDown, Pencil } from 'lucide-react'
import { createPortal } from 'react-dom'

export function SchemaTab({ data }: { data: SettingsData }) {
  const { boardTypes, cardTypes, tags, convexClient, invalidate, workspaceSlug } = data

  const [boardTypeName, setBoardTypeName] = useState('')
  const [cardTypeName, setCardTypeName] = useState('')
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState('violet')

  const [newTagColorOpen, setNewTagColorOpen] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [tempTagName, setTempTagName] = useState('')
  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null)
  const schemaTabRef = useRef<HTMLDivElement>(null)
  const newTagTriggerRef = useRef<HTMLButtonElement>(null)
  const tagColorMenuRef = useRef<HTMLDivElement>(null)
  const tagColorTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (schemaTabRef.current?.contains(target)) {
        return
      }
      if (tagColorMenuRef.current?.contains(target)) {
        return
      }
      if (newTagTriggerRef.current?.contains(target)) {
        return
      }
      if (colorPickerTagId && tagColorTriggerRefs.current[colorPickerTagId]?.contains(target)) {
        return
      }
      setNewTagColorOpen(false)
      setColorPickerTagId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [colorPickerTagId])

  const createBoardType = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.boardTypes.createBoardType, { workspaceSlug, name: boardTypeName }),
    onSuccess: () => { setBoardTypeName(''); void invalidate() },
  })

  const createCardType = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.cardTypes.createCardType, {
        workspaceSlug,
        name: cardTypeName,
      }),
    onSuccess: () => { setCardTypeName(''); void invalidate() },
  })

  const createTag = useMutation({
    mutationFn: async () => {
      const trimmed = tagName.trim()
      if (!trimmed) throw new Error('Tag name is required')
      return convexClient.mutation(api.tags.createTag, {
        workspaceSlug,
        name: trimmed,
        color: tagColor,
      })
    },
    onSuccess: () => {
      setTagName('')
      setTagColor('violet')
      void invalidate()
    },
  })

  const updateTagMutation = useMutation({
    mutationFn: async ({ tagId, name, color }: { tagId: string; name?: string; color?: string }) =>
      convexClient.mutation(api.tags.updateTag, {
        workspaceSlug,
        tagId: tagId as never,
        name,
        color,
      }),
    onSuccess: () => {
      void invalidate()
    },
  })

  const handleTagSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tagName.trim()) createTag.mutate()
  }

  const handleBoardTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (boardTypeName.trim()) createBoardType.mutate()
  }

  const handleCardTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (cardTypeName.trim()) createCardType.mutate()
  }

  const newTagColorRect = newTagColorOpen
    ? newTagTriggerRef.current?.getBoundingClientRect() ?? null
    : null
  const existingTagColorRect = colorPickerTagId
    ? tagColorTriggerRefs.current[colorPickerTagId]?.getBoundingClientRect() ?? null
    : null

  return (
    <div className="schema-tab" ref={schemaTabRef}>
      <h2 className="schema-title">Schema</h2>
      <p className="schema-subtitle">Workspace types, tags, and structure.</p>

      {/* Tags */}
      <section className="schema-section">
        <div className="schema-section-header">
          <h3 className="schema-section-title">Tags</h3>
          <span className="schema-count">{tags.length}</span>
        </div>
        <form onSubmit={handleTagSubmit} className="schema-form-stack">
          <div className="schema-inline-form">
            {/* New tag color picker dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                ref={newTagTriggerRef}
                className="schema-color-picker-trigger"
                onClick={() => setNewTagColorOpen(!newTagColorOpen)}
                style={getTagChipStyle(tagColor)}
              >
                <span className="schema-tag-color-swatch" style={getTagDotStyle(tagColor)} />
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              </button>
            </div>

            <Input
              onChange={(e) => setTagName(e.target.value)}
              placeholder="New tag name…"
              value={tagName}
            />
            <Button type="submit" disabled={!tagName.trim() || createTag.isPending} size="sm">
              Add
            </Button>
          </div>
        </form>
        {createTag.isError && (
          <p className="schema-error">{(createTag.error).message}</p>
        )}
        <div className="schema-list">
          {tags.length ? (
            tags.map((tag) => (
              <div key={tag.id} className="schema-row group">
                <span className="schema-tag-dot" style={getTagDotStyle(tag.color)} />
                
                {editingTagId === tag.id ? (
                  <input
                    type="text"
                    className="schema-rename-input"
                    value={tempTagName}
                    onChange={(e) => setTempTagName(e.target.value)}
                    onBlur={() => {
                      if (tempTagName.trim() && tempTagName.trim() !== tag.name) {
                        updateTagMutation.mutate({ tagId: tag.id, name: tempTagName.trim() })
                      }
                      setEditingTagId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (tempTagName.trim() && tempTagName.trim() !== tag.name) {
                          updateTagMutation.mutate({ tagId: tag.id, name: tempTagName.trim() })
                        }
                        setEditingTagId(null)
                      } else if (e.key === 'Escape') {
                        setEditingTagId(null)
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="schema-row-name">{tag.name}</span>
                    <button
                      type="button"
                      aria-label="Rename tag"
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition"
                      onClick={() => {
                        setEditingTagId(tag.id)
                        setTempTagName(tag.name)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}

                <span className="schema-row-key">{tag.key}</span>

                {/* Vertical Tag Color Picker Dropdown */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    ref={(element) => {
                      tagColorTriggerRefs.current[tag.id] = element
                    }}
                    className="schema-tag-color-trigger"
                    onClick={() => setColorPickerTagId(colorPickerTagId === tag.id ? null : tag.id)}
                    style={getTagChipStyle(tag.color)}
                  >
                    <span className="schema-tag-color-swatch" style={getTagDotStyle(tag.color)} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="schema-empty">No tags yet.</div>
          )}
        </div>
      </section>
      {newTagColorOpen && newTagColorRect
        ? createPortal(
            <div
              ref={tagColorMenuRef}
              className="fixed z-[70] flex max-h-48 w-32 flex-col gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
              style={{
                left: newTagColorRect.left,
                top: newTagColorRect.bottom + 6,
              }}
            >
              {TAG_COLOR_PALETTE.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                  onClick={() => {
                    setTagColor(option.key)
                    setNewTagColorOpen(false)
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: option.swatch }}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
      {colorPickerTagId && existingTagColorRect
        ? createPortal(
            <div
              ref={tagColorMenuRef}
              className="fixed z-[70] flex max-h-48 w-32 flex-col gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
              style={{
                left: Math.max(existingTagColorRect.right - 128, 8),
                top: existingTagColorRect.bottom + 6,
              }}
            >
              {TAG_COLOR_PALETTE.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                  onClick={() => {
                    updateTagMutation.mutate({ tagId: colorPickerTagId, color: option.key })
                    setColorPickerTagId(null)
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: option.swatch }}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {/* Card types */}
      <section className="schema-section">
        <div className="schema-section-header">
          <h3 className="schema-section-title">Card types</h3>
          <span className="schema-count">{cardTypes.length}</span>
        </div>
        <form onSubmit={handleCardTypeSubmit} className="schema-inline-form">
          <Input
            onChange={(e) => setCardTypeName(e.target.value)}
            placeholder="New card type…"
            value={cardTypeName}
          />
          <Button type="submit" disabled={!cardTypeName.trim()} size="sm">
            Add
          </Button>
        </form>
        <div className="schema-list">
          {cardTypes.length ? (
            cardTypes.map((ct) => (
              <div key={ct.id} className="schema-row">
                <span className="schema-row-name">{ct.name}</span>
                <span className="schema-row-meta">
                  {ct.propertiesSchema.length} field{ct.propertiesSchema.length !== 1 ? 's' : ''}
                </span>
              </div>
            ))
          ) : (
            <div className="schema-empty">No card types yet.</div>
          )}
        </div>
      </section>

      {/* Board types */}
      <section className="schema-section">
        <div className="schema-section-header">
          <h3 className="schema-section-title">Board types</h3>
          <span className="schema-count">{boardTypes.length}</span>
        </div>
        <form onSubmit={handleBoardTypeSubmit} className="schema-inline-form">
          <Input
            onChange={(e) => setBoardTypeName(e.target.value)}
            placeholder="New board type…"
            value={boardTypeName}
          />
          <Button type="submit" disabled={!boardTypeName.trim()} size="sm">
            Add
          </Button>
        </form>
        <div className="schema-list">
          {boardTypes.length ? (
            boardTypes.map((bt) => (
              <div key={bt.id} className="schema-row">
                <span className="schema-row-name">{bt.name}</span>
                <span className="schema-row-meta">
                  {bt.lifecycleConfig.statuses.length} status{bt.lifecycleConfig.statuses.length !== 1 ? 'es' : ''}
                </span>
              </div>
            ))
          ) : (
            <div className="schema-empty">No board types yet.</div>
          )}
        </div>
      </section>
    </div>
  )
}
