import type { GuardState } from "./types";

export const MAX_DEPTH = 3;
export const MAX_RULES_PER_EVENT = 50;
export const MAX_ACTIONS_PER_RUN = 200;
export const MAX_RUNTIME_MS = 200;

export type GuardStopReason =
  | "depth_exceeded"
  | "rules_exceeded"
  | "actions_exceeded"
  | "timeout";

export function createGuardState(): GuardState {
  return {
    startedAt: Date.now(),
    actionsPlanned: 0,
    actionsExecuted: 0,
    matchedRules: 0,
  };
}

export function checkGuards({
  depth,
  state,
}: {
  depth: number;
  state: GuardState;
}): GuardStopReason | null {
  if (depth > MAX_DEPTH) {
    return "depth_exceeded";
  }
  if (state.matchedRules > MAX_RULES_PER_EVENT) {
    return "rules_exceeded";
  }
  if (state.actionsPlanned > MAX_ACTIONS_PER_RUN || state.actionsExecuted > MAX_ACTIONS_PER_RUN) {
    return "actions_exceeded";
  }
  if (Date.now() - state.startedAt > MAX_RUNTIME_MS) {
    return "timeout";
  }
  return null;
}
