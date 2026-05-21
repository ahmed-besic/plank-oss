import { BlockNoteViewRaw, SuggestionMenuController } from '@blocknote/react'
import type {
  DefaultReactSuggestionItem,
  SuggestionMenuProps,
} from '@blocknote/react'
import {
  Activity,
  AlignLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
  Flag,
  Layers,
  Hash,
  CheckSquare,
  List,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Input,
  getTagChipStyle,
  getTagDotStyle,
} from '@plank/ui'
import { getMemberDisplayName } from '../lib/member-display'
import { clearCardDraft } from './card-drawer-draft'
import { CardDrawerPluginSlots } from './card-drawer-plugin-slots'
import {
  PendingDraftModal,
} from './card-drawer-modals'
import { renderTypedPropertyInput } from './card-drawer-property-input'
import type { CardDrawerProps } from './card-drawer-types'
import { useCardDrawerLayout } from './use-card-drawer-layout'
import { useCardDrawerState } from './use-card-drawer-state'

function toDateInputValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10)
  }
  return ''
}

function formatDueDateValue(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Empty'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

type MetadataPopoverKey = 'status' | 'tags' | 'dueDate' | 'relations' | 'addProperty' | null

function getPropertyIcon(type: string) {
  switch (type) {
    case 'number':
      return <Hash className="h-4 w-4 text-zinc-400" />
    case 'boolean':
      return <CheckSquare className="h-4 w-4 text-zinc-400" />
    case 'select':
      return <List className="h-4 w-4 text-zinc-400" />
    case 'date':
    case 'timestamp':
      return <Calendar className="h-4 w-4 text-zinc-400" />
    default:
      return <Sparkles className="h-4 w-4 text-zinc-400" />
  }
}

type MentionSuggestionItem = DefaultReactSuggestionItem & {
  userId: string
}

function DrawerSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  if (loadingState !== 'loaded') {
    return (
      <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-500 shadow-xl">
        Loading commands…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-500 shadow-xl">
        No commands found
      </div>
    )
  }

  return (
    <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl">
      {items.map((item, index) => (
        <button
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
            selectedIndex === index
              ? 'bg-teal-50 text-teal-900'
              : 'text-zinc-700 hover:bg-zinc-100'
          }`}
          key={`${item.title}-${item.subtext ?? index}`}
          onClick={() => onItemClick?.(item)}
          type="button"
        >
          <span className="shrink-0 text-zinc-500">{item.icon ?? null}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.title}</span>
            {item.subtext ? (
              <span className="block truncate text-xs text-zinc-500">
                {item.subtext}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  )
}

function DrawerMentionMenu(props: SuggestionMenuProps<MentionSuggestionItem>) {
  const { items, loadingState, selectedIndex, onItemClick } = props

  if (loadingState !== 'loaded') {
    return (
      <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-500 shadow-xl">
        Loading teammates…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-500 shadow-xl">
        No teammates found
      </div>
    )
  }

  return (
    <div className="max-h-72 min-w-64 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl">
      {items.map((item, index) => (
        <button
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
            selectedIndex === index
              ? 'bg-teal-50 text-teal-900'
              : 'text-zinc-700 hover:bg-zinc-100'
          }`}
          key={`${item.title}-${item.userId}-${index}`}
          onClick={() => onItemClick?.(item)}
          type="button"
        >
          <span className="shrink-0 text-zinc-500">{item.icon ?? null}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{item.title}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function CardDrawer(props: CardDrawerProps) {
  return <GenericCardDrawer {...props} />
}

function GenericCardDrawer({
  activePluginPropertyTypes,
  activePluginSlots,
  platformServices,
  boardType,
  cardType,
  tagDefinitions,
  members,
  viewerUserId,
  card,
  workspaceSlug,
  commentsOpen = false,
  highlightedCommentId,
  focusTarget,
  renderCollaborationPanel,
  onAddProperty,
  onDeleteCard,
  onDeleteProperty,
  onUpdatePropertyOptions,
  onRequestCardUploadUrl,
  onResolveCardFileUrl,
  onSaveDefaultProperties,
  onOpenCard,
  onToggleComments,
  onCloseComments,
  onClose,
  onSave,
}: CardDrawerProps) {
  const { drawerWidth, startDrawerResize } = useCardDrawerLayout()
  const [activePopover, setActivePopover] = useState<MetadataPopoverKey>(null)
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null)
  const statusPopoverRef = useRef<HTMLDivElement>(null)
  const tagsPopoverRef = useRef<HTMLDivElement>(null)
  const dueDatePopoverRef = useRef<HTMLDivElement>(null)
  const relationsPopoverRef = useRef<HTMLDivElement>(null)
  const addPropertyPopoverRef = useRef<HTMLDivElement>(null)
  const {
    addRelation,
    blockNoteEditor,
    closeAndSave,
    dueDateDefinition,
    dueDateValue,
    expandedPluginSlotId,
    fileInputRef,
    handleTitleChange,
    hasInlineDueDate,
    incomingRelations,
    isAddingProperty,
    markDirty,
    newPropertyName,
    newPropertyType,
    newSelectOptions,
    onImageInputChange,
    outgoingRelations,
    pendingDraft,
    persistedCardId,
    pluginPropertyTypeMap,
    propertyTypeOptions,
    propertyValues,
    relationSearchTerm,
    relationType,
    removePropertyValue,
    removeRelation,
    resetPropertyComposer,
    restoreDraft,
    selectedTagIds,
    setExpandedPluginSlotId,
    setNewPropertyName,
    setNewPropertyType,
    setNewSelectOptions,
    setPendingDraft,
    setRelationSearchTerm,
    setRelationType,
    statusKey,
    statusLabel,
    statusOptions,
    title,
    toggleTag,
    updateStatusKey,
    updatePropertyValue,
    visiblePropertyDefinitions,
    workspaceRelationSearchResults,
  } = useCardDrawerState({
    activePluginPropertyTypes,
    boardType,
    card,
    cardType,
    onClose,
    onRequestCardUploadUrl,
    onResolveCardFileUrl,
    onSave,
    workspaceSlug,
  })

  const handleEditorCopyCapture = useCallback((event: React.ClipboardEvent) => {
    const selectionText = window.getSelection()?.toString()
    if (!selectionText) {
      return
    }
    event.clipboardData.setData(
      'text/plain',
      selectionText.replace(/\\\n/g, '\n'),
    )
    event.preventDefault()
  }, [])

  const selectedTags = useMemo(
    () =>
      selectedTagIds
        .map((tagId) => tagDefinitions.find((tag) => tag.id === tagId))
        .filter((tag): tag is NonNullable<(typeof tagDefinitions)[number]> => Boolean(tag)),
    [selectedTagIds, tagDefinitions],
  )

  useEffect(() => {
    if (!activePopover) {
      return
    }

    const refByPopover = {
      status: statusPopoverRef,
      tags: tagsPopoverRef,
      dueDate: dueDatePopoverRef,
      relations: relationsPopoverRef,
      addProperty: addPropertyPopoverRef,
    } as const

    const onPointerDown = (event: PointerEvent) => {
      const activeRef = refByPopover[activePopover]
      if (activeRef.current?.contains(event.target as Node)) {
        return
      }
      setActivePopover(null)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePopover(null)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [activePopover])

  const prevIsAddingPropertyRef = useRef(isAddingProperty)

  useEffect(() => {
    if (isAddingProperty && !prevIsAddingPropertyRef.current) {
      setActivePopover('addProperty')
    }
    prevIsAddingPropertyRef.current = isAddingProperty
  }, [isAddingProperty])

  useEffect(() => {
    if (activePopover !== 'addProperty' && isAddingProperty) {
      resetPropertyComposer()
    }
  }, [activePopover, isAddingProperty, resetPropertyComposer])

  useEffect(() => {
    const element = titleTextareaRef.current
    if (!element) {
      return
    }
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [title])

  useEffect(() => {
    if (focusTarget === 'description') {
      blockNoteEditor.focus()
    }
  }, [blockNoteEditor, card.id, focusTarget])

  const mentionItems = useMemo(
    () =>
      members.map((member) => ({
        title: getMemberDisplayName(member),
        userId: member.userId,
      })),
    [members],
  )
  const getMentionItems = useCallback(
    async (query: string): Promise<MentionSuggestionItem[]> =>
      mentionItems
        .filter((item) =>
          query.trim()
            ? item.title.toLowerCase().includes(query.trim().toLowerCase())
            : true,
        )
        .slice(0, 6)
        .map((item) => ({
          ...item,
          icon: <MessageSquare className="h-4 w-4" />,
          onItemClick: () => {},
        })),
    [mentionItems],
  )
  const priorityDefinition = useMemo(
    () => visiblePropertyDefinitions.find((def) => def.key === 'priority'),
    [visiblePropertyDefinitions],
  )
  const filteredCustomPropertyDefinitions = useMemo(
    () => visiblePropertyDefinitions.filter((def) => def.key !== 'priority'),
    [visiblePropertyDefinitions],
  )
  const commentPanelWidth = 400

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm"
        onClick={() => {
          void closeAndSave()
        }}
      />

      {commentsOpen ? (
        <>
          <div
            className="fixed bottom-2 top-2 z-50 hidden overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl md:block"
            style={{
              right: `calc(0.5rem + ${drawerWidth}px + 0.75rem)`,
              width: `${commentPanelWidth}px`,
              maxWidth: `calc(100vw - ${drawerWidth}px - 2rem)`,
            }}
          >
            {renderCollaborationPanel?.({
              boardId: card.boardId,
              cardId: persistedCardId,
              highlightedCommentId,
              isOpen: commentsOpen,
              members,
              onClose: onCloseComments,
              standalone: true,
              viewerUserId,
              workspaceSlug,
            })}
          </div>
          <div className="fixed inset-2 z-[60] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl md:hidden">
            {renderCollaborationPanel?.({
              boardId: card.boardId,
              cardId: persistedCardId,
              highlightedCommentId,
              isOpen: commentsOpen,
              members,
              onClose: onCloseComments,
              standalone: true,
              viewerUserId,
              workspaceSlug,
            })}
          </div>
        </>
      ) : null}

      <div
        className="fixed bottom-2 right-2 top-2 z-50 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl"
        style={{
          width: `${drawerWidth}px`,
          maxWidth: 'calc(100vw - 1rem)',
        }}
      >
        <button
          aria-label="Resize drawer"
          className="absolute inset-y-0 left-0 z-10 flex w-4 cursor-col-resize items-center justify-center text-zinc-300 transition hover:bg-zinc-100/60 hover:text-zinc-500"
          onPointerDown={startDrawerResize}
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex h-12 items-center justify-between border-b border-zinc-100 bg-white/80 px-5 text-zinc-500 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">
              {cardType?.name ?? 'Card'}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
            <span className="text-zinc-500">{boardType.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Delete card"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
              onClick={() =>
                void onDeleteCard().then(() => {
                  onClose()
                })
              }
              type="button"
              title="Delete card"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              aria-label="Close"
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              onClick={() => {
                void closeAndSave()
              }}
              type="button"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex h-[calc(100%-48px)] flex-col">
          <div className="flex-1 overflow-y-auto scroll-smooth">
            <CardDrawerPluginSlots
              activePluginSlots={activePluginSlots}
              boardType={boardType}
              card={card}
              cardType={cardType}
              expandedPluginSlotId={expandedPluginSlotId}
              propertyValues={propertyValues}
              selectedTagIds={selectedTagIds}
              services={platformServices}
              setExpandedPluginSlotId={setExpandedPluginSlotId}
              slot="card.header"
              tagDefinitions={tagDefinitions}
              title={title}
              workspaceSlug={workspaceSlug}
            />
            <div className="p-6">
              <textarea
                className="mb-5 w-full resize-none overflow-hidden appearance-none border-none bg-transparent p-0 text-zinc-900 outline-none placeholder:text-zinc-300 focus:ring-0"
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Card title"
                ref={titleTextareaRef}
                rows={1}
                style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                }}
                value={title}
              />

              <div className="mb-5 border-b border-zinc-100 pb-5">
                <CardDrawerPluginSlots
                  activePluginSlots={activePluginSlots}
                  boardType={boardType}
                  card={card}
                  cardType={cardType}
                  expandedPluginSlotId={expandedPluginSlotId}
                  propertyValues={propertyValues}
                  selectedTagIds={selectedTagIds}
                  services={platformServices}
                  setExpandedPluginSlotId={setExpandedPluginSlotId}
                  slot="card.metadata.primary"
                  tagDefinitions={tagDefinitions}
                  title={title}
                  workspaceSlug={workspaceSlug}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {/* Row 1, Cell 1: Status */}
                  <div className="relative" ref={statusPopoverRef}>
                    <button
                      className="group flex flex-col items-start gap-1 text-left"
                      onClick={() =>
                        setActivePopover((current) =>
                          current === 'status' ? null : 'status',
                        )
                      }
                      type="button"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5 text-zinc-400" />
                        Status
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 px-2.5 py-1 text-sm font-medium text-zinc-700 transition">
                        <span className="h-2 w-2 rounded-full bg-zinc-400" />
                        <span>{statusLabel}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                            activePopover === 'status' ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>
                    {activePopover === 'status' ? (
                      <div className="absolute left-0 top-full z-20 mt-2 min-w-[220px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl">
                        {statusOptions.map((status) => {
                          const selected = status.key === statusKey
                          return (
                            <button
                              key={status.key}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                selected
                                  ? 'bg-zinc-100 text-zinc-900'
                                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                              }`}
                              onClick={() => {
                                updateStatusKey(status.key)
                                setActivePopover(null)
                              }}
                              type="button"
                            >
                              <span>{status.label}</span>
                              {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>

                  {/* Row 1, Cell 2: Tags */}
                  <div className="relative" ref={tagsPopoverRef}>
                    <button
                      className="group flex flex-col items-start gap-1 text-left"
                      onClick={() =>
                        setActivePopover((current) =>
                          current === 'tags' ? null : 'tags',
                        )
                      }
                      type="button"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Tag className="h-3.5 w-3.5 text-zinc-400" />
                        Tags
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 transition">
                        {selectedTags.length ? (
                          <span className="flex flex-wrap gap-1">
                            {selectedTags.map((tag) => (
                              <span
                                key={tag.id}
                                className="tag-chip text-xs px-1.5 py-0.5 font-medium"
                                style={getTagChipStyle(tag.color)}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-zinc-400">Empty</span>
                        )}
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                            activePopover === 'tags' ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>
                    {activePopover === 'tags' ? (
                      <div className="absolute left-0 top-full z-20 mt-2 min-w-[240px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl">
                        {tagDefinitions.length ? (
                          tagDefinitions.map((tag) => {
                            const selected = selectedTagIds.includes(tag.id)
                            return (
                              <button
                                key={tag.id}
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                  selected
                                    ? 'bg-zinc-100 text-zinc-900'
                                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                                }`}
                                onClick={() => toggleTag(tag.id)}
                                type="button"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={getTagDotStyle(tag.color)}
                                  />
                                  <span>{tag.name}</span>
                                </span>
                                {selected ? (
                                  <Check className="h-4 w-4 shrink-0" />
                                ) : null}
                              </button>
                            )
                          })
                        ) : (
                          <div className="px-3 py-2 text-sm text-zinc-400">
                            No tags available
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Row 1, Cell 3: Due Date */}
                  <div className="relative" ref={dueDatePopoverRef}>
                    {hasInlineDueDate && dueDateDefinition ? (
                      <>
                        <button
                          className="group flex flex-col items-start gap-1 text-left"
                          onClick={() =>
                            setActivePopover((current) =>
                              current === 'dueDate' ? null : 'dueDate',
                            )
                          }
                          type="button"
                        >
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                            {dueDateDefinition.name}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 transition">
                            <span className={dueDateValue ? 'text-zinc-700 font-medium' : 'text-zinc-400'}>
                              {formatDueDateValue(dueDateValue)}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                                activePopover === 'dueDate' ? 'rotate-180' : ''
                              }`}
                            />
                          </span>
                        </button>
                        {activePopover === 'dueDate' ? (
                          <div className="absolute right-0 top-full z-20 mt-2 min-w-[240px] rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl">
                            <Input
                              className="h-10 rounded-lg border-zinc-200 bg-white px-3 py-2 text-sm shadow-none focus:border-zinc-300 focus:shadow-none"
                              id={`card-drawer-due-date-${card.id}`}
                              onChange={(event) => {
                                const value = event.target.value
                                updatePropertyValue(
                                  dueDateDefinition.key,
                                  value ? new Date(value).getTime() : null,
                                )
                              }}
                              type="date"
                              value={toDateInputValue(dueDateValue)}
                            />
                            <button
                              className="mt-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-800"
                              onClick={() => {
                                updatePropertyValue(dueDateDefinition.key, null)
                                setActivePopover(null)
                              }}
                              type="button"
                            >
                              Clear date
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="opacity-50 pointer-events-none flex flex-col items-start gap-1">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                          Due Date
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1 text-sm text-zinc-400">
                          <span>Not configured</span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Row 2, Cell 1: Priority */}
                  {priorityDefinition ? (
                    <div className="relative flex flex-col items-start gap-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Flag className="h-3.5 w-3.5 text-zinc-400" />
                        Priority
                      </span>
                      <div className="mt-0">
                        {renderTypedPropertyInput({
                          definition: priorityDefinition,
                          members,
                          pluginPropertyTypeMap,
                          value: propertyValues[priorityDefinition.key],
                          onUpdateOptions: (options: Array<{ color?: string; label: string; value: string }>) => {
                            void onUpdatePropertyOptions(
                              priorityDefinition.key,
                              options,
                              cardType?.id,
                            ).then(() => {
                              markDirty()
                            })
                          },
                          onChange: (value: unknown) =>
                            updatePropertyValue(priorityDefinition.key, value),
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="relative opacity-50 pointer-events-none flex flex-col items-start gap-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Flag className="h-3.5 w-3.5 text-zinc-400" />
                        Priority
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1 text-sm text-zinc-400">
                        <span>Not configured</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      </span>
                    </div>
                  )}

                  {/* Row 2, Cell 2: Relations */}
                  <div className="relative" ref={relationsPopoverRef}>
                    <button
                      className="group flex flex-col items-start gap-1 text-left"
                      onClick={() =>
                        setActivePopover((current) =>
                          current === 'relations' ? null : 'relations',
                        )
                      }
                      type="button"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <Link2 className="h-3.5 w-3.5 text-zinc-400" />
                        Relations
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700 transition">
                        <span className="font-medium text-zinc-700">
                          {outgoingRelations.length + incomingRelations.length} linked
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                            activePopover === 'relations' ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>
                    {activePopover === 'relations' ? (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full z-20 mt-2 w-[360px] max-w-[90vw] rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl">
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Linked Cards
                          </h4>
                          <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                            {outgoingRelations.length || incomingRelations.length ? (
                              <>
                                {outgoingRelations.map((relation) => (
                                  <div
                                    key={`outgoing-${relation.type}-${relation.cardId}`}
                                    className="rounded-lg border border-zinc-200 bg-white p-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                                          {relation.displayType}
                                        </p>
                                        <p className="truncate text-xs font-semibold text-zinc-800">
                                          {relation.title}
                                        </p>
                                        <p className="truncate text-[11px] text-zinc-500">
                                          {relation.boardName}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 gap-1">
                                        <Button
                                          onClick={() => {
                                            onOpenCard(relation.cardId, relation.boardId)
                                            setActivePopover(null)
                                          }}
                                          size="sm"
                                          tone="ghost"
                                        >
                                          Open
                                        </Button>
                                        <button
                                          aria-label="Remove relation"
                                          className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                                          onClick={() =>
                                            removeRelation.mutate({
                                              type: relation.type,
                                              targetCardId: relation.cardId,
                                            })
                                          }
                                          type="button"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {incomingRelations.map((relation) => (
                                  <div
                                    key={`incoming-${relation.type}-${relation.cardId}`}
                                    className="rounded-lg border border-dashed border-zinc-200 bg-white p-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                                          {relation.displayType}
                                        </p>
                                        <p className="truncate text-xs font-semibold text-zinc-800">
                                          {relation.title}
                                        </p>
                                        <p className="truncate text-[11px] text-zinc-500">
                                          {relation.boardName}
                                        </p>
                                      </div>
                                      <Button
                                        onClick={() => {
                                          onOpenCard(relation.cardId, relation.boardId)
                                          setActivePopover(null)
                                        }}
                                        size="sm"
                                        tone="ghost"
                                      >
                                        Open
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </>
                            ) : (
                              <p className="text-xs text-zinc-400 italic">No relations yet.</p>
                            )}
                          </div>

                          <div className="border-t border-zinc-100 pt-3">
                            <div className="grid gap-1.5 grid-cols-[110px_minmax(0,1fr)]">
                              <select
                                className="min-w-0 rounded-md border border-ghost-gray bg-cloud-white px-2 py-1 text-xs text-grape-vine outline-none transition focus:border-electric-violet focus:shadow-subtle"
                                onChange={(event) =>
                                  setRelationType(
                                    event.target.value as
                                      | 'relates_to'
                                      | 'blocked_by'
                                      | 'references',
                                  )
                                }
                                value={relationType}
                              >
                                <option value="relates_to">Relates to</option>
                                <option value="blocked_by">Blocked by</option>
                                <option value="references">References</option>
                              </select>
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                                <Input
                                  className="pl-7 h-8 text-xs py-1 rounded-md"
                                  onChange={(event) =>
                                    setRelationSearchTerm(event.target.value)
                                  }
                                  placeholder="Search cards..."
                                  value={relationSearchTerm}
                                />
                              </div>
                            </div>

                            {relationSearchTerm.trim().length > 0 ? (
                              <div className="mt-2 space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                                {workspaceRelationSearchResults.length ? (
                                  workspaceRelationSearchResults.map((result) => {
                                    const isLinked = outgoingRelations.some(
                                      (relation) =>
                                        relation.type === relationType &&
                                        relation.cardId === result.id,
                                    )
                                    return (
                                      <div
                                        key={result.id}
                                        className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white p-1.5"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-[11px] font-medium text-zinc-800">
                                            {result.title}
                                          </p>
                                          <p className="text-[10px] text-zinc-500">
                                            {result.boardName}
                                          </p>
                                        </div>
                                        <Button
                                          disabled={isLinked || addRelation.isPending}
                                          onClick={() =>
                                            addRelation.mutate({
                                              type: relationType,
                                              targetCardId: result.id,
                                            })
                                          }
                                          size="sm"
                                          tone="ghost"
                                        >
                                          {isLinked ? 'Linked' : 'Add'}
                                        </Button>
                                      </div>
                                    )
                                  })
                                ) : (
                                  <p className="text-xs text-zinc-400">
                                    No cards match that search.
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Row 2, Cell 3: Type */}
                  <div className="relative flex flex-col items-start gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      <Layers className="h-3.5 w-3.5 text-zinc-400" />
                      Type
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700 font-medium">
                      <span>{cardType?.name ?? 'Unknown type'}</span>
                    </span>
                  </div>

                  {/* Row 3+: Other dynamic properties */}
                  {filteredCustomPropertyDefinitions.map((definition) => (
                    <div key={definition.key} className="relative flex flex-col items-start gap-1">
                      <div className="flex items-center justify-between gap-2 w-full h-7">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider truncate">
                          {getPropertyIcon(definition.type)}
                          <span className="truncate">{definition.name}</span>
                        </span>
                        {typeof definition.config === 'object' &&
                        (definition.config as Record<string, unknown>).source === 'custom' ? (
                          <button
                            aria-label={`Delete ${definition.name} property`}
                            className="inline-flex shrink-0 items-center rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                            onClick={() =>
                              void onDeleteProperty(
                                definition.key,
                                cardType?.id,
                              ).then(() => {
                                removePropertyValue(definition.key)
                              })
                            }
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-0">
                        {renderTypedPropertyInput({
                          definition,
                          members,
                          pluginPropertyTypeMap,
                          value: propertyValues[definition.key],
                          onUpdateOptions: (options: Array<{ color?: string; label: string; value: string }>) => {
                            void onUpdatePropertyOptions(
                              definition.key,
                              options,
                              cardType?.id,
                            ).then(() => {
                              markDirty()
                            })
                          },
                          onChange: (value: unknown) =>
                            updatePropertyValue(definition.key, value),
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Add Property slot inside the grid */}
                  <div className="relative flex flex-col items-start gap-1" ref={addPropertyPopoverRef}>
                    <div className="flex items-center h-7">
                      <button
                        className="group flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-600 uppercase tracking-wider transition"
                        onClick={() =>
                          setActivePopover((current) =>
                            current === 'addProperty' ? null : 'addProperty',
                          )
                        }
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-400 transition" />
                        Add property
                      </button>
                    </div>
                    {activePopover === 'addProperty' && (
                      <div className="absolute left-0 top-full z-20 mt-1.5 w-[260px] p-2.5 rounded-xl border border-zinc-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                          New Property
                        </span>
                        <div className="grid gap-1.5 w-full">
                          <input
                            className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none transition focus:ring-1 focus:ring-zinc-300 placeholder:text-zinc-400"
                            onChange={(event) => setNewPropertyName(event.target.value)}
                            placeholder="Property name"
                            value={newPropertyName}
                            autoFocus
                          />
                          <div className="relative w-full">
                            <select
                              className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 outline-none transition focus:ring-1 focus:ring-zinc-300 appearance-none pr-8 cursor-pointer"
                              onChange={(event) => setNewPropertyType(event.target.value)}
                              value={newPropertyType}
                            >
                              {propertyTypeOptions.map((propertyType) => (
                                <option key={propertyType.id} value={propertyType.id}>
                                  {propertyType.label}
                                </option>
                              ))}
                              <option value="boolean">Boolean</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                          </div>
                        </div>

                        {newPropertyType === 'select' ? (
                          <textarea
                            className="mt-1.5 min-h-14 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none transition focus:ring-1 focus:ring-zinc-300 placeholder:text-zinc-400 resize-none"
                            onChange={(event) => setNewSelectOptions(event.target.value)}
                            placeholder={'Options (one per line)\nBacklog\nIn Progress\nDone'}
                            value={newSelectOptions}
                          />
                        ) : null}

                        <div className="flex items-center gap-1.5 w-full mt-2.5">
                          <button
                            className="flex-1 inline-flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white px-2 py-1.5 text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                            disabled={!newPropertyName.trim() || !cardType}
                            onClick={() => {
                              const options =
                                newPropertyType === 'select'
                                  ? newSelectOptions
                                      .split('\n')
                                      .map((line) => line.trim())
                                      .filter((line) => line.length > 0)
                                      .map((label) => ({
                                        label,
                                        value: label
                                          .toLowerCase()
                                          .replace(/[^a-z0-9]+/g, '_')
                                          .replace(/^_+|_+$/g, ''),
                                      }))
                                  : []
                              void onAddProperty(
                                newPropertyName,
                                newPropertyType,
                                options.length ? { options } : {},
                                cardType?.id,
                              ).then(() => {
                                resetPropertyComposer()
                                setActivePopover(null)
                              })
                            }}
                            type="button"
                          >
                            Add
                          </button>
                          <button
                            className="flex-1 inline-flex items-center justify-center rounded-lg bg-zinc-200/80 hover:bg-zinc-200 text-zinc-700 px-2 py-1.5 text-xs font-semibold transition active:scale-[0.98]"
                            onClick={() => {
                              resetPropertyComposer()
                              setActivePopover(null)
                            }}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {cardType?.key && onSaveDefaultProperties ? (
                  <div className="mt-4 flex justify-end">
                    <Button
                      className="min-h-0 px-2 py-1 text-xs"
                      onClick={() =>
                        void onSaveDefaultProperties(cardType.key, propertyValues)
                      }
                      tone="ghost"
                    >
                      Save properties as board default
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-semibold text-zinc-800">
                    <AlignLeft className="h-4 w-4 text-zinc-400" />
                    Description
                  </h3>
                  <div className="flex items-center gap-2">
                    <CardDrawerPluginSlots
                      activePluginSlots={activePluginSlots}
                      boardType={boardType}
                      card={card}
                      cardType={cardType}
                      expandedPluginSlotId={expandedPluginSlotId}
                      propertyValues={propertyValues}
                      selectedTagIds={selectedTagIds}
                      services={platformServices}
                      setExpandedPluginSlotId={setExpandedPluginSlotId}
                      slot="card.body.tools"
                      tagDefinitions={tagDefinitions}
                      title={title}
                      workspaceSlug={workspaceSlug}
                    />
                    <button
                      className="rounded px-2 py-1 text-xs font-medium text-text-tertiary transition hover:bg-white hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!persistedCardId}
                      onClick={onToggleComments}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Comments
                      </span>
                    </button>
                    <button
                      className="rounded px-2 py-1 text-xs font-medium text-text-tertiary transition hover:bg-white hover:text-text-primary"
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Add image
                      </span>
                    </button>
                  </div>
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={onImageInputChange}
                    ref={fileInputRef}
                    type="file"
                  />
                </div>
                <BlockNoteViewRaw
                  className="card-drawer-editor"
                  editor={blockNoteEditor}
                  onCopyCapture={handleEditorCopyCapture}
                  onChange={markDirty}
                  theme="light"
                >
                  <SuggestionMenuController
                    suggestionMenuComponent={DrawerSlashMenu}
                    triggerCharacter="/"
                  />
                  <SuggestionMenuController
                    getItems={getMentionItems}
                    onItemClick={(item) => {
                      blockNoteEditor.insertInlineContent([
                        {
                          type: 'mention',
                          props: {
                            userId: item.userId,
                            label: item.title,
                          },
                        } as never,
                        ' ',
                      ])
                      markDirty()
                    }}
                    suggestionMenuComponent={DrawerMentionMenu}
                    triggerCharacter="@"
                  />
                </BlockNoteViewRaw>
              </div>
            </div>
          </div>

          <CardDrawerPluginSlots
            activePluginSlots={activePluginSlots}
            boardType={boardType}
            card={card}
            cardType={cardType}
            expandedPluginSlotId={expandedPluginSlotId}
            propertyValues={propertyValues}
            selectedTagIds={selectedTagIds}
            services={platformServices}
            setExpandedPluginSlotId={setExpandedPluginSlotId}
            slot="card.sidebar.panels"
            tagDefinitions={tagDefinitions}
            title={title}
            workspaceSlug={workspaceSlug}
          />
          <CardDrawerPluginSlots
            activePluginSlots={activePluginSlots}
            boardType={boardType}
            card={card}
            cardType={cardType}
            expandedPluginSlotId={expandedPluginSlotId}
            propertyValues={propertyValues}
            selectedTagIds={selectedTagIds}
            services={platformServices}
            setExpandedPluginSlotId={setExpandedPluginSlotId}
            slot="card.footer.activity"
            tagDefinitions={tagDefinitions}
            title={title}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>

      <PendingDraftModal
        onOpenLatest={() => {
          clearCardDraft(card.id)
          setPendingDraft(null)
        }}
        onRestoreDraft={() => {
          if (pendingDraft) {
            void restoreDraft(pendingDraft.payload)
          }
        }}
        pendingDraft={pendingDraft}
      />
    </>
  )
}
