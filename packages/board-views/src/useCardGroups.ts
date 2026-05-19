import { compareOrderKeys } from "@plank/domain";
import { useMemo } from "react";
import type { CardGroups, CardWithColumn, ViewCard, ViewColumn } from "./types";

export function resolveCardColumnId(card: ViewCard, columns: ViewColumn[]) {
  return (
    columns.find((column) => column.statusKey === card.statusKey)?.id ??
    columns[0]?.id ??
    ""
  );
}

export function groupCardsByColumn<TCard extends ViewCard>(
  cards: TCard[],
  columns: ViewColumn[],
): CardGroups<TCard> {
  const cardsWithColumns = cards
    .filter((card) => typeof card.id === "string" && card.id.length > 0)
    .map((card) => ({
      ...card,
      resolvedColumnId: resolveCardColumnId(card, columns),
    }));

  return columns.reduce<CardGroups<TCard>>((acc, column) => {
    acc[column.id] = cardsWithColumns
      .filter((card) => card.resolvedColumnId === column.id)
      .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
    return acc;
  }, {});
}

export function findColumnForCard<TCard extends ViewCard>(
  grouped: CardGroups<TCard>,
  cardId: string,
) {
  return Object.entries(grouped).find(([, cards]) =>
    cards.some((card) => card.id === cardId),
  )?.[0];
}

export function useCardsWithColumns<TCard extends ViewCard>(
  cards: TCard[],
  columns: ViewColumn[],
) {
  return useMemo<Array<CardWithColumn<TCard>>>(
    () =>
      cards
        .filter((card) => typeof card.id === "string" && card.id.length > 0)
        .map((card) => ({
          ...card,
          resolvedColumnId: resolveCardColumnId(card, columns),
        })),
    [cards, columns],
  );
}

export function useCardGroups<TCard extends ViewCard>(
  cards: Array<CardWithColumn<TCard>>,
  columns: ViewColumn[],
) {
  return useMemo<CardGroups<TCard>>(() => {
    return columns.reduce<CardGroups<TCard>>((acc, column) => {
      acc[column.id] = cards
        .filter((card) => card.resolvedColumnId === column.id)
        .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
      return acc;
    }, {});
  }, [columns, cards]);
}

export function useColumnIds(columns: ViewColumn[]) {
  return useMemo(() => columns.map((column) => column.id), [columns]);
}

export function useColumnMap<TColumn extends ViewColumn>(columns: TColumn[]) {
  return useMemo(() => new Map(columns.map((column) => [column.id, column])), [
    columns,
  ]);
}
