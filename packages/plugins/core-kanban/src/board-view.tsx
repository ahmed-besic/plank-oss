import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  DragOverlay,
  useDroppable,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import type { ViewRenderProps } from "@plank/plugin-sdk";
import { Plus } from "lucide-react";
import { CardOverlay, type TagVisual } from "./kanban-cards";
import { ColumnOverlay, SortableColumn, StaticColumn } from "./kanban-column";
import { useKanbanBoardViewState } from "./use-kanban-board-view-state";

const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "column") {
    const columnTargets = args.droppableContainers.filter((container) => {
      const type = container.data.current?.type;
      return type === "column" || type === "column-end";
    });

    return closestCorners({
      ...args,
      droppableContainers: columnTargets,
    });
  }

  return closestCorners(args);
};

function ColumnEndDropZone({ id }: { id: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: "column-end",
    },
  });

  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={[
        "h-[420px] w-16 shrink-0 rounded-xl border border-dashed transition-colors",
        isOver
          ? "border-electric-violet/60 bg-electric-violet/10"
          : "border-border-subtle/70 bg-transparent",
      ].join(" ")}
    />
  );
}

export function BoardView(props: ViewRenderProps) {
  const state = useKanbanBoardViewState(props);
  const activeCardTags: TagVisual[] = state.activeCard
    ? state.activeCard.tagIds.reduce<TagVisual[]>((items, tagId) => {
        const tag = state.tagDefinitionMap.get(tagId);
        if (tag) {
          items.push(tag);
        }
        return items;
      }, [])
    : [];

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <DndContext
        collisionDetection={collisionDetection}
        onDragCancel={state.handleDragCancel}
        onDragEnd={state.handleDragEnd}
        onDragOver={state.handleDragOver}
        onDragStart={state.handleDragStart}
        sensors={state.sensors}
      >
        <div className="flex min-h-[520px] min-w-0 items-start gap-4 overflow-x-hidden pb-4">
          {/* Inbox column — fixed, non-sortable */}
          {state.inboxColumn && (
            <StaticColumn
              cards={state.displayGrouped[state.inboxColumn.id] ?? []}
              column={state.inboxColumn}
              onCreateCard={state.createCardInColumn}
              onOpenCard={props.actions.openCard}
              onSetNewCardPlacement={state.handleSetNewCardPlacement}
              newCardPlacement={
                state.newCardPlacementByColumn[state.inboxColumn.id] ?? "bottom"
              }
              tagDefinitionMap={state.tagDefinitionMap}
              unreadCardIdSet={state.unreadCardIdSet}
            />
          )}

          <SortableContext
            items={state.sortableVisibleColumnIds}
            strategy={horizontalListSortingStrategy}
          >
            {state.sortableVisibleColumnIds.map((columnId) => {
              const column = state.columnById.get(columnId);
              if (!column) {
                return null;
              }

              return (
                <SortableColumn
                  canDelete={props.columns.length > 1}
                  cards={state.displayGrouped[column.id] ?? []}
                  column={column}
                  key={column.id}
                  onCreateCard={state.createCardInColumn}
                  onDeleteColumn={props.actions.deleteColumn}
                  onHideColumn={state.handleHideColumn}
                  onOpenCard={props.actions.openCard}
                  onRenameColumn={props.actions.renameColumn}
                  onSetNewCardPlacement={state.handleSetNewCardPlacement}
                  newCardPlacement={
                    state.newCardPlacementByColumn[column.id] ?? "bottom"
                  }
                  tagDefinitionMap={state.tagDefinitionMap}
                  unreadCardIdSet={state.unreadCardIdSet}
                />
              );
            })}
          </SortableContext>

          {state.dragType === "column" ? (
            <ColumnEndDropZone id={state.columnEndDropId} />
          ) : null}

          <div className="flex shrink-0 items-start pt-3">
            <button
              aria-label="Add column"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border-default text-text-tertiary transition-all duration-200 hover:border-electric-violet/30 hover:bg-electric-violet/[0.02] hover:text-electric-violet"
              onClick={() => void props.actions.createColumn("New list")}
              title="Add column"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {state.hiddenColumns.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 px-2 pb-2">
            <span className="text-[11px] font-medium text-text-tertiary">
              Hidden:
            </span>
            {state.hiddenColumns.map((column) => (
              <button
                key={column.id}
                className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-cloud-white hover:text-text-primary"
                onClick={() => state.handleShowColumn(column.id)}
                type="button"
              >
                Show {column.title}
              </button>
            ))}
          </div>
        ) : null}

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {state.dragType === "card" && state.activeCard ? (
            <CardOverlay
              card={state.activeCard}
              hasUnreadExternal={state.unreadCardIdSet.has(state.activeCard.id)}
              tags={activeCardTags}
            />
          ) : null}

          {state.dragType === "column" && state.activeColumn ? (
            <ColumnOverlay
              cards={state.displayGrouped[state.activeColumn.id] ?? []}
              column={state.activeColumn}
              tagDefinitionMap={state.tagDefinitionMap}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
