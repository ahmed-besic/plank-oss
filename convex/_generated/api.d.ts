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
import type * as lib_cardRuntime from "../lib/cardRuntime.js";
import type * as lib_cards from "../lib/cards.js";
import type * as lib_mentions from "../lib/mentions.js";
import type * as lib_plugins from "../lib/plugins.js";
import type * as lib_slugs from "../lib/slugs.js";
import type * as migrations_phase2a from "../migrations/phase2a.js";
import type * as migrations_phase2b from "../migrations/phase2b.js";
import type * as notifications from "../notifications.js";
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
  "lib/cardRuntime": typeof lib_cardRuntime;
  "lib/cards": typeof lib_cards;
  "lib/mentions": typeof lib_mentions;
  "lib/plugins": typeof lib_plugins;
  "lib/slugs": typeof lib_slugs;
  "migrations/phase2a": typeof migrations_phase2a;
  "migrations/phase2b": typeof migrations_phase2b;
  notifications: typeof notifications;
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
