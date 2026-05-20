import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  listNotificationsForCurrentUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "./features/collaboration/notifications";

export const listMine = query({
  args: {
    workspaceSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: listNotificationsForCurrentUser,
});

export const markRead = mutation({
  args: {
    workspaceSlug: v.string(),
    notificationId: v.id("notifications"),
  },
  handler: markNotificationRead,
});

export const markAllRead = mutation({
  args: {
    workspaceSlug: v.string(),
  },
  handler: markAllNotificationsRead,
});
