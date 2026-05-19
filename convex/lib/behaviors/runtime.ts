import type { CardEventPayload, CompiledBehaviorProgram, TraceStep } from "@plank/domain";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { executePlannedActions, type QueuedCardEvent } from "./actions";
import { checkGuards, createGuardState, type GuardStopReason } from "./guards";
import { evaluateProgram } from "./evaluator";
import { resolveBindingsForCardEvent } from "./resolveBindings";

function mapGuardReason(reason: GuardStopReason) {
  switch (reason) {
    case "depth_exceeded":
      return "Depth exceeded";
    case "rules_exceeded":
      return "Rule budget exceeded";
    case "actions_exceeded":
      return "Action budget exceeded";
    case "timeout":
      return "Runtime timeout";
  }
}

function ensureProgram(program: unknown): CompiledBehaviorProgram | null {
  if (!program || typeof program !== "object") {
    return null;
  }
  const value = program as { version?: unknown; rules?: unknown };
  if (typeof value.version !== "number" || !Array.isArray(value.rules)) {
    return null;
  }
  return value as CompiledBehaviorProgram;
}

export async function runBehaviorRuntimeForEvent({
  ctx,
  workspaceId,
  event,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  event: CardEventPayload;
}) {
  const startedAt = Date.now();
  if (!event.workflowEventId) {
    throw new Error("workflowEventId is required for behavior runtime");
  }
  const depth = event.depth ?? 0;
  const state = createGuardState();
  const trace: TraceStep[] = [];
  const matchedRuleIds: string[] = [];
  const emittedEvents: QueuedCardEvent[] = [];

  let status: "ok" | "error" | "partial" | "guard_stopped" = "ok";
  let guardReason: string | undefined;
  let errorMessage: string | undefined;

  try {
    const board = await ctx.db.get(event.boardId as Id<"boards">);
    if (!board || board.workspaceId !== workspaceId) {
      throw new Error("Board not found for behavior runtime");
    }

    const card = await ctx.db.get(event.cardId as Id<"cards">);
    const resolvedBindings = await resolveBindingsForCardEvent({
      ctx,
      workspaceId,
      board,
      card: {
        id: event.cardId,
        typeKey:
          (card ? card.typeKey : undefined) ??
          (typeof event.typeKey === "string" ? event.typeKey : undefined) ??
          (typeof event.cardTypeId === "string" ? event.cardTypeId : undefined),
        tagIds: card?.tagIds ?? event.tagIds,
      },
    });

    for (const resolved of resolvedBindings) {
      const program = ensureProgram(resolved.pack.compiledProgram);
      if (!program) {
        continue;
      }

      const evaluation = evaluateProgram({
        event,
        program,
      });

      state.matchedRules += evaluation.matchedRuleIds.length;
      state.actionsPlanned += evaluation.actions.length;
      matchedRuleIds.push(...evaluation.matchedRuleIds);

      const guardError = checkGuards({ depth, state });
      if (guardError) {
        status = "guard_stopped";
        guardReason = mapGuardReason(guardError);
        trace.push({
          ruleId: "guard",
          ruleName: "runtime_guard",
          action: "stop",
          status: "error",
          detail: guardReason,
        });
        break;
      }

      if (!card) {
        for (const planned of evaluation.actions) {
          if (planned.action.type === "notify") {
            trace.push({
              ruleId: planned.ruleId,
              ruleName: planned.ruleName,
              action: planned.action.recipientPropertyKey
                ? `notify ${planned.action.recipientPropertyKey}: ${planned.action.message}`
                : planned.action.recipientUserId
                  ? `notify user ${planned.action.recipientUserId}: ${planned.action.message}`
                  : `notify ${planned.action.message}`,
              status: "skipped",
              detail: "card not available for notify recipient resolution",
            });
            continue;
          }
          if (planned.action.type === "stop") {
            state.actionsExecuted += 1;
            trace.push({
              ruleId: planned.ruleId,
              ruleName: planned.ruleName,
              action: "stop",
              status: "ok",
              detail: "execution stopped",
            });
            break;
          }
        }
        continue;
      }

      const execution = await executePlannedActions({
        ctx,
        card,
        board,
        planned: evaluation.actions,
        failFast: resolved.pack.failFast,
        eventContext: {
          actorId: event.actorId,
          origin: "automation",
          depth: depth + 1,
          rootEventId: event.rootEventId ?? event.eventId,
          parentEventId: event.eventId,
          workflowEventId: event.workflowEventId,
        },
      });

      state.actionsExecuted += execution.actionsExecuted;
      trace.push(...execution.trace);
      emittedEvents.push(...execution.emittedEvents);

      if (execution.trace.some((step) => step.status === "error")) {
        status = status === "ok" ? "partial" : status;
        if (resolved.pack.failFast) {
          break;
        }
      }

      if (execution.stop) {
        break;
      }

      const guardAfterExecution = checkGuards({ depth, state });
      if (guardAfterExecution) {
        status = "guard_stopped";
        guardReason = mapGuardReason(guardAfterExecution);
        break;
      }
    }
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown runtime error";
  }

  await ctx.db.insert("automationRuns", {
    workspaceId,
    workflowEventId: event.workflowEventId as Id<"workflowEvents">,
    eventId: event.eventId,
    rootEventId: event.rootEventId ?? event.eventId,
    parentEventId: event.parentEventId,
    eventName: event.name,
    cardId: event.cardId as Id<"cards">,
    boardId: event.boardId as Id<"boards">,
    actorId: event.actorId,
    origin: event.origin ?? "user",
    eventRef: {
      boardId: event.boardId,
      cardId: event.cardId,
      actorId: event.actorId,
    },
    depth,
    status,
    matchedRuleIds,
    actionsPlanned: state.actionsPlanned,
    actionsExecuted: state.actionsExecuted,
    durationMs: Date.now() - startedAt,
    guardReason,
    error: errorMessage,
    trace,
    createdAt: Date.now(),
  });

  return {
    emittedEvents,
  };
}
