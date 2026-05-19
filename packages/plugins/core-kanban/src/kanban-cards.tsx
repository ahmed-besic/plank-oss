import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardWithColumn } from "@plank/board-views";
import { getTagChipStyle } from "@plank/ui";
import { useEffect, useRef, useState } from "react";

export type TagVisual = {
  id: string;
  name: string;
  color?: string;
};

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
  hasUnreadExternal = false,
  optimistic,
  tags,
  title,
  transparent = false,
}: {
  hasUnreadExternal?: boolean;
  optimistic: boolean;
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
      {optimistic ? (
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-text-placeholder">
          Saving
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <AdaptiveCardTitle title={title} />

        {tags.length ? (
          <div className="flex flex-wrap gap-0.5">
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
  columnId,
  hasUnreadExternal,
  onOpenCard,
  tags,
}: {
  card: CardWithColumn;
  columnId: string;
  hasUnreadExternal: boolean;
  onOpenCard: (cardId: string) => void;
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
        hasUnreadExternal={hasUnreadExternal}
        optimistic={card.id.startsWith("optimistic:")}
        tags={tags}
        title={card.meta.title}
      />
    </button>
  );
}

export function CardOverlay({
  card,
  hasUnreadExternal,
  tags,
}: {
  card: CardWithColumn;
  hasUnreadExternal: boolean;
  tags: TagVisual[];
}) {
  return (
    <div className="w-[268px] max-w-[268px] min-w-0 rotate-1">
      <PresentationalCard
        hasUnreadExternal={hasUnreadExternal}
        optimistic={card.id.startsWith("optimistic:")}
        tags={tags}
        title={card.meta.title}
        transparent
      />
    </div>
  );
}
