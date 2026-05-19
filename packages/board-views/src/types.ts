import type { ViewRenderProps } from "@plank/plugin-sdk";

export type ViewCard = ViewRenderProps["cards"][number];
export type ViewColumn = ViewRenderProps["columns"][number];

export type CardWithColumn<TCard extends ViewCard = ViewCard> = TCard & {
  resolvedColumnId: string;
};

export type CardGroups<TCard extends ViewCard = ViewCard> = Record<
  string,
  Array<CardWithColumn<TCard>>
>;
