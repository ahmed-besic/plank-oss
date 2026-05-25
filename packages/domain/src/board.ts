import { createKeyAfter } from "./order";

export type LifecycleCategory = "todo" | "active" | "done" | "custom";

export interface LifecycleStatus {
  key: string;
  label: string;
  category: LifecycleCategory;
  orderKey: string;
}

export interface BoardColumnMapping {
  id: string;
  statusKey: string;
  orderKey: string;
}

export type BasePropertyType =
  | "text"
  | "date"
  | "select"
  | "user"
  | "number"
  | "relation";

export type PropertyTypeId = BasePropertyType | `${string}:${string}`;

export interface PropertyOption {
  label: string;
  value: string;
  color?: string;
}

export interface PropertyDefinitionConfig {
  options?: PropertyOption[];
  targetBoardId?: string | null;
  allowMultiple?: boolean;
  source?: "core" | "custom";
}

export interface BlockNoteCardBodyDocument {
  type: "blocknote";
  content: Array<Record<string, unknown>>;
}

export type CardBodyDocument = BlockNoteCardBodyDocument;

function createDefaultCardBodyBlock(): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type: "paragraph",
    content: [],
  };
}

function sanitizeBlockNoteContent(
  content: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const sanitizeBlock = (block: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...block };
    if (typeof next.id !== "string" || next.id.length === 0) {
      next.id = crypto.randomUUID();
    }

    if (next.type === "image") {
      const props =
        next.props && typeof next.props === "object"
          ? { ...(next.props as Record<string, unknown>) }
          : {};
      if (typeof props.storageId === "string" && "url" in props) {
        delete props.url;
      }
      next.props = props;
    }

    if (Array.isArray(next.children)) {
      next.children = next.children
        .filter((child): child is Record<string, unknown> => Boolean(child && typeof child === "object"))
        .map((child) => sanitizeBlock(child));
    }

    return next;
  };

  const sanitized = content
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => sanitizeBlock(entry));
  return sanitized.length ? sanitized : [createDefaultCardBodyBlock()];
}

export function createDefaultCardBody(): BlockNoteCardBodyDocument {
  return {
    type: "blocknote",
    content: [createDefaultCardBodyBlock()],
  };
}

export function normalizeCardBody(value: unknown): BlockNoteCardBodyDocument {
  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "blocknote" &&
    "content" in value &&
    Array.isArray(value.content)
  ) {
    return {
      type: "blocknote",
      content: sanitizeBlockNoteContent(value.content as Array<Record<string, unknown>>),
    };
  }

  return createDefaultCardBody();
}

export function createDefaultLifecycleStatuses(): LifecycleStatus[] {
  const defaults: Array<{
    key: string;
    label: string;
    category: LifecycleCategory;
  }> = [
    { key: "backlog", label: "Backlog", category: "todo" },
    { key: "in_progress", label: "In Progress", category: "active" },
    { key: "done", label: "Done", category: "done" },
  ];

  let previousOrderKey: string | undefined;
  return defaults.map((status) => {
    previousOrderKey = createKeyAfter(previousOrderKey);
    return {
      ...status,
      orderKey: previousOrderKey,
    };
  });
}

export function createDefaultBoardColumns(
  statuses: LifecycleStatus[] = createDefaultLifecycleStatuses(),
): BoardColumnMapping[] {
  return statuses.map((status) => ({
    id: status.key,
    statusKey: status.key,
    orderKey: status.orderKey,
  }));
}

export function createSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export type BoardVisibility = "workspace" | "private";

export function getBoardVisibility(board: {
  visibility?: BoardVisibility;
}): BoardVisibility {
  return board.visibility ?? "workspace";
}

export function isPrivateBoard(board: { visibility?: BoardVisibility }): boolean {
  return getBoardVisibility(board) === "private";
}

export function canViewerAccessBoard(
  board: { visibility?: BoardVisibility; createdBy: string },
  viewerUserId: string,
): boolean {
  if (!isPrivateBoard(board)) {
    return true;
  }
  return board.createdBy === viewerUserId;
}
