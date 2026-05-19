import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const inviteRole = v.union(v.literal("admin"), v.literal("member"));
const extensionStatus = v.union(v.literal("enabled"), v.literal("disabled"));
const lifecycleCategory = v.union(
  v.literal("todo"),
  v.literal("active"),
  v.literal("done"),
  v.literal("custom"),
);

const lifecycleStatus = v.object({
  key: v.string(),
  label: v.string(),
  category: lifecycleCategory,
  orderKey: v.string(),
});

const fieldNamespace = v.union(v.literal("core"), v.literal("custom"));
const scalarFieldType = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("timestamp"),
);

const cardFieldManifest = v.object({
  key: v.string(),
  label: v.string(),
  valueType: scalarFieldType,
  required: v.optional(v.boolean()),
  defaultValue: v.optional(v.any()),
  enumValues: v.optional(v.array(v.string())),
  enumOptions: v.optional(
    v.array(
      v.object({
        label: v.string(),
        value: v.string(),
        color: v.optional(v.string()),
      }),
    ),
  ),
  searchable: v.optional(v.boolean()),
  indexed: v.optional(v.boolean()),
});

const cardBodyPolicy = v.object({
  allowEmpty: v.boolean(),
  maxBlocks: v.optional(v.number()),
});

const cardMetaPolicy = v.object({
  titleRequired: v.boolean(),
});

const capabilityBinding = v.union(
  v.object({ kind: v.literal("field"), path: v.string() }),
  v.object({ kind: v.literal("system"), path: v.string() }),
  v.object({ kind: v.literal("meta"), path: v.string() }),
  v.object({ kind: v.literal("body") }),
  v.object({ kind: v.literal("tag") }),
);

const hierarchyPolicy = v.object({
  supportsChildren: v.boolean(),
  maxDepth: v.optional(v.number()),
  allowedChildTypeKeys: v.optional(v.array(v.string())),
});

const cardTypeManifest = v.object({
  pluginId: v.string(),
  typeKey: v.string(),
  schemaVersion: v.number(),
  fields: v.object({
    core: v.array(cardFieldManifest),
  }),
  bodyPolicy: cardBodyPolicy,
  metaPolicy: cardMetaPolicy,
  automationExposedFields: v.array(v.string()),
  queryIndexHints: v.array(
    v.object({
      namespace: fieldNamespace,
      fieldKey: v.string(),
      valueType: scalarFieldType,
    }),
  ),
  capabilities: v.optional(
    v.object({
      provides: v.record(v.string(), capabilityBinding),
    }),
  ),
  hierarchyPolicy: v.optional(hierarchyPolicy),
});

const blocknoteCardBody = v.object({
  type: v.literal("blocknote"),
  content: v.array(v.any()),
});

const mentionRange = v.object({
  userId: v.string(),
  label: v.string(),
  start: v.number(),
  end: v.number(),
});

const commentReactionKey = v.union(
  v.literal("thumbs_up"),
  v.literal("heart"),
  v.literal("eyes"),
  v.literal("rocket"),
  v.literal("laugh"),
);

const notificationKind = v.union(
  v.literal("mention_comment"),
  v.literal("mention_body"),
);

const boardViewInstanceMode = v.union(v.literal("shared"), v.literal("private"));

const cardChangeEventKind = v.union(
  v.literal("new_card"),
  v.literal("title"),
  v.literal("description"),
  v.literal("property"),
  v.literal("tag"),
  v.literal("move"),
  v.literal("delete"),
);

const activityProjectionEntry = v.object({
  kind: cardChangeEventKind,
  propertyKeys: v.optional(v.array(v.string())),
});

const cardRelationType = v.union(
  v.literal("relates_to"),
  v.literal("blocked_by"),
  v.literal("references"),
);

const behaviorTargetType = v.union(
  v.literal("workspace"),
  v.literal("boardType"),
  v.literal("board"),
  v.literal("cardType"),
  v.literal("tag"),
);

const behaviorEventName = v.union(
  v.literal("card.created"),
  v.literal("card.updated"),
  v.literal("card.moved"),
  v.literal("card.deleted"),
  v.literal("tag.applied"),
  v.literal("property.changed"),
);

const behaviorAction = v.union(
  v.object({
    type: v.literal("set_property"),
    propertyKey: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
  }),
  v.object({
    type: v.literal("set_current_date"),
    propertyKey: v.string(),
  }),
  v.object({
    type: v.literal("add_tag"),
    tagKey: v.string(),
  }),
  v.object({
    type: v.literal("remove_tag"),
    tagKey: v.string(),
  }),
  v.object({
    type: v.literal("move_status"),
    statusKey: v.string(),
  }),
  v.object({
    type: v.literal("notify"),
    recipientPropertyKey: v.optional(v.string()),
    recipientUserId: v.optional(v.string()),
    message: v.string(),
  }),
  v.object({
    type: v.literal("stop"),
  }),
);

const traceStep = v.object({
  ruleId: v.string(),
  ruleName: v.string(),
  action: v.string(),
  status: v.union(v.literal("ok"), v.literal("skipped"), v.literal("error")),
  detail: v.optional(v.string()),
});

const compiledBehaviorProgram = v.object({
  version: v.number(),
  rules: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      trigger: v.object({
        eventName: behaviorEventName,
        propertyKey: v.optional(v.string()),
      }),
      branches: v.array(
        v.object({
          condition: v.optional(v.any()),
          actions: v.array(behaviorAction),
        }),
      ),
    }),
  ),
});

const simpleBehaviorTrigger = v.union(
  v.object({
    eventName: v.literal("card.created"),
  }),
  v.object({
    eventName: v.literal("card.moved"),
  }),
  v.object({
    eventName: v.literal("tag.applied"),
  }),
);

const simpleBehaviorAction = v.union(
  v.object({
    type: v.literal("set_property"),
    propertyKey: v.string(),
    value: v.union(v.string(), v.number(), v.boolean(), v.null()),
  }),
  v.object({
    type: v.literal("set_current_date"),
    propertyKey: v.string(),
  }),
  v.object({
    type: v.literal("add_tag"),
    tagKey: v.string(),
  }),
  v.object({
    type: v.literal("remove_tag"),
    tagKey: v.string(),
  }),
  v.object({
    type: v.literal("move_status"),
    statusKey: v.string(),
  }),
  v.object({
    type: v.literal("notify"),
    recipientPropertyKey: v.optional(v.string()),
    recipientUserId: v.optional(v.string()),
    message: v.string(),
  }),
);

const simpleBehaviorRuleConfig = v.object({
  name: v.string(),
  trigger: simpleBehaviorTrigger,
  action: simpleBehaviorAction,
  targetType: behaviorTargetType,
  targetId: v.string(),
  priority: v.number(),
  enabled: v.boolean(),
});

export default defineSchema({
  ...authTables,

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role,
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_user", ["userId"]),

  workspaceInvites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    emailNormalized: v.optional(v.string()),
    role: inviteRole,
    token: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_email_normalized", ["workspaceId", "emailNormalized"]),

  workspaceExtensions: defineTable({
    workspaceId: v.id("workspaces"),
    pluginId: v.string(),
    status: extensionStatus,
    config: v.optional(v.any()),
    installedBy: v.string(),
    installedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_plugin", ["workspaceId", "pluginId"]),

  boardTypes: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    lifecycleConfig: v.object({
      statuses: v.array(lifecycleStatus),
      initialStatusKey: v.string(),
    }),
    defaultViewIds: v.array(v.string()),
    defaultCardTypeKey: v.string(),
    templateSource: v.optional(
      v.object({
        pluginId: v.string(),
        templateId: v.string(),
        version: v.number(),
      }),
    ),
    viewDefaults: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_key", ["workspaceId", "key"]),

  cardTypeRegistry: defineTable({
    workspaceId: v.id("workspaces"),
    pluginId: v.string(),
    typeKey: v.string(),
    schemaVersion: v.number(),
    manifest: cardTypeManifest,
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("deprecated"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_type_key", ["workspaceId", "typeKey"])
    .index("by_workspace_plugin", ["workspaceId", "pluginId"]),

  workspaceCardTypeCustomFields: defineTable({
    workspaceId: v.id("workspaces"),
    typeKey: v.string(),
    key: v.string(),
    label: v.string(),
    valueType: scalarFieldType,
    propertyType: v.optional(v.string()),
    required: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
    enumValues: v.optional(v.array(v.string())),
    enumOptions: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          color: v.optional(v.string()),
        }),
      ),
    ),
    searchable: v.optional(v.boolean()),
    indexed: v.optional(v.boolean()),
    status: v.union(v.literal("active"), v.literal("deleted")),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_type", ["workspaceId", "typeKey"])
    .index("by_workspace_type_key", ["workspaceId", "typeKey", "key"]),

  tagDefinitions: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_key", ["workspaceId", "key"]),

  boards: defineTable({
    workspaceId: v.id("workspaces"),
    boardTypeId: v.id("boardTypes"),
    name: v.string(),
    slug: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    primaryViewId: v.optional(v.string()),
    boardSettings: v.optional(v.any()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_slug", ["workspaceId", "slug"])
    .index("by_workspace_board_type", ["workspaceId", "boardTypeId"]),

  boardViews: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    viewId: v.string(),
    instanceId: v.optional(v.string()),
    definitionViewId: v.optional(v.string()),
    instanceMode: v.optional(boardViewInstanceMode),
    pluginId: v.optional(v.string()),
    kind: v.string(),
    label: v.string(),
    orderKey: v.string(),
    isDefault: v.boolean(),
    config: v.optional(v.any()),
  })
    .index("by_board", ["boardId"])
    .index("by_workspace_board_view", ["workspaceId", "boardId", "viewId"])
    .index("by_workspace_board_instance", ["workspaceId", "boardId", "instanceId"]),

  boardMembershipStates: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    userId: v.string(),
    lastSeenAt: v.number(),
    lastHeartbeatAt: v.optional(v.number()),
  })
    .index("by_workspace_and_board_and_user", [
      "workspaceId",
      "boardId",
      "userId",
    ])
    .index("by_workspace_and_user_and_board", [
      "workspaceId",
      "userId",
      "boardId",
    ])
    .index("by_workspace_and_board", ["workspaceId", "boardId"]),

  boardHeartbeats: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    userId: v.string(),
    lastHeartbeatAt: v.number(),
  })
    .index("by_workspace_and_board_and_user", [
      "workspaceId",
      "boardId",
      "userId",
    ])
    .index("by_workspace_and_board", ["workspaceId", "boardId"]),

  cardSeenStates: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    userId: v.string(),
    seenAt: v.number(),
  })
    .index("by_workspace_and_board_and_user_and_card", [
      "workspaceId",
      "boardId",
      "userId",
      "cardId",
    ])
    .index("by_workspace_and_card_and_user", [
      "workspaceId",
      "cardId",
      "userId",
    ])
    .index("by_workspace_and_board_and_card", [
      "workspaceId",
      "boardId",
      "cardId",
    ]),

  cards: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    scopeId: v.optional(v.string()),
    parentId: v.optional(v.id("cards")),
    typeKey: v.string(),
    typeSchemaVersion: v.number(),
    meta: v.object({
      title: v.string(),
    }),
    statusKey: v.string(),
    orderKey: v.string(),
    fields: v.object({
      core: v.record(v.string(), v.any()),
      custom: v.record(v.string(), v.any()),
    }),
    relations: v.array(
      v.object({
        type: cardRelationType,
        targetCardId: v.id("cards"),
      }),
    ),
    tagIds: v.array(v.id("tagDefinitions")),
    body: blocknoteCardBody,
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_board", ["boardId"])
    .index("by_board_scope", ["boardId", "scopeId"])
    .index("by_parent", ["parentId"])
    .index("by_board_parent", ["boardId", "parentId"])
    .index("by_board_scope_parent", ["boardId", "scopeId", "parentId"])
    .index("by_board_status", ["boardId", "statusKey"])
    .index("by_board_scope_status", ["boardId", "scopeId", "statusKey"])
    .index("by_board_type_key", ["boardId", "typeKey"])
    .index("by_type_key", ["workspaceId", "typeKey"])
    .searchIndex("search_title", {
      searchField: "meta.title",
      filterFields: ["workspaceId", "boardId", "scopeId"],
    }),

  workflowEvents: defineTable({
    eventId: v.string(),
    rootEventId: v.string(),
    parentEventId: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    actorId: v.string(),
    eventName: behaviorEventName,
    timestamp: v.number(),
    origin: v.union(v.literal("user"), v.literal("automation")),
    depth: v.number(),
    statusKey: v.optional(v.string()),
    previousStatusKey: v.optional(v.string()),
    nextStatusKey: v.optional(v.string()),
    typeKey: v.optional(v.string()),
    cardTypeId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    previousTagIds: v.optional(v.array(v.string())),
    tagKey: v.optional(v.string()),
    previousColumnId: v.optional(v.string()),
    nextColumnId: v.optional(v.string()),
    changedPropertyKeys: v.optional(v.array(v.string())),
    previousProperties: v.optional(v.record(v.string(), v.any())),
    patch: v.optional(v.record(v.string(), v.any())),
    activityEntries: v.optional(v.array(activityProjectionEntry)),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_event_id", ["workspaceId", "eventId"])
    .index("by_workspace_created_at", ["workspaceId", "timestamp"])
    .index("by_workspace_board_created_at", ["workspaceId", "boardId", "timestamp"])
    .index("by_workspace_card_created_at", ["workspaceId", "cardId", "timestamp"]),

  cardChangeEvents: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    actorId: v.string(),
    kind: cardChangeEventKind,
    propertyKeys: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_workspace_created_at", ["workspaceId", "createdAt"])
    .index("by_workspace_board_created_at", ["workspaceId", "boardId", "createdAt"])
    .index("by_workspace_card_created_at", ["workspaceId", "cardId", "createdAt"]),

  boardDigests: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    latestExternalChangeAt: v.number(),
    latestExternalActorId: v.optional(v.string()),
    latestExternalCardId: v.optional(v.id("cards")),
    latestExternalKind: v.optional(cardChangeEventKind),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_board", ["workspaceId", "boardId"]),

  cardDigests: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    latestExternalChangeAt: v.number(),
    latestExternalActorId: v.optional(v.string()),
    latestExternalKind: v.optional(cardChangeEventKind),
  })
    .index("by_workspace_and_board", ["workspaceId", "boardId"])
    .index("by_workspace_and_card", ["workspaceId", "cardId"]),

  behaviorPacks: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    allowedTargetTypes: v.array(behaviorTargetType),
    source: v.string(),
    compiledProgram: v.optional(compiledBehaviorProgram),
    compileDiagnostics: v.array(
      v.object({
        level: v.union(v.literal("error"), v.literal("warning")),
        message: v.string(),
        line: v.optional(v.number()),
        column: v.optional(v.number()),
        ruleName: v.optional(v.string()),
      }),
    ),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    authoringMode: v.optional(v.union(v.literal("simple"), v.literal("dsl"))),
    simpleRuleConfig: v.optional(simpleBehaviorRuleConfig),
    version: v.number(),
    failFast: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastCompiledAt: v.optional(v.number()),
    lastActivatedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_key", ["workspaceId", "key"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  behaviorBindings: defineTable({
    workspaceId: v.id("workspaces"),
    targetType: behaviorTargetType,
    targetId: v.string(),
    behaviorPackId: v.id("behaviorPacks"),
    priority: v.number(),
    enabled: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_target", ["workspaceId", "targetType", "targetId"])
    .index("by_pack", ["behaviorPackId"]),

  automationRuns: defineTable({
    workspaceId: v.id("workspaces"),
    workflowEventId: v.id("workflowEvents"),
    eventId: v.string(),
    rootEventId: v.string(),
    parentEventId: v.optional(v.string()),
    eventName: behaviorEventName,
    cardId: v.id("cards"),
    boardId: v.id("boards"),
    actorId: v.string(),
    origin: v.union(v.literal("user"), v.literal("automation")),
    eventRef: v.object({
      boardId: v.string(),
      cardId: v.string(),
      actorId: v.string(),
    }),
    depth: v.number(),
    status: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("partial"),
      v.literal("guard_stopped"),
    ),
    matchedRuleIds: v.array(v.string()),
    actionsPlanned: v.number(),
    actionsExecuted: v.number(),
    durationMs: v.number(),
    guardReason: v.optional(v.string()),
    error: v.optional(v.string()),
    trace: v.array(traceStep),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_event", ["workspaceId", "eventName"])
    .index("by_workspace_created_at", ["workspaceId", "createdAt"])
    .index("by_card", ["workspaceId", "cardId"])
    .index("by_board", ["workspaceId", "boardId"]),

  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    recipientUserId: v.string(),
    actorId: v.string(),
    boardId: v.optional(v.id("boards")),
    cardId: v.optional(v.id("cards")),
    viewInstanceId: v.optional(v.string()),
    workflowEventId: v.optional(v.id("workflowEvents")),
    kind: v.optional(notificationKind),
    commentId: v.optional(v.id("cardComments")),
    previewText: v.optional(v.string()),
    message: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_recipient_created_at", [
      "workspaceId",
      "recipientUserId",
      "createdAt",
    ])
    .index("by_workspace_recipient_read_at", [
      "workspaceId",
      "recipientUserId",
      "readAt",
    ]),

  cardComments: defineTable({
    workspaceId: v.id("workspaces"),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    authorUserId: v.string(),
    bodyText: v.string(),
    mentions: v.array(mentionRange),
    reactionCounts: v.record(v.string(), v.number()),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_board_card_created_at", [
      "workspaceId",
      "boardId",
      "cardId",
      "createdAt",
    ])
    .index("by_workspace_card_created_at", ["workspaceId", "cardId", "createdAt"]),

  commentReactions: defineTable({
    workspaceId: v.id("workspaces"),
    commentId: v.id("cardComments"),
    userId: v.string(),
    emoji: commentReactionKey,
    createdAt: v.number(),
  })
    .index("by_workspace_comment", ["workspaceId", "commentId"])
    .index("by_workspace_comment_user_emoji", [
      "workspaceId",
      "commentId",
      "userId",
      "emoji",
    ]),
});
