import { useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CardWithColumn } from "@plank/board-views";
import type { CardTypeSummary } from "@plank/domain";
import { Input } from "@plank/ui";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getCardPriorityVisual,
  getCardAssigneeVisuals,
  PresentationalCard,
  SortableCard,
} from "./kanban-cards";
import type { ColumnData } from "./types";
import { SortableContext } from "@dnd-kit/sortable";

export function ColumnOverlay({
  cardTypes,
  cards,
  column,
  members,
  tagDefinitionMap,
}: {
  cardTypes: CardTypeSummary[];
  cards: CardWithColumn[];
  column: ColumnData;
  members: Parameters<typeof getCardAssigneeVisuals>[2];
  tagDefinitionMap: Map<string, { color?: string; id: string; name: string }>;
}) {
  return (
    <div className="w-[300px] max-w-[300px] min-w-[300px] rotate-1 rounded-2xl border border-electric-violet/20 bg-surface-raised p-2 shadow-drawer opacity-90">
      <div className="mb-2 flex items-center justify-between rounded-xl px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripVertical className="h-4 w-4 text-text-tertiary" />
          <span className="truncate text-sm font-semibold tracking-tight text-text-primary">
            {column.title}
          </span>
        </div>
        <MoreHorizontal className="h-4 w-4 text-text-tertiary" />
      </div>

      <div className="flex flex-col gap-2 px-0.5">
        {cards.slice(0, 3).map((card) => (
          <PresentationalCard
            key={card.id}
            assignees={getCardAssigneeVisuals(card, cardTypes, members)}
            optimistic={card.id.startsWith("optimistic:")}
            priority={getCardPriorityVisual(card, cardTypes)}
            tags={card.tagIds
              .map((tagId) => tagDefinitionMap.get(tagId))
              .filter(
                (tag): tag is { color?: string; id: string; name: string } =>
                  Boolean(tag),
              )}
            title={card.meta.title}
          />
        ))}

        {!cards.length ? (
          <div className="rounded-xl border border-dashed border-border-subtle bg-cloud-white/70 px-4 py-6 text-center text-xs font-medium text-text-tertiary">
            Empty column
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Static column (Inbox — not sortable, not deletable) ─── */
export function StaticColumn({
  cardTypes,
  cards,
  column,
  onCreateCard,
  onOpenCard,
  onSetNewCardPlacement,
  newCardPlacement,
  members,
  tagDefinitionMap,
  unreadCardIdSet,
}: {
  cardTypes: CardTypeSummary[];
  cards: CardWithColumn[];
  column: ColumnData;
  onCreateCard: (
    columnId: string,
    title: string,
  ) => Promise<string | undefined>;
  onOpenCard: (cardId: string) => void;
  onSetNewCardPlacement: (
    columnId: string,
    placement: "top" | "bottom",
  ) => void;
  newCardPlacement: "top" | "bottom";
  members: Parameters<typeof getCardAssigneeVisuals>[2];
  tagDefinitionMap: Map<string, { color?: string; id: string; name: string }>;
  unreadCardIdSet: Set<string>;
}) {
  const [draftCardTitle, setDraftCardTitle] = useState("");
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const isSubmittingCreateRef = useRef(false);

  useEffect(() => {
    if (!isCreatingCard) {
      setDraftCardTitle("");
      isSubmittingCreateRef.current = false;
    }
  }, [isCreatingCard]);

  const submitCardCreate = async () => {
    if (isSubmittingCreateRef.current) return;
    isSubmittingCreateRef.current = true;
    const nextTitle = draftCardTitle.trim();
    if (!nextTitle) {
      setIsCreatingCard(false);
      isSubmittingCreateRef.current = false;
      return;
    }
    await onCreateCard(column.id, nextTitle);
    setIsCreatingCard(false);
    isSubmittingCreateRef.current = false;
  };

  return (
    <div className="flex min-h-[420px] min-w-0 max-w-[300px] basis-[280px] flex-1 flex-col">
      <div className="flex h-full flex-col rounded-2xl border border-electric-violet/35 bg-electric-violet/12 p-2 shadow-sm">
        <div className="group mb-2 flex items-center justify-between rounded-xl bg-electric-violet/10 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold tracking-tight text-electric-violet">
              {column.title}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label={`Add card to ${column.title}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-electric-violet/80 transition-all duration-200 hover:bg-electric-violet/15 hover:text-electric-violet"
              onClick={() => {
                setIsCreatingCard(true);
              }}
              title="Add card"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>

            <div className="relative flex items-center">
              <button
                className="rounded-lg p-1 text-electric-violet/80 transition-all duration-200 hover:bg-electric-violet/15 hover:text-electric-violet"
                onClick={() =>
                  onSetNewCardPlacement(
                    column.id,
                    newCardPlacement === "top" ? "bottom" : "top",
                  )
                }
                title="Toggle new card placement"
                type="button"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 px-0.5">
          {isCreatingCard ? (
            <div className="rounded-xl border border-electric-violet/30 bg-cloud-white/95 p-2">
              <Input
                autoFocus
                className="h-8 border-border-subtle text-sm"
                onBlur={() => {
                  void submitCardCreate();
                }}
                onChange={(event) => setDraftCardTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitCardCreate();
                    return;
                  }
                  if (event.key === "Escape") {
                    setIsCreatingCard(false);
                  }
                }}
                placeholder="Card title"
                value={draftCardTitle}
              />
            </div>
          ) : null}

          {cards.map((card) => {
            return (
              <SortableCard
                key={card.id}
                card={card}
                cardTypes={cardTypes}
                columnId={card.resolvedColumnId}
                hasUnreadExternal={unreadCardIdSet.has(card.id)}
                onOpenCard={onOpenCard}
                members={members}
                tags={card.tagIds
                  .map((tagId) => tagDefinitionMap.get(tagId))
                  .filter(
                    (
                      tag,
                    ): tag is { color?: string; id: string; name: string } =>
                      Boolean(tag),
                  )}
              />
            );
          })}

          {!cards.length ? (
            <div className="rounded-xl border border-dashed border-electric-violet/35 bg-electric-violet/8 px-4 py-6 text-center text-xs font-medium text-electric-violet/75">
              Drop cards here
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Sortable column (regular columns) ─── */
export function SortableColumn({
  canDelete,
  cardTypes,
  cards,
  column,
  onCreateCard,
  onDeleteColumn,
  onHideColumn,
  onOpenCard,
  onRenameColumn,
  onSetNewCardPlacement,
  newCardPlacement,
  members,
  tagDefinitionMap,
  unreadCardIdSet,
}: {
  canDelete: boolean;
  cardTypes: CardTypeSummary[];
  cards: CardWithColumn[];
  column: ColumnData;
  onCreateCard: (
    columnId: string,
    title: string,
  ) => Promise<string | undefined>;
  onDeleteColumn: (columnId: string) => Promise<void>;
  onHideColumn: (columnId: string) => void;
  onOpenCard: (cardId: string) => void;
  onRenameColumn: (columnId: string, title: string) => Promise<void>;
  onSetNewCardPlacement: (
    columnId: string,
    placement: "top" | "bottom",
  ) => void;
  newCardPlacement: "top" | "bottom";
  members: Parameters<typeof getCardAssigneeVisuals>[2];
  tagDefinitionMap: Map<string, { color?: string; id: string; name: string }>;
  unreadCardIdSet: Set<string>;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: column.id,
    data: {
      type: "column",
      columnId: column.id,
    },
  });
  const [title, setTitle] = useState(column.title);
  const [draftCardTitle, setDraftCardTitle] = useState("");
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSubmittingCreateRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(column.title);
  }, [column.id, column.title]);

  useEffect(() => {
    if (!isCreatingCard) {
      setDraftCardTitle("");
      isSubmittingCreateRef.current = false;
    }
  }, [isCreatingCard]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const submitCardCreate = async () => {
    if (isSubmittingCreateRef.current) {
      return;
    }
    isSubmittingCreateRef.current = true;

    const nextTitle = draftCardTitle.trim();
    if (!nextTitle) {
      setIsCreatingCard(false);
      isSubmittingCreateRef.current = false;
      return;
    }

    const cardId = await onCreateCard(column.id, nextTitle);
    if (cardId) {
      setIsCreatingCard(false);
    }
    isSubmittingCreateRef.current = false;
  };

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[420px] min-w-0 max-w-[300px] basis-[280px] flex-1 flex-col"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.15 : 1,
      }}
    >
      <div className="flex h-full flex-col rounded-2xl border border-border-subtle bg-surface-raised p-2 shadow-sm">
        <div className="group mb-2 flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-sunken">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              className="cursor-grab rounded p-0.5 text-text-placeholder transition-colors hover:bg-cloud-white hover:text-text-tertiary active:cursor-grabbing"
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <input
              className="kanban-column-title-input min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-semibold tracking-tight text-text-primary shadow-none outline-none ring-0 transition-none focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
              onBlur={() => void onRenameColumn(column.id, title)}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setTitle(column.title);
                  event.currentTarget.blur();
                }
              }}
              value={title}
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label={`Add card to ${column.title}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-all duration-200 hover:bg-cloud-white hover:text-electric-violet"
              onClick={() => {
                setIsCreatingCard(true);
                setIsMenuOpen(false);
              }}
              title="Add card"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>

            <div className="relative flex items-center" ref={menuRef}>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                className="rounded-lg p-1 text-text-tertiary transition-all duration-200 hover:bg-cloud-white hover:text-text-primary"
                onClick={() => setIsMenuOpen((open) => !open)}
                title="Column options"
                type="button"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {isMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-2xl border border-border-subtle bg-cloud-white p-2 shadow-elevated">
                  <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                    Column options
                  </p>
                  <button
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                    onClick={() => {
                      onSetNewCardPlacement(
                        column.id,
                        newCardPlacement === "top" ? "bottom" : "top",
                      );
                      setIsMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span>New cards</span>
                    <span className="text-xs font-semibold text-electric-violet">
                      {newCardPlacement === "top" ? "Top" : "Bottom"}
                    </span>
                  </button>
                  <div className="my-1 border-t border-border-subtle" />
                  <button
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                    onClick={() => {
                      onHideColumn(column.id);
                      setIsMenuOpen(false);
                    }}
                    type="button"
                  >
                    Hide column
                  </button>
                  <button
                    className="mt-1 flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-warning-orange transition-colors hover:bg-warning-orange/10"
                    disabled={!canDelete}
                    onClick={() => {
                      void onDeleteColumn(column.id);
                      setIsMenuOpen(false);
                    }}
                    type="button"
                  >
                    Delete column
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-1 flex-col gap-2 px-0.5">
            {isCreatingCard ? (
              <div className="rounded-xl border border-border-subtle bg-cloud-white p-2">
                <Input
                  autoFocus
                  className="h-8 border-border-subtle text-sm"
                  onBlur={() => {
                    void submitCardCreate();
                  }}
                  onChange={(event) => setDraftCardTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitCardCreate();
                      return;
                    }
                    if (event.key === "Escape") {
                      setIsCreatingCard(false);
                    }
                  }}
                  placeholder="Card title"
                  value={draftCardTitle}
                />
              </div>
            ) : null}

            {cards.map((card) => {
              return (
                <SortableCard
                  key={card.id}
                  card={card}
                  cardTypes={cardTypes}
                  columnId={card.resolvedColumnId}
                  hasUnreadExternal={unreadCardIdSet.has(card.id)}
                  onOpenCard={onOpenCard}
                  members={members}
                  tags={card.tagIds
                    .map((tagId) => tagDefinitionMap.get(tagId))
                    .filter(
                      (
                        tag,
                      ): tag is { color?: string; id: string; name: string } =>
                        Boolean(tag),
                    )}
                />
              );
            })}

            {!cards.length ? (
              <div className="rounded-xl border border-dashed border-border-subtle bg-cloud-white/70 px-4 py-6 text-center text-xs font-medium text-text-tertiary">
                Drop cards here
              </div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
