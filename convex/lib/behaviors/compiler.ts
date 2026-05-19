import type {
  BehaviorCompileDiagnostic,
  CompiledBehaviorProgram,
} from "@plank/domain";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { parseBehaviorSource } from "./parser";
import { validateParsedRules } from "./validator";
import type { CompileResult, ParsedBehaviorRule, ValidatorContext } from "./types";

type AnyCtx = QueryCtx | MutationCtx;

async function buildValidatorContext({
  ctx,
  workspaceId,
}: {
  ctx: AnyCtx;
  workspaceId: Id<"workspaces">;
}): Promise<ValidatorContext> {
  const [boardTypes, registryTypes, customFields, tags, members] = await Promise.all([
    ctx.db
      .query("boardTypes")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("tagDefinitions")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
  ]);

  const statusKeys = new Set(
    boardTypes.flatMap((boardType) =>
      boardType.lifecycleConfig.statuses.map((status) => status.key),
    ),
  );
  const propertyKeys = new Set(
    [
      ...registryTypes.flatMap((cardType) =>
        cardType.manifest.fields.core.map((property) => property.key),
      ),
      ...customFields.filter((field) => field.status === "active").map((field) => field.key),
    ],
  );
  const tagKeys = new Set(tags.map((tag) => tag.key));
  const memberUserIds = new Set(members.map((member) => member.userId));

  return {
    workspaceId,
    statusKeys,
    propertyKeys,
    tagKeys,
    memberUserIds,
  };
}

function toProgram(rules: ParsedBehaviorRule[]): CompiledBehaviorProgram {
  return {
    version: 1,
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      trigger: {
        eventName: rule.trigger.eventName,
        propertyKey: rule.trigger.propertyKey,
      },
      branches: rule.branches.map((branch) => ({
        condition: branch.condition,
        actions: [...branch.actions],
      })),
    })),
  };
}

function mergeDiagnostics(
  parserDiagnostics: BehaviorCompileDiagnostic[],
  validatorDiagnostics: BehaviorCompileDiagnostic[],
): BehaviorCompileDiagnostic[] {
  return [...parserDiagnostics, ...validatorDiagnostics];
}

export async function compileBehaviorSource({
  ctx,
  workspaceId,
  source,
}: {
  ctx: AnyCtx;
  workspaceId: Id<"workspaces">;
  source: string;
}): Promise<CompileResult> {
  const parseResult = parseBehaviorSource(source);
  const context = await buildValidatorContext({ ctx, workspaceId });
  const validatorDiagnostics = validateParsedRules({
    rules: parseResult.rules,
    context,
  });

  const diagnostics = mergeDiagnostics(parseResult.diagnostics, validatorDiagnostics);
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.level === "error");

  if (hasErrors) {
    return {
      diagnostics,
    };
  }

  return {
    diagnostics,
    program: toProgram(parseResult.rules),
  };
}
