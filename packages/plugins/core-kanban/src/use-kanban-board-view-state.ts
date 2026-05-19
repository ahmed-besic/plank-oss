import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  Over,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  findColumnForCard,
  useBoardDnDSensors,
  useCardGroups,
  useCardsWithColumns,
  useColumnIds,
  useColumnMap,
  type CardWithColumn,
} from "@plank/board-views";
import type { ViewRenderProps } from "@plank/plugin-sdk";
import { useMemo, useState } from "react";
import type { ColumnData } from "./types";

const INBOX_KEY = "__inbox";
export const COLUMN_END_DROP_ID = "kanban:column-end";

type GroupedCards = Record<string, CardWithColumn[]>;

type DragSnapshot = {
  columnIds: string[];
  grouped: GroupedCards;
};

type DragDraft = {
  type: "card" | "column";
  snapshot: DragSnapshot;
  current: DragSnapshot;
};

type ColumnDropTarget =
  | { kind: "before"; columnId: string }
  | { kind: "end" };

function cloneGrouped(grouped: GroupedCards): GroupedCards {
  const next: GroupedCards = {};
  for (const [columnId, cards] of Object.entries(grouped)) {
    next[columnId] = [...cards];
  }
  return next;
}

function moveColumnInDraft(
  columnIds: string[],
  activeColumnId: string,
  target: ColumnDropTarget,
) {
  if (activeColumnId === INBOX_KEY) {
    return columnIds;
  }

  const activeIndex = columnIds.indexOf(activeColumnId);
  if (activeIndex === -1) {
    return columnIds;
  }

  if (target.kind === "before") {
    if (target.columnId === INBOX_KEY || target.columnId === activeColumnId) {
      return columnIds;
    }

    const targetIndex = columnIds.indexOf(target.columnId);
    if (targetIndex === -1 || targetIndex === activeIndex) {
      return columnIds;
    }

    return arrayMove(columnIds, activeIndex, targetIndex);
  }

  const sortableColumnIds = columnIds.filter((columnId) => columnId !== INBOX_KEY);
  const lastSortableColumnId = sortableColumnIds.at(-1);
  if (!lastSortableColumnId || activeColumnId === lastSortableColumnId) {
    return columnIds;
  }

  const lastSortableIndex = columnIds.lastIndexOf(lastSortableColumnId);
  if (lastSortableIndex === -1 || activeIndex === lastSortableIndex) {
    return columnIds;
  }

  return arrayMove(columnIds, activeIndex, lastSortableIndex);
}

function moveCardInDraft(
  grouped: GroupedCards,
  activeCardId: string,
  targetColumnId: string,
  targetIndex: number,
) {
  const sourceColumnId = findColumnForCard(grouped, activeCardId);
  if (!sourceColumnId) {
    return grouped;
  }

  const sourceCards = grouped[sourceColumnId] ?? [];
  const movingIndex = sourceCards.findIndex((card) => card.id === activeCardId);
  if (movingIndex === -1) {
    return grouped;
  }

  if (sourceColumnId === targetColumnId) {
    const normalizedTargetIndex =
      movingIndex < targetIndex ? targetIndex - 1 : targetIndex;
    if (normalizedTargetIndex === movingIndex) {
      return grouped;
    }

    const nextCards = [...sourceCards];
    const [movingCard] = nextCards.splice(movingIndex, 1);
    nextCards.splice(normalizedTargetIndex, 0, movingCard);

    return {
      ...grouped,
      [sourceColumnId]: nextCards,
    };
  }

  const targetCards = grouped[targetColumnId] ?? [];
  const nextSourceCards = [...sourceCards];
  const [movingCard] = nextSourceCards.splice(movingIndex, 1);
  const nextTargetCards = [...targetCards];
  nextTargetCards.splice(targetIndex, 0, movingCard);

  return {
    ...grouped,
    [sourceColumnId]: nextSourceCards,
    [targetColumnId]: nextTargetCards,
  };
}

function findCardLocation(grouped: GroupedCards, cardId: string) {
  const columnId = findColumnForCard(grouped, cardId);
  if (!columnId) {
    return null;
  }

  const index = (grouped[columnId] ?? []).findIndex((card) => card.id === cardId);
  if (index === -1) {
    return null;
  }

  return {
    columnId,
    index,
  };
}

function areColumnOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areGroupedCardOrdersEqual(
  left: GroupedCards,
  right: GroupedCards,
  columnIds: string[],
) {
  for (const columnId of columnIds) {
    const leftCards = left[columnId] ?? [];
    const rightCards = right[columnId] ?? [];

    if (leftCards.length !== rightCards.length) {
      return false;
    }

    for (let index = 0; index < leftCards.length; index += 1) {
      if (leftCards[index]?.id !== rightCards[index]?.id) {
        return false;
      }
    }
  }

  return true;
}

function resolveColumnDropTarget(over: Over | null): ColumnDropTarget | null {
  if (!over) {
    return null;
  }

  if (over.data.current?.type === "column-end") {
    return { kind: "end" };
  }

  const targetColumnId =
    over.data.current?.type === "column"
      ? String(over.id)
      : typeof over.data.current?.columnId === "string"
        ? over.data.current.columnId
        : null;

  if (!targetColumnId || targetColumnId === INBOX_KEY) {
    return null;
  }

  return {
    kind: "before",
    columnId: targetColumnId,
  };
}

function resolveCardDropTarget(
  grouped: GroupedCards,
  over: Over | null,
  activeCardId?: string,
) {
  if (!over) {
    return null;
  }

  if (over.data.current?.type === "column") {
    const targetColumnId = String(over.id);
    return {
      targetColumnId,
      targetIndex: (grouped[targetColumnId] ?? []).length,
    };
  }

  if (over.data.current?.type !== "card") {
    return null;
  }

  const overCardId = String(over.id);
  const targetColumnId = findColumnForCard(grouped, overCardId);
  if (!targetColumnId) {
    return null;
  }

  const targetCards = grouped[targetColumnId] ?? [];
  const overIndex = targetCards.findIndex((card) => card.id === overCardId);
  if (overIndex === -1) {
    return {
      targetColumnId,
      targetIndex: targetCards.length,
    };
  }

  let targetIndex = overIndex;
  if (activeCardId) {
    const sourceColumnId = findColumnForCard(grouped, activeCardId);
    if (sourceColumnId === targetColumnId) {
      const sourceIndex = (grouped[sourceColumnId] ?? []).findIndex(
        (card) => card.id === activeCardId,
      );
      if (sourceIndex !== -1 && sourceIndex < overIndex) {
        // Same-column downward moves should insert after the hovered card.
        targetIndex = overIndex + 1;
      }
    }
  }

  return {
    targetColumnId,
    targetIndex,
  };
}

function getDefaultPropertyUpdatesForType(
  viewConfig: ViewRenderProps["viewConfig"],
  typeKey: string,
) {
  const rawDefaults = viewConfig?.kanbanDefaultPropertyValuesByType;
  if (!rawDefaults || typeof rawDefaults !== "object") {
    return {};
  }
  const byType = rawDefaults as Record<string, unknown>;
  const typeDefaults = byType[typeKey];
  if (!typeDefaults || typeof typeDefaults !== "object") {
    return {};
  }
  return typeDefaults as Record<string, unknown>;
}

export function useKanbanBoardViewState(props: ViewRenderProps) {
  const sensors = useBoardDnDSensors();

  const inboxVisible = Boolean(props.viewConfig?.inboxVisible);

  const derivedColumns = useMemo<ColumnData[]>(() => {
    const base = props.columns.map((column) => ({
      ...column,
      orderKey: column.orderKey,
    }));

    if (!inboxVisible) {
      return base;
    }

    return [
      {
        id: INBOX_KEY,
        statusKey: INBOX_KEY,
        title: "Inbox",
        orderKey: "a0",
      } as ColumnData,
      ...base,
    ];
  }, [props.columns, inboxVisible]);

  const derivedCards = useMemo(() => {
    if (inboxVisible) {
      return props.cards;
    }

    return props.cards.filter((card) => card.statusKey !== INBOX_KEY);
  }, [props.cards, inboxVisible]);

  const cardsWithColumns = useCardsWithColumns(derivedCards, derivedColumns);
  const serverGrouped = useCardGroups(cardsWithColumns, derivedColumns);
  const serverColumnIds = useColumnIds(derivedColumns);
  const columnById = useColumnMap(derivedColumns);

  const tagDefinitionMap = useMemo(
    () =>
      new Map(
        props.tagDefinitions.map((tagDefinition) => [
          tagDefinition.id,
          {
            id: tagDefinition.id,
            name: tagDefinition.name,
            color: tagDefinition.color,
          },
        ]),
      ),
    [props.tagDefinitions],
  );

  const unreadCardIdSet = useMemo(
    () => new Set(props.ui?.unreadCardIds ?? []),
    [props.ui?.unreadCardIds],
  );

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [dragType, setDragType] = useState<"card" | "column" | null>(null);
  const [dragDraft, setDragDraft] = useState<DragDraft | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [newCardPlacementByColumn, setNewCardPlacementByColumn] = useState<
    Record<string, "top" | "bottom">
  >({});

  const displayGrouped = dragDraft?.current.grouped ?? serverGrouped;
  const displayColumnIds = dragDraft?.current.columnIds ?? serverColumnIds;

  const activeCard = useMemo(() => {
    if (!activeId) {
      return null;
    }

    const cardId = String(activeId);
    for (const cards of Object.values(displayGrouped)) {
      const card = cards.find((candidate) => candidate.id === cardId);
      if (card) {
        return card;
      }
    }

    return cardsWithColumns.find((candidate) => candidate.id === cardId) ?? null;
  }, [activeId, displayGrouped, cardsWithColumns]);

  const activeColumn = useMemo(
    () => (activeId ? (columnById.get(String(activeId)) ?? null) : null),
    [activeId, columnById],
  );

  const validHiddenColumnIds = hiddenColumnIds.filter((columnId) =>
    serverColumnIds.includes(columnId),
  );

  const visibleColumnIds = displayColumnIds.filter(
    (columnId) => !validHiddenColumnIds.includes(columnId),
  );

  const hiddenColumns = displayColumnIds
    .filter((columnId) => validHiddenColumnIds.includes(columnId))
    .map((columnId) => columnById.get(columnId))
    .filter((column): column is ColumnData => column != null);

  const inboxColumn = inboxVisible ? (columnById.get(INBOX_KEY) ?? null) : null;

  const sortableVisibleColumnIds = visibleColumnIds.filter(
    (columnId) => columnId !== INBOX_KEY,
  );

  const createCardInColumn = async (columnId: string, title: string) => {
    const cardId = await props.actions.createCard(title, columnId);
    if (!cardId) {
      return undefined;
    }

    const defaultTypeKey = props.boardType.defaultCardTypeKey;
    if (defaultTypeKey) {
      const defaultPropertyUpdates = getDefaultPropertyUpdatesForType(
        props.viewConfig,
        defaultTypeKey,
      );
      if (Object.keys(defaultPropertyUpdates).length > 0) {
        try {
          await props.actions.updateCard({
            cardId,
            propertyUpdates: defaultPropertyUpdates,
          });
        } catch {
          // Keep card creation successful even if defaults became stale.
        }
      }
    }

    const placement = newCardPlacementByColumn[columnId] ?? "bottom";
    if (placement === "top") {
      const firstCard = (displayGrouped[columnId] ?? [])[0];
      if (firstCard) {
        await props.actions.moveCard(cardId, columnId, undefined, firstCard.orderKey);
      }
    }

    return cardId;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const currentType = event.active.data.current?.type;
    const nextDragType = currentType === "column" ? "column" : "card";
    const snapshot: DragSnapshot = {
      columnIds: [...serverColumnIds],
      grouped: cloneGrouped(serverGrouped),
    };

    setActiveId(event.active.id);
    setDragType(nextDragType);
    setDragDraft({
      type: nextDragType,
      snapshot,
      current: {
        columnIds: [...snapshot.columnIds],
        grouped: cloneGrouped(snapshot.grouped),
      },
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeCardOrColumnId = String(event.active.id);

    setDragDraft((currentDraft) => {
      if (!currentDraft || !event.over) {
        return currentDraft;
      }

      if (currentDraft.type === "column") {
        // Keep column draft stable during drag-over; dnd-kit sortable transforms
        // already provide live visual movement and this avoids over-target oscillation loops.
        return currentDraft;
      }

      const target = resolveCardDropTarget(
        currentDraft.current.grouped,
        event.over,
        activeCardOrColumnId,
      );
      if (!target) {
        return currentDraft;
      }

      const nextGrouped = moveCardInDraft(
        currentDraft.current.grouped,
        activeCardOrColumnId,
        target.targetColumnId,
        target.targetIndex,
      );

      if (nextGrouped === currentDraft.current.grouped) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        current: {
          ...currentDraft.current,
          grouped: nextGrouped,
        },
      };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const activeCardOrColumnId = String(event.active.id);

    try {
      if (!dragDraft) {
        return;
      }

      if (dragDraft.type === "column") {
        if (!event.over) {
          return;
        }

        const target = resolveColumnDropTarget(event.over);
        if (!target) {
          return;
        }
        const finalColumnIds = target
          ? moveColumnInDraft(dragDraft.snapshot.columnIds, activeCardOrColumnId, target)
          : dragDraft.snapshot.columnIds;

        if (areColumnOrdersEqual(dragDraft.snapshot.columnIds, finalColumnIds)) {
          return;
        }

        setDragDraft((currentDraft) => {
          if (!currentDraft || currentDraft.type !== "column") {
            return currentDraft;
          }
          return {
            ...currentDraft,
            current: {
              ...currentDraft.current,
              columnIds: finalColumnIds,
            },
          };
        });

        const sortableFinalColumnIds = finalColumnIds.filter(
          (columnId) => columnId !== INBOX_KEY,
        );

        const orderedColumns = sortableFinalColumnIds
          .map((columnId) => columnById.get(columnId))
          .filter((column): column is ColumnData => column != null);

        const movedIndex = orderedColumns.findIndex(
          (column) => column.id === activeCardOrColumnId,
        );
        if (movedIndex === -1) {
          return;
        }

        await props.actions.reorderColumn(
          activeCardOrColumnId,
          orderedColumns[movedIndex - 1]?.orderKey,
          orderedColumns[movedIndex + 1]?.orderKey,
        );

        return;
      }

      if (!event.over) {
        return;
      }

      const target = resolveCardDropTarget(
        dragDraft.current.grouped,
        event.over,
        activeCardOrColumnId,
      );
      const finalGrouped = target
        ? moveCardInDraft(
            dragDraft.current.grouped,
            activeCardOrColumnId,
            target.targetColumnId,
            target.targetIndex,
          )
        : dragDraft.current.grouped;

      if (
        areGroupedCardOrdersEqual(
          dragDraft.snapshot.grouped,
          finalGrouped,
          dragDraft.snapshot.columnIds,
        )
      ) {
        return;
      }

      const finalLocation = findCardLocation(finalGrouped, activeCardOrColumnId);
      const snapshotLocation = findCardLocation(
        dragDraft.snapshot.grouped,
        activeCardOrColumnId,
      );

      if (!finalLocation || !snapshotLocation) {
        return;
      }

      if (
        finalLocation.columnId === snapshotLocation.columnId &&
        finalLocation.index === snapshotLocation.index
      ) {
        return;
      }

      const destinationCards = finalGrouped[finalLocation.columnId] ?? [];

      await props.actions.moveCard(
        activeCardOrColumnId,
        finalLocation.columnId,
        destinationCards[finalLocation.index - 1]?.orderKey,
        destinationCards[finalLocation.index + 1]?.orderKey,
      );
    } finally {
      setActiveId(null);
      setDragType(null);
      setDragDraft(null);
    }
  };

  const handleHideColumn = (columnId: string) => {
    if (columnId === INBOX_KEY) {
      return;
    }

    setHiddenColumnIds((current) =>
      current.includes(columnId) ? current : [...current, columnId],
    );
  };

  const handleShowColumn = (columnId: string) => {
    setHiddenColumnIds((current) =>
      current.filter((currentId) => currentId !== columnId),
    );
  };

  const handleSetNewCardPlacement = (
    columnId: string,
    placement: "top" | "bottom",
  ) => {
    setNewCardPlacementByColumn((current) => ({
      ...current,
      [columnId]: placement,
    }));
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDragType(null);
    setDragDraft(null);
  };

  return {
    sensors,
    activeCard,
    activeColumn,
    columnById,
    columnEndDropId: COLUMN_END_DROP_ID,
    createCardInColumn,
    displayColumnIds,
    displayGrouped,
    dragType,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    handleHideColumn,
    handleSetNewCardPlacement,
    handleShowColumn,
    hiddenColumns,
    inboxColumn,
    newCardPlacementByColumn,
    sortableVisibleColumnIds,
    tagDefinitionMap,
    unreadCardIdSet,
    visibleColumnIds,
  };
}
