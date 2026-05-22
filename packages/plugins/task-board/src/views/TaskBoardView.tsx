import type { ViewRenderProps } from "@plank/plugin-sdk";
import { Input, getTagChipStyle } from "@plank/ui";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Calendar,
  Plus,
  Tag,
} from "lucide-react";
import { useMemo, useState } from "react";
import { taskCardTypeKey } from "../manifest";

type TaskCard = ViewRenderProps["cards"][number];
type PriorityVisual = {
  label: string;
  color?: string;
};
type AssigneeVisual = {
  id: string;
  label: string;
};

const INBOX_KEY = "__inbox";

function dueDateLabel(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const d = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function dueDateColor(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-text-tertiary";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  if (value < startToday.getTime()) return "text-accent-rose";
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  if (value < startTomorrow.getTime()) return "text-warning-orange";
  return "text-text-tertiary";
}

function getCardPriorityVisual(
  card: TaskCard,
  cardTypes: ViewRenderProps["cardTypes"],
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

function getPriorityFallbackColor(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "low") return "green";
  if (normalized === "medium" || normalized === "middle") return "amber";
  if (normalized === "high") return "red";
  return "slate";
}

function getCardAssigneeVisuals(
  card: TaskCard,
  props: ViewRenderProps,
): AssigneeVisual[] {
  const cardType = props.cardTypes.find((candidate) => candidate.key === card.typeKey);
  if (!cardType) {
    return [];
  }

  const memberByUserId = new Map(props.members.map((member) => [member.userId, member]));
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
    } else if (typeof value === "string" && value) {
      userIds.add(value);
    }
  }

  return [...userIds].flatMap((userId) => {
    const member = memberByUserId.get(userId);
    if (!member) return [];
    const label = member.name?.trim() || member.email?.trim() || member.userId;
    return [{ id: member.userId, label }];
  });
}

function TaskItem({
  card,
  props,
  showDivider = false,
}: {
  card: TaskCard;
  props: ViewRenderProps;
  showDivider?: boolean;
}) {
  const isTaskCard = card.typeKey === taskCardTypeKey;
  const completed = isTaskCard && card.fields.core.completed === true;
  const dueLabel = dueDateLabel(card.fields.core.dueDate);
  const priority = getCardPriorityVisual(card, props.cardTypes);
  const assignees = getCardAssigneeVisuals(card, props);
  const tagById = new Map(
    props.tagDefinitions.map((t) => [t.id, t])
  );
  const description =
    typeof card.fields.core.description === "string" && card.fields.core.description
      ? card.fields.core.description
      : null;

  const toggleCompleted = async () => {
    if (!isTaskCard) return;
    await props.actions.updateCard({
      cardId: card.id,
      baseUpdatedAt: card.updatedAt,
      propertyUpdates: { completed: !completed },
    });
  };

  return (
    <div
      className="group flex items-start gap-3 px-4 py-2.5 hover:bg-surface-raised/60 transition-colors cursor-pointer"
      style={
        showDivider
          ? { borderTop: "1px solid rgba(255, 255, 255, 0.16)" }
          : undefined
      }
      onClick={() => props.actions.openCard(card.id)}
    >
      {isTaskCard ? (
        <button
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
          className="mt-0.5 rounded-full p-0.5 text-text-tertiary transition hover:text-success-green shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            void toggleCompleted();
          }}
          type="button"
        >
          {completed ? (
            <CheckCircle2 className="h-5 w-5 text-success-green" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={[
            "text-[0.95rem] leading-5 truncate",
            completed ? "text-text-tertiary line-through" : "text-text-primary",
          ].join(" ")}
        >
          {card.meta.title}
          {assignees.length ? (
            <span className="ml-2 inline-flex -space-x-1 align-middle">
              {assignees.slice(0, 3).map((assignee) => (
                <span
                  key={assignee.id}
                  title={assignee.label}
                  aria-label={assignee.label}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-surface-raised bg-surface-sunken text-[10px] font-bold uppercase text-text-secondary"
                >
                  {assignee.label.slice(0, 1)}
                </span>
              ))}
            </span>
          ) : null}
        </p>

        <div className="flex items-center gap-3 mt-1 min-w-0 overflow-hidden">
          {dueLabel && (
            <span className={["inline-flex items-center gap-1 text-xs shrink-0", dueDateColor(card.fields.core.dueDate)].join(" ")}>
              <Calendar className="h-3 w-3" />
              {dueLabel}
            </span>
          )}

          {description && (
            <span className="text-xs text-text-tertiary truncate shrink-1">
              {description}
            </span>
          )}

          {(priority || card.tagIds.length > 0) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary shrink-0">
              <Tag className="shrink-0" size={11} />
              <span className="inline-flex items-center gap-1">
                {priority ? (
                  <span
                    className="tag-chip"
                    style={getTagChipStyle(priority.color ?? "slate")}
                  >
                    {priority.label}
                  </span>
                ) : null}
                {card.tagIds.slice(0, 2).map((id) => {
                  const tag = tagById.get(id);
                  if (!tag) {
                    return null;
                  }
                  return (
                    <span
                      key={tag.id}
                      className="tag-chip"
                      style={getTagChipStyle(tag.color)}
                    >
                      {tag.name}
                    </span>
                  );
                })}
                {card.tagIds.length > 2 ? (
                  <span className="text-[11px] text-text-tertiary">
                    +{card.tagIds.length - 2}
                  </span>
                ) : null}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskGroup({
  column,
  cards,
  props,
}: {
  column: ViewRenderProps["columns"][number];
  cards: TaskCard[];
  props: ViewRenderProps;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const createTask = async () => {
    const title = draft.trim();
    if (!title) return;
    await props.actions.createCard(title, column.id, taskCardTypeKey);
    setDraft("");
    setAdding(false);
  };

  return (
    <section className="mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          className="text-text-tertiary hover:text-text-primary transition"
          onClick={() => setCollapsed((s) => !s)}
          type="button"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <h3 className="text-sm font-semibold text-text-primary tracking-tight">
          {column.title}
        </h3>
        <span className="text-xs text-text-tertiary font-medium">
          {cards.length}
        </span>
      </div>

      {!collapsed && (
        <>
          <div>
            {cards.length > 0 ? (
              cards.map((card, index) => (
                <TaskItem
                  card={card}
                  key={card.id}
                  props={props}
                  showDivider={index > 0}
                />
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-text-tertiary">
                No tasks
              </div>
            )}
          </div>

          {/* Add task */}
          {adding ? (
            <div className="flex items-center gap-2 px-4 py-2 mt-1">
              <Circle className="h-5 w-5 text-text-tertiary shrink-0" />
              <Input
                autoFocus
                className="h-9 text-sm bg-transparent border-0 shadow-none focus:ring-0 px-0"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createTask();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setDraft("");
                  }
                }}
                placeholder="Task name"
                value={draft}
              />
            </div>
          ) : (
            <button
              className="flex items-center gap-2 px-4 py-2 mt-1 text-sm text-text-tertiary hover:text-electric-violet transition"
              onClick={() => setAdding(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add task
            </button>
          )}
        </>
      )}
    </section>
  );
}

function InboxSection({ cards, props }: { cards: TaskCard[]; props: ViewRenderProps }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const createTask = async () => {
    const title = draft.trim();
    if (!title) return;
    await props.actions.createCard(title, INBOX_KEY, taskCardTypeKey);
    setDraft("");
    setAdding(false);
  };

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 px-4 py-2">
        <h3 className="text-sm font-semibold text-text-primary tracking-tight">
          Inbox
        </h3>
        <span className="text-xs text-text-tertiary font-medium">
          {cards.length}
        </span>
      </div>

      <div>
        {cards.length > 0 ? (
          cards.map((card, index) => (
            <TaskItem
              card={card}
              key={card.id}
              props={props}
              showDivider={index > 0}
            />
          ))
        ) : (
          <div className="px-4 py-6 text-center text-sm text-text-tertiary">
            No tasks in Inbox
          </div>
        )}
      </div>

      {adding ? (
        <div className="flex items-center gap-2 px-4 py-2 mt-1">
          <Circle className="h-5 w-5 text-text-tertiary shrink-0" />
          <Input
            autoFocus
            className="h-9 text-sm bg-transparent border-0 shadow-none focus:ring-0 px-0 flex-1"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createTask();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder="Task name"
            value={draft}
          />
        </div>
      ) : (
        <button
          className="flex items-center gap-2 px-4 py-2 mt-1 text-sm text-text-tertiary hover:text-electric-violet transition"
          onClick={() => setAdding(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add task
        </button>
      )}
    </section>
  );
}

export function TaskBoardView(props: ViewRenderProps) {
  const [topDraft, setTopDraft] = useState("");
  const [topAdding, setTopAdding] = useState(false);

  const { inboxCards, groupedCardsByColumn } = useMemo(() => {
    const inbox: TaskCard[] = [];
    const grouped = new Map<string, TaskCard[]>();

    for (const col of props.columns) {
      grouped.set(col.statusKey, []);
    }

    for (const card of props.cards) {
      if (!card.parentId && card.statusKey === INBOX_KEY) {
        inbox.push(card);
      } else if (!card.parentId) {
        const list = grouped.get(card.statusKey);
        if (list) {
          list.push(card);
        }
      }
    }

    // Sort each group by orderKey
    for (const list of grouped.values()) {
      list.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
    }
    inbox.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

    return { inboxCards: inbox, groupedCardsByColumn: grouped };
  }, [props.cards, props.columns]);

  const topLevelCards = useMemo(
    () => props.cards.filter((c) => !c.parentId),
    [props.cards]
  );

  const createTopTask = async () => {
    const title = topDraft.trim();
    if (!title) return;
    await props.actions.createCard(title, INBOX_KEY, taskCardTypeKey);
    setTopDraft("");
    setTopAdding(false);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl min-w-0 flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-1">
          {props.viewLabel}
        </h1>
        <p className="text-sm text-text-tertiary mb-4">
          {topLevelCards.length} task{topLevelCards.length !== 1 ? "s" : ""}
        </p>

        {topAdding ? (
          <div className="flex items-center gap-3 border border-border-subtle rounded-xl px-4 py-2.5 bg-cloud-white/40">
            <Circle className="h-5 w-5 text-text-tertiary shrink-0" />
            <Input
              autoFocus
              className="h-9 text-sm bg-transparent border-0 shadow-none focus:ring-0 px-0 flex-1"
              onChange={(e) => setTopDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createTopTask();
                }
                if (e.key === "Escape") {
                  setTopAdding(false);
                  setTopDraft("");
                }
              }}
              placeholder="Task name"
              value={topDraft}
            />
          </div>
        ) : (
          <button
            className="flex items-center gap-2 text-sm text-text-tertiary hover:text-electric-violet transition"
            onClick={() => setTopAdding(true)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        )}
      </div>

      {/* Inbox (ungrouped) */}
      <InboxSection cards={inboxCards} props={props} />

      {/* Groups */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-4 mb-3"
          style={{ height: 2, backgroundColor: "rgba(255, 255, 255, 0.22)" }}
        />
        {props.columns.map((column, index) => (
          <div key={column.statusKey}>
            {index > 0 ? (
              <div
                className="mx-4 mb-3"
                style={{ height: 2, backgroundColor: "rgba(255, 255, 255, 0.22)" }}
              />
            ) : null}
            <TaskGroup
              column={column}
              cards={groupedCardsByColumn.get(column.statusKey) ?? []}
              props={props}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
