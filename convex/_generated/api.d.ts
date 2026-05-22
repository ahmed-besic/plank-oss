/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as behaviors from "../behaviors.js";
import type * as boardTypes from "../boardTypes.js";
import type * as boards from "../boards.js";
import type * as cardTypeRegistry from "../cardTypeRegistry.js";
import type * as cardTypes from "../cardTypes.js";
import type * as cards from "../cards.js";
import type * as comments from "../comments.js";
import type * as features_collaboration_activity from "../features/collaboration/activity.js";
import type * as features_collaboration_cleanup from "../features/collaboration/cleanup.js";
import type * as features_collaboration_comments from "../features/collaboration/comments.js";
import type * as features_collaboration_mentions from "../features/collaboration/mentions.js";
import type * as features_collaboration_notifications from "../features/collaboration/notifications.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_behaviors_actions from "../lib/behaviors/actions.js";
import type * as lib_behaviors_compiler from "../lib/behaviors/compiler.js";
import type * as lib_behaviors_evaluator from "../lib/behaviors/evaluator.js";
import type * as lib_behaviors_guards from "../lib/behaviors/guards.js";
import type * as lib_behaviors_parser from "../lib/behaviors/parser.js";
import type * as lib_behaviors_resolveBindings from "../lib/behaviors/resolveBindings.js";
import type * as lib_behaviors_runtime from "../lib/behaviors/runtime.js";
import type * as lib_behaviors_types from "../lib/behaviors/types.js";
import type * as lib_behaviors_validator from "../lib/behaviors/validator.js";
import type * as lib_behaviors_validators from "../lib/behaviors/validators.js";
import type * as lib_boardViewConfig from "../lib/boardViewConfig.js";
import type * as lib_cardRuntime from "../lib/cardRuntime.js";
import type * as lib_cards from "../lib/cards.js";
import type * as lib_loaders_boardCards from "../lib/loaders/boardCards.js";
import type * as lib_loaders_boardCore from "../lib/loaders/boardCore.js";
import type * as lib_loaders_boardViews from "../lib/loaders/boardViews.js";
import type * as lib_loaders_collaboration from "../lib/loaders/collaboration.js";
import type * as lib_loaders_workspaceOverview from "../lib/loaders/workspaceOverview.js";
import type * as lib_mentions from "../lib/mentions.js";
import type * as lib_persistedState from "../lib/persistedState.js";
import type * as lib_pluginDiagnostics from "../lib/pluginDiagnostics.js";
import type * as lib_pluginServerApi from "../lib/pluginServerApi.js";
import type * as lib_plugins from "../lib/plugins.js";
import type * as lib_slugs from "../lib/slugs.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations_phase2a from "../migrations/phase2a.js";
import type * as migrations_phase2b from "../migrations/phase2b.js";
import type * as migrations_relationProjection from "../migrations/relationProjection.js";
import type * as notifications from "../notifications.js";
import type * as pluginDiagnostics from "../pluginDiagnostics.js";
import type * as plugins from "../plugins.js";
import type * as search from "../search.js";
import type * as tags from "../tags.js";
import type * as test_helpers from "../test_helpers.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  behaviors: typeof behaviors;
  boardTypes: typeof boardTypes;
  boards: typeof boards;
  cardTypeRegistry: typeof cardTypeRegistry;
  cardTypes: typeof cardTypes;
  cards: typeof cards;
  comments: typeof comments;
  "features/collaboration/activity": typeof features_collaboration_activity;
  "features/collaboration/cleanup": typeof features_collaboration_cleanup;
  "features/collaboration/comments": typeof features_collaboration_comments;
  "features/collaboration/mentions": typeof features_collaboration_mentions;
  "features/collaboration/notifications": typeof features_collaboration_notifications;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/behaviors/actions": typeof lib_behaviors_actions;
  "lib/behaviors/compiler": typeof lib_behaviors_compiler;
  "lib/behaviors/evaluator": typeof lib_behaviors_evaluator;
  "lib/behaviors/guards": typeof lib_behaviors_guards;
  "lib/behaviors/parser": typeof lib_behaviors_parser;
  "lib/behaviors/resolveBindings": typeof lib_behaviors_resolveBindings;
  "lib/behaviors/runtime": typeof lib_behaviors_runtime;
  "lib/behaviors/types": typeof lib_behaviors_types;
  "lib/behaviors/validator": typeof lib_behaviors_validator;
  "lib/behaviors/validators": typeof lib_behaviors_validators;
  "lib/boardViewConfig": typeof lib_boardViewConfig;
  "lib/cardRuntime": typeof lib_cardRuntime;
  "lib/cards": typeof lib_cards;
  "lib/loaders/boardCards": typeof lib_loaders_boardCards;
  "lib/loaders/boardCore": typeof lib_loaders_boardCore;
  "lib/loaders/boardViews": typeof lib_loaders_boardViews;
  "lib/loaders/collaboration": typeof lib_loaders_collaboration;
  "lib/loaders/workspaceOverview": typeof lib_loaders_workspaceOverview;
  "lib/mentions": typeof lib_mentions;
  "lib/persistedState": typeof lib_persistedState;
  "lib/pluginDiagnostics": typeof lib_pluginDiagnostics;
  "lib/pluginServerApi": typeof lib_pluginServerApi;
  "lib/plugins": typeof lib_plugins;
  "lib/slugs": typeof lib_slugs;
  maintenance: typeof maintenance;
  "migrations/phase2a": typeof migrations_phase2a;
  "migrations/phase2b": typeof migrations_phase2b;
  "migrations/relationProjection": typeof migrations_relationProjection;
  notifications: typeof notifications;
  pluginDiagnostics: typeof pluginDiagnostics;
  plugins: typeof plugins;
  search: typeof search;
  tags: typeof tags;
  test_helpers: typeof test_helpers;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
