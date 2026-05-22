import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardWithColumn } from "@plank/board-views";
import type { CardTypeSummary, WorkspaceMemberSummary } from "@plank/domain";
import { getTagChipStyle } from "@plank/ui";
import { useEffect, useRef, useState } from "react";

export type TagVisual = {
  id: string;
  name: string;
  color?: string;
};

export type PriorityVisual = {
  label: string;
  color?: string;
};

export type AssigneeVisual = {
  id: string;
  label: string;
};

function getPriorityFallbackColor(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "low") return "green";
  if (normalized === "medium" || normalized === "middle") return "amber";
  if (normalized === "high") return "red";
  return "slate";
}

export function getCardPriorityVisual(
  card: Pick<CardWithColumn, "fields" | "typeKey">,
  cardTypes: CardTypeSummary[],
): PriorityVisual | null {
  const rawPriority = card.fields.core.priority;
  if (typeof rawPriority !== "string" || !rawPriority.trim()) {
    return null;
  }

  const priority = rawPriority.trim();
  const definition = cardTypes
    .find((cardType) => cardType.key === card.typeKey)
    ?.propertiesSchema.find((property) => property.key === "priority");
  const option = definition?.config?.options?.find(
    (item) => item.value === priority,
  );

  return {
    label: option?.label ?? priority,
    color: option?.color ?? getPriorityFallbackColor(priority),
  };
}

export function getCardAssigneeVisuals(
  card: Pick<CardWithColumn, "fields" | "typeKey">,
  cardTypes: CardTypeSummary[],
  members: WorkspaceMemberSummary[],
): AssigneeVisual[] {
  const cardType = cardTypes.find((candidate) => candidate.key === card.typeKey);
  if (!cardType) {
    return [];
  }

  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const userIds = new Set<string>();

  for (const definition of cardType.propertiesSchema) {
    if (definition.type !== "user") {
      continue;
    }
    const source =
      definition.config?.source === "custom" ? card.fields.custom : card.fields.core;
    const value = source[definition.key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry) {
          userIds.add(entry);
        }
      }
      continue;
    }
    if (typeof value === "string" && value) {
      userIds.add(value);
    }
  }

  return [...userIds].flatMap((userId) => {
    const member = memberByUserId.get(userId);
    if (!member) {
      return [];
    }
    const label = member.name?.trim() || member.email?.trim() || member.userId;
    return [{ id: member.userId, label }];
  });
}

function clampFourLinesStyle() {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: 4,
    overflow: "hidden",
    overflowWrap: "anywhere" as const,
    maxWidth: "100%",
  };
}

function AdaptiveCardTitle({ title }: { title: string }) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(false);
  }, [title]);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) {
      return;
    }

    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const current = titleRef.current;
        if (!current) {
          return;
        }

        const isOverflowing = current.scrollHeight > current.clientHeight + 1;
        if (isOverflowing && !compact) {
          setCompact(true);
        }
      });
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!compact) {
          measure();
        }
      });
      resizeObserver.observe(element);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
    };
  }, [compact, title]);

  return (
    <p
      ref={titleRef}
      className="min-w-0 max-w-full pr-6 font-semibold tracking-[-0.01em] text-text-primary"
      style={{
        ...clampFourLinesStyle(),
        fontSize: compact ? "11px" : "14px",
        lineHeight: compact ? "15px" : "20px",
      }}
    >
      {title}
    </p>
  );
}

export function PresentationalCard({
  assignees,
  hasUnreadExternal = false,
  optimistic,
  priority,
  tags,
  title,
  transparent = false,
}: {
  assignees?: AssigneeVisual[];
  hasUnreadExternal?: boolean;
  optimistic: boolean;
  priority?: PriorityVisual | null;
  tags: TagVisual[];
  title: string;
  transparent?: boolean;
}) {
  return (
    <div
      className={[
        "group relative flex min-h-[80px] min-w-0 max-w-full flex-col overflow-hidden rounded-xl border bg-cloud-white px-4 py-2.5 text-left shadow-sm",
        transparent
          ? "border-electric-violet/20 opacity-90 shadow-drawer"
          : "border-border-subtle",
      ].join(" ")}
    >
      {hasUnreadExternal ? (
        <span
          aria-label="Unread external changes"
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-sky-500"
          title="Unread external changes"
        />
      ) : null}
      {assignees?.length ? (
        <div className="absolute right-2 bottom-2 flex -space-x-1">
          {assignees.slice(0, 3).map((assignee) => (
            <span
              key={assignee.id}
              title={assignee.label}
              aria-label={assignee.label}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-cloud-white bg-surface-sunken text-[10px] font-bold uppercase text-text-secondary shadow-sm"
            >
              {assignee.label.slice(0, 1)}
            </span>
          ))}
        </div>
      ) : null}
      {optimistic ? (
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-text-placeholder">
          Saving
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <AdaptiveCardTitle title={title} />

        {priority || tags.length ? (
          <div className="flex flex-wrap gap-0.5">
            {priority ? (
              <span
                className="tag-chip"
                style={{
                  ...getTagChipStyle(priority.color ?? "slate"),
                  padding: "1px 6px",
                  fontSize: "10px",
                }}
              >
                {priority.label}
              </span>
            ) : null}
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="tag-chip"
                style={{
                  ...getTagChipStyle(tag.color),
                  padding: "1px 6px",
                  fontSize: "10px",
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SortableCard({
  card,
  cardTypes,
  columnId,
  hasUnreadExternal,
  onOpenCard,
  members,
  tags,
}: {
  card: CardWithColumn;
  cardTypes: CardTypeSummary[];
  columnId: string;
  hasUnreadExternal: boolean;
  onOpenCard: (cardId: string) => void;
  members: WorkspaceMemberSummary[];
  tags: TagVisual[];
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      columnId,
    },
  });

  return (
    <button
      ref={setNodeRef}
      className="min-w-0 max-w-full overflow-hidden rounded-xl text-left"
      onClick={() => onOpenCard(card.id)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.2 : 1,
      }}
      type="button"
      {...attributes}
      {...listeners}
    >
      <PresentationalCard
        assignees={getCardAssigneeVisuals(card, cardTypes, members)}
        hasUnreadExternal={hasUnreadExternal}
        optimistic={card.id.startsWith("optimistic:")}
        priority={getCardPriorityVisual(card, cardTypes)}
        tags={tags}
        title={card.meta.title}
      />
    </button>
  );
}

export function CardOverlay({
  card,
  cardTypes,
  hasUnreadExternal,
  members,
  tags,
}: {
  card: CardWithColumn;
  cardTypes: CardTypeSummary[];
  hasUnreadExternal: boolean;
  members: WorkspaceMemberSummary[];
  tags: TagVisual[];
}) {
  return (
    <div className="w-[268px] max-w-[268px] min-w-0 rotate-1">
      <PresentationalCard
        assignees={getCardAssigneeVisuals(card, cardTypes, members)}
        hasUnreadExternal={hasUnreadExternal}
        optimistic={card.id.startsWith("optimistic:")}
        priority={getCardPriorityVisual(card, cardTypes)}
        tags={tags}
        title={card.meta.title}
        transparent
      />
    </div>
  );
}
