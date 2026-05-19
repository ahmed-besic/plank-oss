import { v } from "convex/values";

export const behaviorTargetTypeValidator = v.union(
  v.literal("workspace"),
  v.literal("boardType"),
  v.literal("board"),
  v.literal("cardType"),
  v.literal("tag"),
);

export const simulateEventInputValidator = v.union(
  v.object({
    name: v.literal("card.created"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
  }),
  v.object({
    name: v.literal("card.updated"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
    changedPropertyKeys: v.optional(v.array(v.string())),
    previousProperties: v.optional(v.record(v.string(), v.any())),
  }),
  v.object({
    name: v.literal("card.moved"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
    previousStatusKey: v.string(),
    nextStatusKey: v.string(),
  }),
  v.object({
    name: v.literal("card.deleted"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
  }),
  v.object({
    name: v.literal("tag.applied"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
    tagKey: v.string(),
  }),
  v.object({
    name: v.literal("property.changed"),
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
    changedPropertyKeys: v.array(v.string()),
    previousProperties: v.optional(v.record(v.string(), v.any())),
  }),
);
