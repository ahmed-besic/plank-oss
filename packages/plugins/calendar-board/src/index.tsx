import {
  defineClientPlugin,
  type PlankBoardTypeTemplate,
  type ViewRenderProps,
} from "@plank/plugin-sdk";
import { Button } from "@plank/ui";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";

export const calendarBoardTemplate: PlankBoardTypeTemplate = {
  id: "calendar-board:default",
  name: "Calendar Board",
  description: "A date-focused board that opens in a calendar view.",
  defaultLifecycleStatuses: [
    { key: "scheduled", label: "Scheduled", category: "todo", orderKey: "a0" },
    { key: "in_progress", label: "In Progress", category: "active", orderKey: "a1" },
    { key: "done", label: "Done", category: "done", orderKey: "a2" },
  ],
  defaultViewIds: ["calendar-board:month"],
  version: 1,
};

type CalendarConfig = {
  dateFieldKey?: string | null;
};

type DatedCard = ViewRenderProps["cards"][number] & {
  timestamp: number;
  dayKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readCalendarConfig(value: unknown): CalendarConfig {
  if (!isRecord(value)) {
    return {};
  }
  return {
    dateFieldKey:
      typeof value.dateFieldKey === "string" || value.dateFieldKey === null
        ? value.dateFieldKey
        : undefined,
  };
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDayTimestamp(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKeyForTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildMonthDays(month: Date) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function collectDateFields(props: ViewRenderProps) {
  const fieldMap = new Map<string, { key: string; label: string; count: number }>();

  for (const cardType of props.cardTypes) {
    for (const field of cardType.propertiesSchema) {
      const fieldType = String(field.type);
      if (fieldType !== "timestamp" && fieldType !== "date") {
        continue;
      }
      const current = fieldMap.get(field.key);
      if (current) {
        current.count += 1;
      } else {
        fieldMap.set(field.key, {
          key: field.key,
          label: field.name,
          count: 1,
        });
      }
    }
  }

  return [...fieldMap.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function CalendarMonthView(props: ViewRenderProps) {
  const config = readCalendarConfig(props.viewConfig);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const dateFields = useMemo(() => collectDateFields(props), [props.cardTypes]);
  const selectedDateFieldKey = config.dateFieldKey ?? null;
  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);
  const timedCards = useMemo<DatedCard[]>(() => {
    if (!selectedDateFieldKey) {
      return [];
    }

    return props.cards.flatMap((card) => {
      const rawValue = card.properties[selectedDateFieldKey];
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        return [];
      }
      return [
        {
          ...card,
          timestamp: rawValue,
          dayKey: dayKeyForTimestamp(rawValue),
        },
      ];
    });
  }, [props.cards, selectedDateFieldKey]);
  const cardsByDay = useMemo(() => {
    const map = new Map<string, DatedCard[]>();
    for (const card of timedCards) {
      const current = map.get(card.dayKey) ?? [];
      current.push(card);
      map.set(card.dayKey, current);
    }
    return map;
  }, [timedCards]);
  const undatedCards = useMemo(() => {
    if (!selectedDateFieldKey) {
      return props.cards;
    }
    const datedIds = new Set(timedCards.map((card) => card.id));
    return props.cards.filter((card) => !datedIds.has(card.id));
  }, [props.cards, selectedDateFieldKey, timedCards]);

  const updateDateFieldKey = async (dateFieldKey: string | null) => {
    await props.updateViewConfig?.({
      ...(isRecord(props.viewConfig) ? props.viewConfig : {}),
      dateFieldKey,
    });
  };

  const moveCardToDate = async (cardId: string, date: Date) => {
    if (!selectedDateFieldKey) {
      return;
    }
    const card = props.cards.find((entry) => entry.id === cardId);
    if (!card) {
      return;
    }

    setIsSaving(true);
    try {
      await props.actions.updateCard({
        cardId,
        baseUpdatedAt: card.updatedAt,
        propertyUpdates: {
          [selectedDateFieldKey]: startOfDayTimestamp(date),
        },
      });
    } finally {
      setIsSaving(false);
      setDraggingCardId(null);
    }
  };

  if (dateFields.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle bg-cloud-white px-6 py-10 text-center text-sm text-text-tertiary">
        This board does not expose any timestamp fields yet. Add one to a card
        type before using Calendar.
      </div>
    );
  }

  return (
    <div
      className="calendar-board-layout"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <section
        className="rounded-2xl border border-border-subtle bg-cloud-white p-3 shadow-sm"
        style={{ minWidth: 0 }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              size="icon"
              tone="ghost"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {monthLabel(visibleMonth)}
              </p>
              <p className="text-xs text-text-tertiary">
                Drag cards between days to update the selected date field.
              </p>
            </div>
            <Button
              onClick={() =>
                setVisibleMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              size="icon"
              tone="ghost"
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Date field</span>
            <select
              className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary"
              onChange={(event) =>
                void updateDateFieldKey(event.target.value || null)
              }
              value={selectedDateFieldKey ?? ""}
            >
              <option value="">Choose a field</option>
              {dateFields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!selectedDateFieldKey ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-sunken px-6 py-12 text-center">
            <CalendarDays className="mx-auto h-6 w-6 text-electric-violet" />
            <p className="mt-3 text-sm font-semibold text-text-primary">
              Select a date field for this view.
            </p>
            <p className="mt-1 text-sm text-text-tertiary">
              Cards without that property will stay undated until you choose a
              field they expose.
            </p>
          </div>
        ) : (
          <>
            <div
              className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-text-tertiary"
              style={{
                display: "grid",
                gap: 6,
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label} className="py-1">
                  {label}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gap: 6,
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              }}
            >
              {monthDays.map((date) => {
                const key = dayKeyForTimestamp(date.getTime());
                const dayCards = cardsByDay.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const isToday = dayKeyForTimestamp(Date.now()) === key;
                return (
                  <div
                    className={`min-h-[104px] rounded-xl border p-2 transition-colors ${
                      isCurrentMonth
                        ? "border-border-subtle bg-surface-raised"
                        : "border-border-subtle/60 bg-lavender-mist/60"
                    } ${draggingCardId ? "border-electric-violet/30" : ""}`}
                    key={key}
                    style={{
                      minHeight: 104,
                      minWidth: 0,
                    }}
                    onDragOver={(event) => {
                      if (!selectedDateFieldKey) {
                        return;
                      }
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      const cardId = event.dataTransfer.getData("text/calendar-card-id");
                      if (!cardId) {
                        return;
                      }
                      event.preventDefault();
                      void moveCardToDate(cardId, date);
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isToday
                            ? "bg-electric-violet text-white"
                            : isCurrentMonth
                              ? "text-text-primary"
                              : "text-text-tertiary"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {dayCards.length ? (
                        <span className="rounded-full bg-electric-violet/10 px-1.5 py-0.5 text-[10px] font-semibold text-electric-violet">
                          {dayCards.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {dayCards.slice(0, 6).map((card) => (
                        <button
                          className="w-full rounded-lg border border-border-subtle bg-cloud-white px-2 py-1.5 text-left text-[10px] font-medium leading-3.5 text-text-primary transition hover:border-electric-violet/20 hover:bg-electric-violet/[0.02]"
                          draggable
                          key={card.id}
                          onClick={() => props.actions.openCard(card.id)}
                          onDragEnd={() => setDraggingCardId(null)}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/calendar-card-id", card.id);
                            setDraggingCardId(card.id);
                          }}
                          style={{
                            fontSize: "11px",
                            lineHeight: "12px",
                          }}
                          type="button"
                        >
                          {card.meta.title}
                        </button>
                      ))}
                      {dayCards.length > 6 ? (
                        <div className="px-1 text-[10px] font-medium text-text-tertiary">
                          +{dayCards.length - 6} more
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-border-subtle bg-cloud-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">Undated cards</p>
            <p className="text-xs text-text-tertiary">
              Cards missing {selectedDateFieldKey ?? "the selected field"}.
            </p>
          </div>
          <span className="rounded-full bg-lavender-mist px-2.5 py-1 text-xs font-semibold text-text-secondary">
            {undatedCards.length}
          </span>
        </div>
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {undatedCards.length ? (
            undatedCards.slice(0, 12).map((card) => (
              <button
                className="w-full rounded-xl border border-border-subtle px-3 py-2 text-left transition hover:border-electric-violet/20 hover:bg-electric-violet/[0.02]"
                key={card.id}
                onClick={() => props.actions.openCard(card.id)}
                type="button"
              >
                <p
                  className="line-clamp-2 font-medium text-text-primary"
                  style={{
                    fontSize: "11px",
                    lineHeight: "14px",
                  }}
                >
                  {card.meta.title}
                </p>
                <p className="mt-0.5 text-xs text-text-tertiary">{card.typeKey}</p>
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border-subtle px-3 py-6 text-center text-sm text-text-tertiary" style={{ gridColumn: "1 / -1" }}>
              Every card with the selected field is scheduled.
            </div>
          )}
        </div>
        {isSaving ? (
          <p className="mt-3 text-xs font-medium text-electric-violet">
            Updating card date…
          </p>
        ) : null}
      </section>
    </div>
  );
}

export const calendarBoardPlugin = defineClientPlugin(
  {
    id: "calendar-board",
    name: "Calendar Board",
    version: "1.0.0",
    hooks: ["registerView", "registerBoardTypeTemplate"],
    capabilities: ["cards:read", "cards:write", "boardViews:read"],
    trustLevel: "builtin",
    description: "Adds a month calendar view over timestamp fields.",
  },
  ({ registerView }) => {
    registerView({
      id: "calendar-board:month",
      label: "Calendar",
      description: "See cards on a month grid and move them by day.",
      seedMode: "always",
      render: (props) => <CalendarMonthView {...props} />,
    });
  },
);
