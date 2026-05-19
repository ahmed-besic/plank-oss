import type { ViewRenderProps } from "@plank/plugin-sdk";

export type ColumnData = ViewRenderProps["columns"][number] & {
  orderKey?: string;
};
