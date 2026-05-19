import { getMentionText, normalizeMentionRanges  } from '@plank/domain'
import type {MentionRange} from '@plank/domain';
import type { ReactNode } from 'react'

export type MentionDraft = {
  start: number
  end: number
  query: string
}

export function getActiveMentionDraft(text: string, cursor: number): MentionDraft | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const segment = text.slice(0, safeCursor)
  const atIndex = segment.lastIndexOf('@')
  if (atIndex < 0) {
    return null
  }

  const prefix = atIndex === 0 ? '' : segment.charAt(atIndex - 1)
  if (prefix && !/\s|[([{"'`]/.test(prefix)) {
    return null
  }

  const query = segment.slice(atIndex + 1)
  if (/[\r\n]/.test(query) || /\s/.test(query)) {
    return null
  }

  return {
    start: atIndex,
    end: safeCursor,
    query,
  }
}

export function syncMentionsWithText({
  nextText,
  previousMentions,
  previousText,
}: {
  previousText: string
  nextText: string
  previousMentions: MentionRange[]
}) {
  let prefix = 0
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText.charAt(prefix) === nextText.charAt(prefix)
  ) {
    prefix += 1
  }

  let previousSuffix = previousText.length
  let nextSuffix = nextText.length
  while (
    previousSuffix > prefix &&
    nextSuffix > prefix &&
    previousText.charAt(previousSuffix - 1) === nextText.charAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1
    nextSuffix -= 1
  }

  const delta = nextText.length - previousText.length
  const shifted = previousMentions
    .map((mention) => {
      if (mention.end <= prefix) {
        return mention
      }

      if (mention.start >= previousSuffix) {
        return {
          ...mention,
          start: mention.start + delta,
          end: mention.end + delta,
        }
      }

      return null
    })
    .filter((mention): mention is MentionRange => Boolean(mention))

  return normalizeMentionRanges(nextText, shifted)
}

export function insertMention({
  draft,
  label,
  nextText,
  previousMentions,
  previousText,
  userId,
}: {
  previousText: string
  nextText: string
  previousMentions: MentionRange[]
  draft: MentionDraft
  label: string
  userId: string
}) {
  const mentionText = `${getMentionText(label)} `
  const replacedText =
    nextText.slice(0, draft.start) + mentionText + nextText.slice(draft.end)
  const mentions = syncMentionsWithText({
    previousText,
    nextText: replacedText,
    previousMentions,
  })

  const start = draft.start
  const end = draft.start + mentionText.length - 1
  return {
    text: replacedText,
    cursor: draft.start + mentionText.length,
    mentions: normalizeMentionRanges(replacedText, [
      ...mentions,
      {
        userId,
        label,
        start,
        end,
      },
    ]),
  }
}

export function renderTextWithMentions(
  text: string,
  mentions: MentionRange[],
): ReactNode[] {
  const normalizedMentions = normalizeMentionRanges(text, mentions)
  const output: ReactNode[] = []
  let cursor = 0

  normalizedMentions.forEach((mention, index) => {
    if (mention.start > cursor) {
      output.push(text.slice(cursor, mention.start))
    }
    output.push(
      <span
        key={`${mention.userId}:${mention.start}:${index}`}
        className="rounded-md bg-electric-violet/10 px-1 py-0.5 font-medium text-electric-violet"
      >
        {text.slice(mention.start, mention.end)}
      </span>,
    )
    cursor = mention.end
  })

  if (cursor < text.length) {
    output.push(text.slice(cursor))
  }

  return output
}
