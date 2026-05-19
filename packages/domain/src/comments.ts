import { normalizeCardBody, type CardBodyDocument } from "./board";

export const COMMENT_REACTION_KEYS = [
  "thumbs_up",
  "heart",
  "eyes",
  "rocket",
  "laugh",
] as const;

export type CommentReactionKey = (typeof COMMENT_REACTION_KEYS)[number];

export interface MentionRange {
  userId: string;
  label: string;
  start: number;
  end: number;
}

export interface BodyMention {
  userId: string;
  label: string;
}

export function isCommentReactionKey(
  value: string,
): value is CommentReactionKey {
  return COMMENT_REACTION_KEYS.includes(value as CommentReactionKey);
}

export function getMentionText(label: string) {
  return `@${label}`;
}

export function normalizeMentionRanges(
  text: string,
  mentions: MentionRange[],
): MentionRange[] {
  const seen = new Set<string>();

  return [...mentions]
    .filter((mention) => {
      if (
        typeof mention.userId !== "string" ||
        typeof mention.label !== "string" ||
        typeof mention.start !== "number" ||
        typeof mention.end !== "number"
      ) {
        return false;
      }

      if (
        mention.label.trim().length === 0 ||
        mention.userId.trim().length === 0 ||
        mention.start < 0 ||
        mention.end <= mention.start ||
        mention.end > text.length
      ) {
        return false;
      }

      return text.slice(mention.start, mention.end) === getMentionText(mention.label);
    })
    .sort((left, right) => left.start - right.start)
    .filter((mention) => {
      const key = `${mention.userId}:${mention.start}:${mention.end}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

type BlockNoteInlineNode = {
  type?: unknown;
  props?: Record<string, unknown>;
};

type BlockNoteBlock = {
  children?: BlockNoteBlock[];
  content?: Array<Record<string, unknown> | string>;
};

function walkBodyBlocks(
  blocks: BlockNoteBlock[],
  visitor: (block: BlockNoteBlock) => void,
) {
  for (const block of blocks) {
    visitor(block);
    if (Array.isArray(block.children) && block.children.length > 0) {
      walkBodyBlocks(block.children, visitor);
    }
  }
}

export function extractBodyMentions(body: CardBodyDocument | unknown): BodyMention[] {
  const normalized = normalizeCardBody(body);
  const mentions = new Map<string, BodyMention>();

  walkBodyBlocks(normalized.content as BlockNoteBlock[], (block) => {
    if (!Array.isArray(block.content)) {
      return;
    }

    for (const item of block.content) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const inlineNode = item as BlockNoteInlineNode;
      if (inlineNode.type !== "mention") {
        continue;
      }

      const props =
        inlineNode.props && typeof inlineNode.props === "object"
          ? inlineNode.props
          : undefined;
      if (!props) {
        continue;
      }

      const userId = typeof props.userId === "string" ? props.userId : "";
      const label = typeof props.label === "string" ? props.label : "";
      if (!userId || !label) {
        continue;
      }

      mentions.set(`${userId}:${label}`, { userId, label });
    }
  });

  return [...mentions.values()];
}
