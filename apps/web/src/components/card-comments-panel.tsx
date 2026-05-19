import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { CommentReactionKey, MentionRange } from '@plank/domain'
import { Button, cn } from '@plank/ui'
import { MessageSquare, Pencil, Send, SmilePlus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@convex/_generated/api'
import type { BoardPageData, CardCommentData } from '../lib/types'
import { getMemberDisplayName, getMemberInitials } from '../lib/member-display'
import { usePlankApp } from '../lib/providers'
import {
  getActiveMentionDraft,
  insertMention,
  renderTextWithMentions,
  syncMentionsWithText,
} from './card-comment-mentions'

const REACTION_LABELS: Record<CommentReactionKey, string> = {
  thumbs_up: '👍',
  heart: '❤️',
  eyes: '👀',
  rocket: '🚀',
  laugh: '😂',
}

function formatCommentTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CommentEditor({
  initialMentions,
  initialText,
  members,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  initialText: string
  initialMentions: MentionRange[]
  members: BoardPageData['members']
  submitLabel: string
  onSubmit: (payload: { bodyText: string; mentions: MentionRange[] }) => Promise<void> | void
  onCancel?: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialDraftSignature = useMemo(
    () => JSON.stringify({ text: initialText, mentions: initialMentions }),
    [initialMentions, initialText],
  )
  const [text, setText] = useState(initialText)
  const [mentions, setMentions] = useState(initialMentions)
  const [selection, setSelection] = useState(initialText.length)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)

  useEffect(() => {
    setText(initialText)
    setMentions(initialMentions)
    setSelection(initialText.length)
  }, [initialDraftSignature])

  const mentionDraft = getActiveMentionDraft(text, selection)
  const memberOptions = useMemo(() => {
    const normalizedQuery = mentionDraft?.query.trim().toLowerCase() ?? ''
    return members
      .map((member) => ({
        userId: member.userId,
        label: getMemberDisplayName(member),
      }))
      .filter((member) =>
        normalizedQuery
          ? member.label.toLowerCase().includes(normalizedQuery)
          : true,
      )
      .slice(0, 6)
  }, [members, mentionDraft?.query])

  useEffect(() => {
    if (!mentionDraft || memberOptions.length === 0) {
      setActiveMentionIndex(0)
      return
    }
    setActiveMentionIndex((current) => Math.min(current, memberOptions.length - 1))
  }, [memberOptions.length, mentionDraft?.end, mentionDraft?.query, mentionDraft?.start])

  const handleTextChange = (nextText: string, nextSelection: number) => {
    setMentions((current) =>
      syncMentionsWithText({
        previousText: text,
        nextText,
        previousMentions: current,
      }),
    )
    setText(nextText)
    setSelection(nextSelection)
  }

  const handleInsertMention = (userId: string, label: string) => {
    if (!mentionDraft) {
      return
    }
    const result = insertMention({
      previousText: text,
      nextText: text,
      previousMentions: mentions,
      draft: mentionDraft,
      label,
      userId,
    })
    setText(result.text)
    setMentions(result.mentions)
    setSelection(result.cursor)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  const selectMentionAtIndex = (index: number) => {
    const member = memberOptions[index]
    handleInsertMention(member.userId, member.label)
  }

  const submit = async () => {
    if (!text.trim() || isSubmitting) {
      return
    }
    setIsSubmitting(true)
    try {
      await onSubmit({
        bodyText: text,
        mentions,
      })
      if (!onCancel) {
        setText('')
        setMentions([])
        setSelection(0)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className="min-h-24 w-full resize-y rounded-2xl border border-border-subtle bg-cloud-white px-4 py-3 text-sm text-grape-vine outline-none transition focus:border-electric-violet focus:shadow-glow-violet"
        onChange={(event) =>
          handleTextChange(event.target.value, event.target.selectionStart)
        }
        onClick={(event) => setSelection(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (!mentionDraft || memberOptions.length === 0) {
            return
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveMentionIndex((current) => (current + 1) % memberOptions.length)
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveMentionIndex((current) =>
              current === 0 ? memberOptions.length - 1 : current - 1,
            )
            return
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            selectMentionAtIndex(activeMentionIndex)
          }
        }}
        onKeyUp={(event) => setSelection(event.currentTarget.selectionStart)}
        placeholder="Write a comment. Type @ to mention a teammate."
        value={text}
      />
      {mentionDraft && memberOptions.length ? (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-64 rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated">
          {memberOptions.map((member, index) => (
            <button
              key={member.userId}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-grape-vine transition hover:bg-electric-violet/8',
                index === activeMentionIndex && 'bg-electric-violet/8',
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                handleInsertMention(member.userId, member.label)
              }}
              onMouseEnter={() => setActiveMentionIndex(index)}
              type="button"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric-violet text-xs font-semibold text-white">
                {getMemberInitials({ userId: member.userId, name: member.label })}
              </span>
              <span className="truncate">{member.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-lavender-bloom">Mentions notify teammates.</div>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button onClick={onCancel} size="sm" tone="ghost" type="button">
              Cancel
            </Button>
          ) : null}
          <Button
            disabled={!text.trim() || isSubmitting}
            onClick={() => void submit()}
            size="sm"
            type="button"
          >
            <Send size={14} style={{ marginRight: 6 }} />
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CardCommentsPanel({
  boardId,
  cardId,
  highlightedCommentId,
  isOpen,
  members,
  standalone = false,
  viewerUserId,
  workspaceSlug,
  onClose,
}: {
  workspaceSlug: string
  boardId: string
  cardId?: string | null
  members: BoardPageData['members']
  viewerUserId?: string
  isOpen: boolean
  highlightedCommentId?: string
  standalone?: boolean
  onClose?: () => void
}) {
  const { convexClient, queryClient } = usePlankApp()
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [reactionPickerCommentId, setReactionPickerCommentId] = useState<string | null>(null)
  const commentsOptions = convexQuery(api.comments.listForCard, {
    workspaceSlug,
    boardId: (cardId ? boardId : '') as never,
    cardId: (cardId ?? '') as never,
  })
  const commentsQuery = useQuery({
    ...commentsOptions,
    enabled: isOpen && Boolean(cardId),
  })

  const createComment = useMutation({
    mutationFn: async (payload: { bodyText: string; mentions: MentionRange[] }) =>
      convexClient.mutation(api.comments.create, {
        workspaceSlug,
        boardId: boardId as never,
        cardId: cardId as never,
        bodyText: payload.bodyText,
        mentions: payload.mentions,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey })
    },
  })
  const updateComment = useMutation({
    mutationFn: async (payload: {
      commentId: string
      bodyText: string
      mentions: MentionRange[]
    }) =>
      convexClient.mutation(api.comments.update, {
        workspaceSlug,
        commentId: payload.commentId as never,
        bodyText: payload.bodyText,
        mentions: payload.mentions,
      }),
    onSuccess: async () => {
      setEditingCommentId(null)
      await queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey })
    },
  })
  const deleteComment = useMutation({
    mutationFn: async (commentId: string) =>
      convexClient.mutation(api.comments.deleteComment, {
        workspaceSlug,
        commentId: commentId as never,
      }),
    onSuccess: async () => {
      setEditingCommentId(null)
      await queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey })
    },
  })
  const toggleReaction = useMutation({
    mutationFn: async (payload: { commentId: string; emoji: CommentReactionKey }) =>
      convexClient.mutation(api.comments.toggleReaction, {
        workspaceSlug,
        commentId: payload.commentId as never,
        emoji: payload.emoji,
      }),
    onMutate: async ({ commentId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: commentsOptions.queryKey })
      const previous = queryClient.getQueryData<CardCommentData[]>(commentsOptions.queryKey)
      queryClient.setQueryData<CardCommentData[]>(commentsOptions.queryKey, (current) =>
        (current ?? []).map((comment) => {
          if (comment.id !== commentId) {
            return comment
          }
          const nextViewerReactions = comment.viewerReactions.includes(emoji)
            ? comment.viewerReactions.filter((entry) => entry !== emoji)
            : [...comment.viewerReactions, emoji]
          const currentCount = comment.reactionCounts[emoji] ?? 0
          const nextCount = comment.viewerReactions.includes(emoji)
            ? Math.max(0, currentCount - 1)
            : currentCount + 1
          const nextReactionCounts = { ...comment.reactionCounts }
          if (nextCount === 0) {
            delete nextReactionCounts[emoji]
          } else {
            nextReactionCounts[emoji] = nextCount
          }
          return {
            ...comment,
            viewerReactions: nextViewerReactions,
            reactionCounts: nextReactionCounts,
          }
        }),
      )
      return { previous }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(commentsOptions.queryKey, context.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: commentsOptions.queryKey })
    },
  })

  useEffect(() => {
    if (!highlightedCommentId || !isOpen) {
      return
    }
    const target = document.getElementById(`comment-${highlightedCommentId}`)
    if (!target) {
      return
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.add('ring-2', 'ring-electric-violet/40')
    const timeout = window.setTimeout(() => {
      target.classList.remove('ring-2', 'ring-electric-violet/40')
    }, 1800)
    return () => window.clearTimeout(timeout)
  }, [highlightedCommentId, isOpen, commentsQuery.data])

  useEffect(() => {
    if (!isOpen) {
      setEditingCommentId(null)
      setReactionPickerCommentId(null)
    }
  }, [isOpen, cardId])

  if (!cardId) {
    return (
      <aside
        className={cn(
          'flex h-full w-full flex-col bg-zinc-50/70',
          standalone ? '' : 'border-l border-zinc-200/80',
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-zinc-100 px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <MessageSquare className="h-4 w-4" />
            Comments
          </div>
          {onClose ? (
            <button
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-lavender-bloom">
          Save the card first before starting a discussion.
        </div>
      </aside>
    )
  }

  const comments = (commentsQuery.data ?? []) as CardCommentData[]

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col bg-zinc-50/70',
        standalone ? '' : 'border-l border-zinc-200/80',
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-zinc-100 px-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <MessageSquare className="h-4 w-4" />
          Comments {comments.length}
        </div>
        {onClose ? (
          <button
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {comments.length ? (
          <div className="space-y-0">
            {comments.map((comment) => {
              const member = members.find((entry) => entry.userId === comment.authorUserId)
              const canManage = viewerUserId === comment.authorUserId
              const isEditing = editingCommentId === comment.id
              const visibleReactions = (
                Object.entries(REACTION_LABELS) as Array<[CommentReactionKey, string]>
              ).filter(
                ([emoji]) =>
                  (comment.reactionCounts[emoji] ?? 0) > 0 || comment.viewerReactions.includes(emoji),
              )

              return (
                <article
                  id={`comment-${comment.id}`}
                  key={comment.id}
                  className={cn(
                    'group rounded-2xl bg-white/80 p-1 transition hover:bg-white',
                    highlightedCommentId === comment.id && 'bg-electric-violet/5 ring-1 ring-electric-violet/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-electric-violet text-xs font-semibold text-white">
                        {getMemberInitials(member ?? { userId: comment.authorUserId })}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-grape-vine">
                            {member ? getMemberDisplayName(member) : comment.authorUserId}
                          </div>
                          {!isEditing ? (
                            <>
                              {visibleReactions.map(([emoji, label]) => {
                                const active = comment.viewerReactions.includes(emoji)
                                const count = comment.reactionCounts[emoji] ?? 0
                                return (
                                  <button
                                    key={emoji}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition',
                                      active
                                        ? 'bg-electric-violet/10 text-electric-violet'
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-800',
                                    )}
                                    onClick={() => toggleReaction.mutate({ commentId: comment.id, emoji })}
                                    type="button"
                                  >
                                    <span>{label}</span>
                                    <span>{count}</span>
                                  </button>
                                )
                              })}
                              <div
                                className={cn(
                                  'relative transition-opacity',
                                  reactionPickerCommentId === comment.id
                                    ? 'opacity-100'
                                    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                                )}
                              >
                                <button
                                  className="rounded-full px-1.5 py-0.5 text-sm font-medium text-lavender-bloom transition hover:bg-zinc-100 hover:text-zinc-700"
                                  onClick={() =>
                                    setReactionPickerCommentId((current) =>
                                      current === comment.id ? null : comment.id,
                                    )
                                  }
                                  type="button"
                                >
                                  + React
                                </button>
                                {reactionPickerCommentId === comment.id ? (
                                  <div className="absolute left-0 top-[calc(100%+6px)] z-20 flex items-center gap-1 rounded-full bg-white p-1 shadow-lg ring-1 ring-zinc-200/80">
                                    {(
                                      Object.entries(REACTION_LABELS) as Array<
                                        [CommentReactionKey, string]
                                      >
                                    ).map(([emoji, label]) => (
                                      <button
                                        key={emoji}
                                        className="rounded-full px-2 py-1 text-sm transition hover:bg-zinc-100"
                                        onClick={() => {
                                          toggleReaction.mutate({ commentId: comment.id, emoji })
                                          setReactionPickerCommentId(null)
                                        }}
                                        type="button"
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {canManage ? (
                      <div
                        className={cn(
                          'flex items-center gap-1 transition-opacity',
                          isEditing
                            ? 'opacity-100'
                            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
                        )}
                      >
                        <button
                          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                          onClick={() => {
                            setReactionPickerCommentId(null)
                            setEditingCommentId(isEditing ? null : comment.id)
                          }}
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
                          onClick={() => deleteComment.mutate(comment.id)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="ml-10 mt-0.5 text-sm leading-6 text-zinc-700">
                    {isEditing ? (
                      <CommentEditor
                        initialMentions={comment.mentions}
                        initialText={comment.bodyText}
                        members={members}
                        onCancel={() => setEditingCommentId(null)}
                        onSubmit={async (payload) => {
                          await updateComment.mutateAsync({
                            commentId: comment.id,
                            bodyText: payload.bodyText,
                            mentions: payload.mentions,
                          })
                        }}
                        submitLabel="Save"
                      />
                    ) : (
                      renderTextWithMentions(comment.bodyText, comment.mentions)
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="ml-10 mt-1 flex justify-end text-xs text-lavender-bloom">
                      {formatCommentTime(comment.createdAt)}
                      {comment.editedAt ? ' · Edited' : ''}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-lavender-bloom">
            No comments yet. Start the discussion here.
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 bg-white/80 px-5 py-4 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-lavender-bloom">
          <SmilePlus className="h-3.5 w-3.5" />
          Add comment
        </div>
        <CommentEditor
          initialMentions={[]}
          initialText=""
          members={members}
          onSubmit={async (payload) => {
            await createComment.mutateAsync(payload)
          }}
          submitLabel="Comment"
        />
      </div>
    </aside>
  )
}
