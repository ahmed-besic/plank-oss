import { describe, expect, it } from "vitest";
import {
  findColumnForCard,
  groupCardsByColumn,
  resolveCardColumnId,
} from "./useCardGroups";
import type { ViewCard, ViewColumn } from "./types";

const columns: ViewColumn[] = [
  { id: "todo", statusKey: "todo", title: "To do", orderKey: "a0" },
  { id: "done", statusKey: "done", title: "Done", orderKey: "a1" },
];

function createCard(overrides: Partial<ViewCard> = {}): ViewCard {
  return {
    id: "card-1",
    boardId: "board-1",
    typeKey: "task",
    typeSchemaVersion: 1,
    title: "Card",
    meta: { title: "Card" },
    statusKey: "todo",
    orderKey: "a0",
    properties: {},
    fields: { core: {}, custom: {} },
    relations: [],
    tagIds: [],
    body: {
      type: "blocknote",
      content: [],
    },
    createdBy: "user-1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("board view grouping helpers", () => {
  it("falls back to the first column when a card status is unknown", () => {
    expect(
      resolveCardColumnId(createCard({ statusKey: "missing" }), columns),
    ).toBe("todo");
  });

  it("filters invalid ids and sorts grouped cards by order key", () => {
    const grouped = groupCardsByColumn(
      [
        createCard({ id: "", orderKey: "a9" }),
        createCard({ id: "done-2", statusKey: "done", orderKey: "a2" }),
        createCard({ id: "todo-2", statusKey: "todo", orderKey: "a1" }),
        createCard({ id: "todo-1", statusKey: "todo", orderKey: "a0" }),
      ],
      columns,
    );

    expect(grouped.todo.map((card) => card.id)).toEqual(["todo-1", "todo-2"]);
    expect(grouped.done.map((card) => card.id)).toEqual(["done-2"]);
  });

  it("finds the containing column for a card id", () => {
    const grouped = groupCardsByColumn(
      [
        createCard({ id: "todo-1", statusKey: "todo" }),
        createCard({ id: "done-1", statusKey: "done" }),
      ],
      columns,
    );

    expect(findColumnForCard(grouped, "done-1")).toBe("done");
    expect(findColumnForCard(grouped, "missing")).toBeUndefined();
  });

  it("returns groups for every column, including empty ones", () => {
    const grouped = groupCardsByColumn(
      [createCard({ id: "todo-1", statusKey: "todo", orderKey: "a1" })],
      columns,
    );

    expect(Object.keys(grouped)).toEqual(["todo", "done"]);
    expect(grouped.todo.map((card) => card.id)).toEqual(["todo-1"]);
    expect(grouped.done).toEqual([]);
  });
});
